import json
import queue
import sys
import threading
import uuid
from collections.abc import Callable, Iterator, Mapping
from pathlib import Path
from typing import Any

import cv2

from app.core.database import SessionLocal
from app.models.event import Event
from app.services.annotation import draw_detections
from app.services.detector import Detector
from app.services.intrusion import Coordinates
from app.services.intrusion_tracker import IntrusionTracker


DEFAULT_CAMERA_FPS = 30.0
UNTRACKED_EVENT_COOLDOWN_SECONDS = 10.0
CAMERA_START_TIMEOUT_SECONDS = 5.0
CAMERA_EVENT_DIR = Path("outputs/cameras/events")


def open_webcam_capture(
    index: int,
    capture_factory: Callable[[int, Any | None], Any] = cv2.VideoCapture,
    *,
    platform: str | None = None,
) -> Any:
    """Open a webcam capture that is confirmed to deliver real frames.

    On Windows, DirectShow (``cv2.CAP_DSHOW``) is attempted first because the
    default Media Foundation backend can report that a laptop webcam opened
    while still failing to return frames. Every attempt must both open and
    return at least one real frame; failed attempts are released before
    falling back to the default OpenCV backend.
    """
    actual_platform = sys.platform if platform is None else platform
    candidates = (
        [(cv2.CAP_DSHOW, "DirectShow"), (None, "default")]
        if actual_platform == "win32"
        else [(None, "default")]
    )
    last_error: Exception | None = None
    for backend, backend_name in candidates:
        capture = (
            capture_factory(index, backend)
            if backend is not None
            else capture_factory(index)
        )
        try:
            if not capture.isOpened():
                raise RuntimeError(
                    f"OpenCV could not open webcam index {index} via the "
                    f"{backend_name} backend."
                )
            ok, frame = capture.read()
            if not ok or frame is None:
                raise RuntimeError(
                    f"Webcam index {index} opened via the {backend_name} backend "
                    "but did not return a frame."
                )
            return capture
        except Exception as exc:
            last_error = exc
            try:
                capture.release()
            except Exception:
                pass
    raise RuntimeError(
        str(last_error) or f"Could not open webcam index {index}."
    )


