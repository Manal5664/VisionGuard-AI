import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.api.events as events_api
from app.core.database import Base
from app.models.event import Event


def make_test_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


class EventApiTests(unittest.TestCase):
    def setUp(self):
        self.test_session = make_test_session()
        db = self.test_session()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add_all(
            [
                Event(
                    event_type="detection",
                    object_type="car",
                    confidence=0.72,
                    image_path="parking.jpg",
                    source="image",
                    created_at=now - timedelta(days=2),
                ),
                Event(
                    event_type="intrusion",
                    object_type="person",
                    confidence=0.91,
                    image_path="lobby.jpg",
                    source="image",
                    created_at=now - timedelta(minutes=10),
                ),
                Event(
                    event_type="intrusion",
                    object_type="person",
                    confidence=0.96,
                    image_path="camera.mp4",
                    source="video",
                    media_path="outputs/videos/camera.mp4",
                    video_time_seconds=12.5,
                    created_at=now - timedelta(minutes=5),
                ),
                Event(
                    event_type="detection",
                    object_type="person",
                    confidence=0.82,
                    image_path="door.jpg",
                    source="image",
                    created_at=now,
                ),
            ]
        )
        db.commit()
        db.close()

    def test_filters_and_cursor_pagination_compose(self):
        with patch.object(events_api, "SessionLocal", self.test_session):
            first_page = events_api.get_events(
                event_type=None,
                source="image",
                before_id=None,
                created_from=None,
                created_to=None,
                limit=2,
            )

            self.assertEqual(len(first_page), 2)
            self.assertTrue(all(event["source"] == "image" for event in first_page))

            second_page = events_api.get_events(
                event_type=None,
                source="image",
                before_id=first_page[-1]["id"],
                created_from=None,
                created_to=None,
                limit=2,
            )

            self.assertEqual(len(second_page), 1)
            self.assertLess(second_page[0]["id"], first_page[-1]["id"])
            self.assertEqual(
                {event["id"] for event in first_page}.intersection(
                    event["id"] for event in second_page
                ),
                set(),
            )

            intrusions = events_api.get_events(
                event_type="intrusion",
                source=None,
                before_id=None,
                created_from=None,
                created_to=None,
                limit=10,
            )
            self.assertEqual(len(intrusions), 2)
            self.assertTrue(all(event["event_type"] == "intrusion" for event in intrusions))

    def test_date_filter_and_summary_match_database_rows(self):
        db = self.test_session()
        try:
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1)
            expected_recent = db.query(Event).filter(Event.created_at >= cutoff).count()
        finally:
            db.close()

        with patch.object(events_api, "SessionLocal", self.test_session):
            recent = events_api.get_events(
                event_type=None,
                source=None,
                before_id=None,
                created_from=cutoff,
                created_to=None,
                limit=10,
            )
            summary = events_api.get_event_summary()

        self.assertEqual(len(recent), expected_recent)
        self.assertEqual(summary["total_events"], 4)
        self.assertEqual(summary["total_intrusions"], 2)
        self.assertEqual(summary["total_detections"], 2)
        self.assertEqual(summary["image_events"], 3)
        self.assertEqual(summary["video_events"], 1)
        self.assertEqual(summary["events_today"], 3)


if __name__ == "__main__":
    unittest.main()
