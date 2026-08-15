from sqlalchemy import text

from app.core.database import engine


ALTER_STATEMENTS = [
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'image'",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS track_id INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS frame INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS media_path VARCHAR(255)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS job_id VARCHAR(32)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS event_sequence INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS zone_name VARCHAR(255)",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS video_time_seconds DOUBLE PRECISION",
    (
        "CREATE UNIQUE INDEX IF NOT EXISTS ux_events_job_event_sequence "
        "ON events (job_id, event_sequence)"
    ),
]


def main() -> None:
    with engine.begin() as connection:
        for statement in ALTER_STATEMENTS:
            connection.execute(text(statement))
            print(f"OK: {statement}")

    print("Migrations applied successfully!")


if __name__ == "__main__":
    main()
