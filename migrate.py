from sqlalchemy import text

from app.core.database import engine


ALTER_STATEMENTS = [
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'image'",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS track_id INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS frame INTEGER",
    "ALTER TABLE events ADD COLUMN IF NOT EXISTS media_path VARCHAR(255)",
]


def main() -> None:
    with engine.begin() as connection:
        for statement in ALTER_STATEMENTS:
            connection.execute(text(statement))
            print(f"OK: {statement}")

    print("Migrations applied successfully!")


if __name__ == "__main__":
    main()
