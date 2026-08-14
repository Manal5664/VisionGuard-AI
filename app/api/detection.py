from fastapi import APIRouter, UploadFile, File
from pathlib import Path
import shutil
import uuid

from app.services.detector import Detector


router = APIRouter()

detector = Detector()

UPLOAD_DIR = Path("data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/detect")
async def detect_image(file: UploadFile = File(...)):
    file_extension = Path(file.filename).suffix
    temp_filename = f"{uuid.uuid4()}{file_extension}"
    temp_path = UPLOAD_DIR / temp_filename

    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    detections = detector.detect(str(temp_path))

    temp_path.unlink(missing_ok=True)

    return {
        "filename": file.filename,
        "detections": detections,
        "count": len(detections),
    }