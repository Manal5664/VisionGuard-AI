from fastapi import FastAPI
from app.api.detection import router as detection_router
from app.api.health import router as health_router

app = FastAPI(
    title="VisionGuard API",
    description="AI-powered computer vision surveillance backend",
    version="1.0.0",
)

app.include_router(
    detection_router,
    prefix="/api",
    tags=["Detection"],
)
app.include_router(
    health_router,
    prefix="/api",
    tags=["Health"],
)

@app.get("/")
def root():
    return {
        "message": "VisionGuard API is running"
    }