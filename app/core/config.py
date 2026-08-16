import os

from dotenv import load_dotenv


load_dotenv()

DEFAULT_FRONTEND_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
)


def get_frontend_origins(value: str | None = None) -> list[str]:
    """Return explicit browser origins that may call the API with credentials."""
    configured = value if value is not None else os.getenv("VISIONGUARD_FRONTEND_ORIGINS")
    if not configured or not configured.strip():
        return list(DEFAULT_FRONTEND_ORIGINS)

    origins = list(
        dict.fromkeys(
            origin.strip().rstrip("/")
            for origin in configured.split(",")
            if origin.strip()
        )
    )
    if "*" in origins:
        raise ValueError(
            "VISIONGUARD_FRONTEND_ORIGINS cannot contain '*' while CORS credentials are enabled."
        )
    return origins