class LiveCameraMonitor:
    def __init__(
        self,
        camera: Mapping[str, Any],
        zone: Coordinates | None,
        *,
        event_callback: Callable[[int, dict], None] | None = None,
        capture_factory: Callable[[int, Any | None], Any] = cv2.VideoCapture,
        detector_factory: Callable[[], Any] = Detector,
        session_factory=SessionLocal,
        output_dir: str | Path = CAMERA_EVENT_DIR,
    ) -> None:
        self.camera = dict(camera)
        self.camera_id = int(camera["id"])
        self._zone = dict(zone) if zone is not None else None
        self._event_callback = event_callback
        self._capture_factory = capture_factory
        self._detector_factory = detector_factory
        self._session_factory = session_factory
        self._output_dir = Path(output_dir)

        self._state_lock = threading.RLock()
        self._zone_lock = threading.Lock()
        self._frame_condition = threading.Condition()
        self._stop_event = threading.Event()
        self._ready_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._tracker: IntrusionTracker | None = None
        self._latest_jpeg: bytes | None = None
        self._frame_version = 0
        self._status = "stopped"
        self._error: str | None = None
        self._session_id: str | None = None
        self._event_sequence = 0
        self._frame_index = 0

    def status(self) -> dict:
        with self._state_lock:
            return {
                "camera_id": self.camera_id,
                "status": self._status,
                "error": self._error,
                "session_id": self._session_id,
                "frame": self._frame_index,
                "event_count": self._event_sequence,
            }

    @property
    def is_running(self) -> bool:
        with self._state_lock:
            return self._status in {"starting", "running", "stopping"}

    def start(self, timeout: float = CAMERA_START_TIMEOUT_SECONDS) -> dict:
        with self._state_lock:
            if self._status in {"starting", "running"}:
                return self.status()
            self._status = "starting"
            self._error = None
            self._session_id = uuid.uuid4().hex
            self._event_sequence = 0
            self._frame_index = 0
        self._stop_event.clear()
        self._ready_event.clear()
        self._thread = threading.Thread(
            target=self._run,
            name=f"visionguard-camera-{self.camera_id}",
            daemon=True,
        )
        self._thread.start()
        if not self._ready_event.wait(timeout):
            self.stop()
            raise TimeoutError("Timed out while opening the webcam.")
        state = self.status()
        if state["status"] == "error":
            raise RuntimeError(state["error"] or "Could not start webcam monitoring.")
        return state

    def stop(self, timeout: float = 5.0) -> dict:
        with self._state_lock:
            if self._status in {"starting", "running"}:
                self._status = "stopping"
        self._stop_event.set()
        with self._frame_condition:
            self._frame_condition.notify_all()
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout)
        with self._state_lock:
            if thread is None or not thread.is_alive():
                if self._status != "error":
                    self._status = "stopped"
        return self.status()

    def update_zone(self, zone: Coordinates) -> None:
        with self._zone_lock:
            self._zone = dict(zone)
            if self._tracker is not None:
                self._tracker.reset(self._zone)

    def mjpeg_frames(self) -> Iterator[bytes]:
        version = -1
        while True:
            with self._frame_condition:
                self._frame_condition.wait_for(
                    lambda: self._frame_version != version or not self.is_running,
                    timeout=2.0,
                )
                jpeg = self._latest_jpeg
                version = self._frame_version
            if jpeg is not None:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    + f"Content-Length: {len(jpeg)}\r\n\r\n".encode()
                    + jpeg
                    + b"\r\n"
                )
            if not self.is_running:
                break

    def _run(self) -> None:
        capture = None
        try:
            capture = self._open_capture()
            if not capture.isOpened():
                raise RuntimeError(
                    f"Could not open webcam index {self.camera['webcam_index']}."
                )
            fps = float(capture.get(cv2.CAP_PROP_FPS) or DEFAULT_CAMERA_FPS)
            cooldown_frames = max(
                1,
                round(UNTRACKED_EVENT_COOLDOWN_SECONDS * fps),
            )
            detector = self._detector_factory()
            with self._zone_lock:
                self._tracker = IntrusionTracker(
                    self._zone,
                    cooldown_frames,
                    repeat_active_after_cooldown=False,
                    untracked_episode_mode=True,
                )
            with self._state_lock:
                self._status = "running"
            self._ready_event.set()

            while not self._stop_event.is_set():
                ok, frame = capture.read()
                if not ok:
                    raise RuntimeError("The webcam stopped returning frames.")

                detections = detector.detect_frame(frame)
                with self._zone_lock:
                    tracker = self._tracker
                    zone = dict(self._zone) if self._zone is not None else None
                    intrusion_result = tracker.process_frame(
                        detections,
                        self._frame_index,
                    )
                annotated = draw_detections(frame, detections, zone)

                for intrusion_event in intrusion_result["events"]:
                    saved_event = self._persist_event(annotated, intrusion_event)
                    if self._event_callback is not None:
                        self._event_callback(self.camera_id, saved_event)

                self._publish_frame(annotated)
                with self._state_lock:
                    self._frame_index += 1
        except Exception as exc:
            self._set_error(str(exc))
        finally:
            if capture is not None:
                capture.release()
            self._ready_event.set()
            with self._state_lock:
                if self._status != "error":
                    self._status = "stopped"
            with self._frame_condition:
                self._frame_condition.notify_all()

    def _open_capture(self):
        if self.camera.get("source_type") != "webcam":
            raise NotImplementedError("Only webcam cameras are supported in Phase 1.")
        return open_webcam_capture(
            int(self.camera["webcam_index"]),
            capture_factory=self._capture_factory,
        )

    def _publish_frame(self, frame) -> None:
        ok, encoded = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), 85],
        )
        if not ok:
            raise RuntimeError("Could not encode the webcam frame.")
        with self._frame_condition:
            self._latest_jpeg = encoded.tobytes()
            self._frame_version += 1
            self._frame_condition.notify_all()

    def _persist_event(self, annotated_frame, intrusion_event: Mapping[str, Any]) -> dict:
        self._output_dir.mkdir(parents=True, exist_ok=True)
        snapshot_path = self._output_dir / (
            f"camera-{self.camera_id}-{uuid.uuid4().hex}.jpg"
        )
        if not cv2.imwrite(str(snapshot_path), annotated_frame):
            raise RuntimeError("Could not save the camera intrusion snapshot.")

        self._event_sequence += 1
        with self._zone_lock:
            zone_name = self._zone.get("name") if self._zone is not None else None
        db = self._session_factory()
        try:
            event = Event(
                event_type="intrusion",
                object_type="person",
                confidence=float(intrusion_event["confidence"]),
                image_path=snapshot_path.as_posix(),
                source="camera",
                track_id=intrusion_event.get("track_id"),
                frame=int(intrusion_event["frame"]),
                media_path=snapshot_path.as_posix(),
                job_id=self._session_id,
                event_sequence=self._event_sequence,
                zone_name=zone_name,
                video_time_seconds=None,
                camera_id=self.camera_id,
            )
            db.add(event)
            db.commit()
            db.refresh(event)
            return {
                "id": event.id,
                "event_type": event.event_type,
                "object_type": event.object_type,
                "confidence": event.confidence,
                "image_path": event.image_path,
                "source": event.source,
                "track_id": event.track_id,
                "frame": event.frame,
                "media_path": event.media_path,
                "job_id": event.job_id,
                "event_sequence": event.event_sequence,
                "zone_name": event.zone_name,
                "video_time_seconds": event.video_time_seconds,
                "camera_id": event.camera_id,
                "created_at": event.created_at,
            }
        except Exception:
            db.rollback()
            snapshot_path.unlink(missing_ok=True)
            raise
        finally:
            db.close()

    def _set_error(self, message: str) -> None:
        with self._state_lock:
            self._status = "error"
            self._error = message


