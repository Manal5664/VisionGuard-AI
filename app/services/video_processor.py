from pathlib import Path

import cv2

from app.services.annotation import draw_detections
from app.services.detector import Detector
from app.services.intrusion import Coordinates, is_person_intrusion


VIDEO_CODEC = "mp4v"
OUTPUT_EXTENSION = ".mp4"
DEFAULT_EVENT_COOLDOWN_SECONDS = 10.0


class VideoProcessor:
    """Run YOLO detection + intrusion analysis on a video file.

    Frames can come from any source implementing ``read() -> (ok, frame)``,
    keeping the door open for later webcam/RTSP support.
    """

    def __init__(
        self,
        video_path: str | Path,
        output_path: str | Path,
        restricted_zone: Coordinates | None,
        detector: Detector | None = None,
        sample_every: int = 1,
        event_cooldown_seconds: float = DEFAULT_EVENT_COOLDOWN_SECONDS,
    ):
        self.video_path = Path(video_path)
        self.output_path = Path(output_path)
        self.restricted_zone = restricted_zone
        self.detector = detector or Detector()
        self.sample_every = max(1, int(sample_every))
        self.event_cooldown_seconds = event_cooldown_seconds

    def process(self, progress_callback=None):
        capture = cv2.VideoCapture(str(self.video_path))
        if not capture.isOpened():
            raise ValueError(f"Could not open video: {self.video_path}")

        fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
        width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        cooldown_frames = max(1, round(self.event_cooldown_seconds * fps))

        writer = cv2.VideoWriter(
            str(self.output_path),
            cv2.VideoWriter_fourcc(*VIDEO_CODEC),
            fps,
            (width, height),
        )
        if not writer.isOpened():
            capture.release()
            raise OSError(f"Could not write annotated video: {self.output_path}")

        active_tracks = set()
        last_event_frames = {}
        last_untracked_event_frame = float("-inf")

        events = []
        intrusion_frame_count = 0
        processed_frames = 0
        frame_index = 0

        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break

                if frame_index % self.sample_every == 0:
                    detections = self.detector.detect_frame(frame)

                    intruding_tracks = set()
                    for detection in detections:
                        is_intrusion = False
                        if self.restricted_zone is not None:
                            is_intrusion = is_person_intrusion(
                                detection["class_name"],
                                detection["bbox"],
                                self.restricted_zone,
                            )
                        detection["is_intrusion"] = is_intrusion
                        if not is_intrusion:
                            continue

                        intrusion_frame_count += 1
                        track_id = detection.get("track_id")
                        confidence = detection["confidence"]

                        if track_id is not None:
                            intruding_tracks.add(track_id)
                            last_seen = last_event_frames.get(track_id, float("-inf"))
                            if track_id not in active_tracks:
                                events.append(
                                    {"frame": frame_index, "track_id": track_id, "confidence": confidence}
                                )
                                last_event_frames[track_id] = frame_index
                            elif frame_index - last_seen >= cooldown_frames:
                                events.append(
                                    {"frame": frame_index, "track_id": track_id, "confidence": confidence}
                                )
                                last_event_frames[track_id] = frame_index
                        elif frame_index - last_untracked_event_frame >= cooldown_frames:
                            events.append(
                                {"frame": frame_index, "track_id": None, "confidence": confidence}
                            )
                            last_untracked_event_frame = frame_index

                    active_tracks = intruding_tracks

                    annotated = draw_detections(frame, detections, self.restricted_zone)
                    writer.write(annotated)
                    processed_frames += 1

                    if progress_callback is not None:
                        progress_callback(processed_frames, frame_index + 1, total_frames)

                frame_index += 1
        finally:
            capture.release()
            writer.release()

        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        return {
            "total_frames": total_frames,
            "processed_frames": processed_frames,
            "fps": fps,
            "width": width,
            "height": height,
            "duration_seconds": round(total_frames / fps, 2) if fps else 0.0,
            "intrusion_frame_count": intrusion_frame_count,
            "event_count": len(events),
            "events": events,
            "output_path": self.output_path.as_posix(),
        }
