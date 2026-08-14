import shutil
import threading
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from app.core.database import SessionLocal
from app.models.event import Event
from app.services.detector import Detector
from app.services.video_processor import VideoProcessor
from app.services.zones import get_restricted_zone


router = APIRouter()

VIDEO_UPLOAD_DIR = Path("data/videos")
ANNOTATED_VIDEO_DIR = Path("outputs/videos")
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
EVENT_COOLDOWN_SECONDS = 10.0

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
        "events": [],
        "error": None,
    }
    return job_id, job


def _save_events(upload_filename: str, media_path: str, events: list[dict]) -> None:
    db = SessionLocal()

    try:
        for event in events:
            db.add(
                Event(
                    event_type="intrusion",
                    object_type="person",
                    confidence=event["confidence"],
                    image_path=upload_filename,
                    source="video",
                    track_id=event["track_id"],
                    frame=event["frame"],
                    media_path=media_path,
                )
            )
        db.commit()

    finally:
        db.close()


def run_video_job(job_id: str, upload_path: Path) -> None:
    job = JOBS[job_id]
    job["status"] = "processing"

    output_path = ANNOTATED_VIDEO_DIR / f"{job_id}.mp4"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    restricted_zone = get_restricted_zone()
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

        _save_events(upload_path.name, output_path.as_posix(), result["events"])

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
            job["events"] = result["events"]

    except Exception as exc:
        with JOBS_LOCK:
            job["status"] = "failed"
            job["error"] = str(exc)

    finally:
        upload_path.unlink(missing_ok=True)


@router.post("/video-detect", status_code=202)
async def video_detect(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported video type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    job_id, job = _new_job(file.filename)
    with JOBS_LOCK:
        JOBS[job_id] = job

    upload_path = VIDEO_UPLOAD_DIR / f"{job_id}{suffix}"
    upload_path.parent.mkdir(parents=True, exist_ok=True)

    with upload_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    background_tasks.add_task(run_video_job, job_id, upload_path)

    return {"job_id": job_id, "status": job["status"]}


@router.get("/video-jobs/{job_id}")
def get_video_job(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)

    if job is None:
        raise HTTPException(status_code=404, detail="Video job not found")

    return job