class CameraMonitorManager:
    def __init__(self, monitor_factory=LiveCameraMonitor) -> None:
        self._monitor_factory = monitor_factory
        self._lock = threading.RLock()
        self._monitors: dict[int, LiveCameraMonitor] = {}
        self._subscribers: dict[int, set[queue.Queue]] = {}

    def start(self, camera: Mapping[str, Any], zone: Coordinates | None) -> dict:
        camera_id = int(camera["id"])
        with self._lock:
            existing = self._monitors.get(camera_id)
            if existing is not None and existing.is_running:
                return existing.status()
            monitor = self._monitor_factory(
                camera,
                zone,
                event_callback=self.publish_event,
            )
            self._monitors[camera_id] = monitor
        return monitor.start()

    def stop(self, camera_id: int) -> dict:
        with self._lock:
            monitor = self._monitors.get(camera_id)
        if monitor is None:
            return {
                "camera_id": camera_id,
                "status": "stopped",
                "error": None,
                "session_id": None,
                "frame": 0,
                "event_count": 0,
            }
        return monitor.stop()

    def status(self, camera_id: int) -> dict:
        with self._lock:
            monitor = self._monitors.get(camera_id)
        return monitor.status() if monitor is not None else self.stop(camera_id)

    def frames(self, camera_id: int) -> Iterator[bytes] | None:
        with self._lock:
            monitor = self._monitors.get(camera_id)
        if monitor is None or not monitor.is_running:
            return None
        return monitor.mjpeg_frames()

    def update_zone(self, camera_id: int, zone: Coordinates) -> None:
        with self._lock:
            monitor = self._monitors.get(camera_id)
        if monitor is not None:
            monitor.update_zone(zone)

    def stop_all(self) -> None:
        with self._lock:
            monitors = list(self._monitors.values())
        for monitor in monitors:
            monitor.stop()

    def publish_event(self, camera_id: int, event: dict) -> None:
        with self._lock:
            subscribers = list(self._subscribers.get(camera_id, set()))
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                try:
                    subscriber.get_nowait()
                    subscriber.put_nowait(event)
                except (queue.Empty, queue.Full):
                    pass

    def event_stream(self, camera_id: int) -> Iterator[str]:
        subscriber: queue.Queue = queue.Queue(maxsize=50)
        with self._lock:
            self._subscribers.setdefault(camera_id, set()).add(subscriber)
        try:
            yield "retry: 2000\n\n"
            while True:
                try:
                    event = subscriber.get(timeout=15.0)
                except queue.Empty:
                    yield ": keepalive\n\n"
                    continue
                payload = json.dumps(event, default=str)
                yield (
                    f"id: {event['id']}\n"
                    "event: intrusion\n"
                    f"data: {payload}\n\n"
                )
        finally:
            with self._lock:
                listeners = self._subscribers.get(camera_id)
                if listeners is not None:
                    listeners.discard(subscriber)
                    if not listeners:
                        self._subscribers.pop(camera_id, None)


camera_manager = CameraMonitorManager()
