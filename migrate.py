from sqlalchemy import text

from app.core.database import engine
from app.models.camera import Camera


ALTER_STATEMENTS = [
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'image'",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS track_id INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS frame INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS media_path VARCHAR(255)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS job_id VARCHAR(32)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS event_sequence INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS zone_name VARCHAR(255)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS video_time_seconds DOUBLE PRECISION",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS camera_id INTEGER",
    "ALTER TABLE zones ADD COLUMN IF NOT EXISTS camera_id INTEGER",
    "CREATE INDEX IF NOT EXISTS ix_events_camera_id ON events (camera_id)",
    "CREATE INDEX IF NOT EXISTS ix_zones_camera_id ON zones (camera_id)",
    (
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_events_job_event_sequence "
        "ON events (job_id, event_sequence)"
    ),
    (
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint "
        "WHERE conname = 'fk_events_camera_id') THEN "
        "ALTER TABLE events ADD CONSTRAINT fk_events_camera_id "
        "FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE SET NULL; "
        "END IF; END $$"
    ),
    (
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT 1 FROM pg_constraint "
        "WHERE conname = 'fk_zones_camera_id') THEN "
        "ALTER TABLE zones ADD CONSTRAINT fk_zones_camera_id "
        "FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE; "
        "END IF; END $$"
    ),
]


def main() -> None:
    with engine.begin() as connection:
        Camera.__table__.create(bind=connection, checkfirst=True)
        print("OK: cameras table")
        for statement in ALTER_STATEMENTS:
            connection.execute(text(statement))
            print(f"OK: {statement}")

    print("Migrations applied successfully!")


if __name__ == "__main__":
    main()
