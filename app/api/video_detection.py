import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, model_validator

from app.core.database import SessionLocal
from app.models.event import Event
from app.services.detector import Detector
from app.services.video_processor import VideoProcessor


router = APIRouter()

VIDEO_UPLOAD_DIR = Path("data/videos")
ANNOTATED_VIDEO_DIR = Path("outputs/videos")
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
EVENT_COOLDOWN_SECONDS = 10.0


class JobZone(BaseModel):
    name: str
    x1: float
    y1: float
    x2: float
    y2: float

    @model_validator(mode="after")
    def validate_ordering(self):
        if self.x2 <= self.x1:
            raise ValueError("x2 must be greater than x1")
        if self.y2 <= self.y1:
            raise ValueError("y2 must be greater than y1")
        return self

JOBS_LOCK = threading.Lock()
JOBS = {}
PROCESS_LOCK = threading.Lock()


def _new_job(filename: str) -> tuple[str, dict]:
    job_id = uuid.uuid4().hex
    job = {
        "id": job_id,
        "filename": filename,
        "status": "queued",
        "progress": 0.0,
        "total_frames": None,
        "processed_frames": 0,
        "intrusion_count": 0,
        "event_count": 0,
        "annotated_video_path": None,
        "fps": None,
        "duration_seconds": None,
        "zone": None,
        "events": [],
        "error": None,
    }
    return job_id, job


def _parse_zone(
    zone_name: str | None,
    x1: float | None,
    y1: float | None,
    x2: float | None,
    y2: float | None,
) -> JobZone | None:
    provided = [value is not None for value in (zone_name, x1, y1, x2, y2)]
    if not any(provided):
        return None
    if not all(provided):
        raise HTTPException(
            status_code=400,
            detail="Zone must be fully defined: provide zone_name and all four coordinates.",
        )
    try:
        return JobZone(name=zone_name, x1=x1, y1=y1, x2=x2, y2=y2)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _save_events(
    job_id: str,
    upload_filename: str,
    media_path: str,
    zone_name: str | None,
    fps: float,
    events: list[dict],
) -> list[dict]:
    db = SessionLocal()

    try:
        saved_events = []
        for event_sequence, event in enumerate(events, start=1):
            video_time_seconds = event["frame"] / fps if fps > 0 else None
            saved_event = Event(
                event_type="intrusion",
                object_type="person",
                confidence=event["confidence"],
                image_path=upload_filename,
                source="video",
                track_id=event["track_id"],
                frame=event["frame"],
                media_path=media_path,
                job_id=job_id,
                event_sequence=event_sequence,
                zone_name=zone_name,
                video_time_seconds=video_time_seconds,
            )
            db.add(saved_event)
            saved_events.append(saved_event)
        db.commit()

        for saved_event in saved_events:
            db.refresh(saved_event)

        return [
            {
                "id": event.id,
                "frame": event.frame,
                "track_id": event.track_id,
                "confidence": event.confidence,
                "job_id": event.job_id,
                "event_sequence": event.event_sequence,
                "zone_name": event.zone_name,
                "video_time_seconds": event.video_time_seconds,
                "media_path": event.media_path,
            }
            for event in saved_events
        ]

    finally:
        db.close()


def run_video_job(job_id: str, upload_path: Path, zone: JobZone | None = None) -> None:
    job = JOBS[job_id]
    job["status"] = "processing"

    output_path = ANNOTATED_VIDEO_DIR / f"{job_id}.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    restricted_zone = zone.model_dump() if zone is not None else None
    processor = VideoProcessor(
        video_path=upload_path,
        output_path=output_path,
        restricted_zone=restricted_zone,
        detector=Detector(),
        event_cooldown_seconds=EVENT_COOLDOWN_SECONDS,
    )

    def on_progress(processed: int, frame: int, total_frames: int) -> None:
        with JOBS_LOCK:
            job["processed_frames"] = processed
            job["total_frames"] = total_frames
            job["progress"] = round(processed / total_frames * 100, 1) if total_frames else 0.0

    try:
        with PROCESS_LOCK:
            result = processor.process(progress_callback=on_progress)

        saved_events = _save_events(
            job_id=job_id,
            upload_filename=upload_path.name,
            media_path=output_path.as_posix(),
            zone_name=zone.name if zone is not None else None,
            fps=result["fps"],
            events=result["events"],
        )

        with JOBS_LOCK:
            job["status"] = "completed"
            job["progress"] = 100.0
            job["total_frames"] = result["total_frames"]
            job["processed_frames"] = result["processed_frames"]
            job["intrusion_count"] = result["intrusion_frame_count"]
            job["event_count"] = result["event_count"]
            job["annotated_video_path"] = result["output_path"]
            job["fps"] = result["fps"]
            job["duration_seconds"] = result["duration_seconds"]
            job["zone"] = restricted_zone
            job["events"] = saved_events

    except Exception as exc:
        with JOBS_LOCK:
            job["status"] = "failed"
            job["error"] = str(exc)

    finally:
        upload_path.unlink(missing_ok=True)


@router.post("/video-detect", status_code=202)
async def video_detect(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    zone_name: str | None = Form(None),
    x1: float | None = Form(None),
    y1: float | None = Form(None),
    x2: float | None = Form(None),
    y2: float | None = Form(None),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    zone = _parse_zone(zone_name, x1, y1, x2, y2)

    job_id, job = _new_job(file.filename)
    with JOBS_LOCK:
        JOBS[job_id] = job

    upload_path = VIDEO_UPLOAD_DIR / f"{job_id}{suffix}"
    upload_path.parent.mkdir(parents=True, exist_ok=True)

    with upload_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    background_tasks.add_task(run_video_job, job_id, upload_path, zone)

    return {"job_id": job_id, "status": job["status"]}


@router.get("/video-jobs/{job_id}")
def get_video_job(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found")

    return job
