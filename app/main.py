from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.cameras import router as cameras_router
from app.api.detection import router as detection_router
from app.api.health import router as health_router
from app.api.events import router as events_router
from app.api.video_detection import router as video_detection_router
from app.api.zones import router as zones_router
from app.core.config import get_frontend_origins
from app.services.camera_monitor import camera_manager

app = FastAPI(
    title="VisionGuard API",
    description="AI-powered computer vision surveillance backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_frontend_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(
    cameras_router,
    prefix="/api",
    tags=["Cameras"],
)
app.include_router(
    events_router,
    prefix="/api",
    tags=["Events"],
)

app.include_router(
    zones_router,
    prefix="/api",
    tags=["Zones"],
)

app.include_router(
    detection_router,
    prefix="/api",
    tags=["Detection"],
)
app.include_router(
    video_detection_router,
    prefix="/api",
    tags=["Video Detection"],
)
app.include_router(
    health_router,
    prefix="/api",
    tags=["Health"],
)

app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")


@app.on_event("shutdown")
def stop_camera_monitors() -> None:
    camera_manager.stop_all()

@app.get("/")
def root():
    return {
        "message": "VisionGuard API is running"
    }
