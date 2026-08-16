import subprocess
import tempfile
from pathlib import Path

import cv2

from app.services.annotation import draw_detections
from app.services.detector import Detector
from app.services.intrusion import Coordinates
from app.services.intrusion_tracker import IntrusionTracker


VIDEO_CODEC = "mp4v"
OUTPUT_EXTENSION = ".mp4"
DEFAULT_EVENT_COOLDOWN_SECONDS = 10.0

TRANSCODE_ARGS = [
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
]


def transcode_to_h264(source: str | Path, destination: str | Path) -> None:
    """Encode a browser-compatible H.264 MP4 from an intermediate video file."""
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise OSError(
            "ffmpeg is required to produce browser-compatible H.264 video; "
            "install it with: pip install imageio-ffmpeg"
        ) from exc

    destination = Path(destination)
    completed = subprocess.run(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-y",
            "-loglevel", "error",
            "-i", str(source),
            *TRANSCODE_ARGS,
            str(destination),
        ],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0 or destination.stat().st_size == 0:
        destination.unlink(missing_ok=True)
        details = (completed.stderr or completed.stdout or "unknown error").strip()
        raise OSError(f"Could not encode H.264 video with ffmpeg: {details}")


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

        self.output_path.parent.mkdir(parents=True, exist_ok=True)

        intrusion_tracker = IntrusionTracker(
            self.restricted_zone,
            cooldown_frames,
        )

        events = []
        intrusion_frame_count = 0
        processed_frames = 0
        frame_index = 0

        with tempfile.TemporaryDirectory(prefix="visionguard_annotated_") as tmp_dir:
            intermediate_path = Path(tmp_dir) / f"{self.output_path.stem}_intermediate{OUTPUT_EXTENSION}"
            writer = cv2.VideoWriter(
                str(intermediate_path),
                cv2.VideoWriter_fourcc(*VIDEO_CODEC),
                fps,
                (width, height),
            )
            if not writer.isOpened():
                capture.release()
                raise OSError(f"Could not write annotated video: {intermediate_path}")

            try:
                while True:
                    ok, frame = capture.read()
                    if not ok:
                        break

                    if frame_index % self.sample_every == 0:
                        detections = self.detector.detect_frame(frame)

                        intrusion_result = intrusion_tracker.process_frame(
                            detections,
                            frame_index,
                        )
                        intrusion_frame_count += intrusion_result["intrusion_count"]
                        events.extend(intrusion_result["events"])

                        annotated = draw_detections(frame, detections, self.restricted_zone)
                        writer.write(annotated)
                        processed_frames += 1

                        if progress_callback is not None:
                            progress_callback(processed_frames, frame_index + 1, total_frames)

                    frame_index += 1
            finally:
                capture.release()
                writer.release()

            transcode_to_h264(intermediate_path, self.output_path)

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
