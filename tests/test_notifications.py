import unittest
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

import app.api.events as events_api
import app.api.video_detection as video_detection_api
from app.core.database import Base
from app.models.event import Event


def make_test_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def verify_deduplicated_events_are_persisted_as_one_notification_each():
    test_session = make_test_session()
    with (
        patch.object(video_detection_api, "SessionLocal", test_session),
        patch.object(events_api, "SessionLocal", test_session),
    ):
        saved = video_detection_api._save_events(
            job_id="job-1",
            upload_filename="camera.mp4",
            media_path="outputs/videos/job-1.mp4",
            zone_name="Office Entrance",
            fps=25.0,
            events=[
                {"frame": 25, "track_id": 4, "confidence": 0.91},
                {"frame": 75, "track_id": 7, "confidence": 0.87},
            ],
        )

    assert len(saved) == 2
    assert [event["event_sequence"] for event in saved] == [1, 2]
    assert [event["video_time_seconds"] for event in saved] == [1.0, 3.0]
    assert len({event["id"] for event in saved}) == 2

    with (
        patch.object(video_detection_api, "SessionLocal", test_session),
        patch.object(events_api, "SessionLocal", test_session),
    ):
        notifications = events_api.get_notifications(limit=50, before_id=None)
        assert [item["id"] for item in notifications] == [saved[1]["id"], saved[0]["id"]]
        assert all(item["zone_name"] == "Office Entrance" for item in notifications)

        with unittest.TestCase().assertRaises(IntegrityError):
            video_detection_api._save_events(
                job_id="job-1",
                upload_filename="camera.mp4",
                media_path="outputs/videos/job-1.mp4",
                zone_name="Office Entrance",
                fps=25.0,
                events=[{"frame": 25, "track_id": 4, "confidence": 0.91}],
            )

    db = test_session()
    try:
        assert db.query(Event).count() == 2
    finally:
        db.close()


def verify_notification_feed_is_newest_first_and_old_rows_remain_valid():
    test_session = make_test_session()

    db = test_session()
    try:
        old_video_event = Event(
            event_type="intrusion",
            object_type="person",
            confidence=0.72,
            image_path="old.mp4",
            source="video",
            track_id=None,
            frame=30,
            media_path="outputs/videos/old.mp4",
        )
        current_video_event = Event(
            event_type="intrusion",
            object_type="person",
            confidence=0.94,
            image_path="new.mp4",
            source="video",
            track_id=3,
            frame=60,
            media_path="outputs/videos/new.mp4",
            job_id="job-2",
            event_sequence=1,
            zone_name="Loading Bay",
            video_time_seconds=2.0,
        )
        image_event = Event(
            event_type="intrusion",
            object_type="person",
            confidence=0.81,
            image_path="still.jpg",
            source="image",
        )
        db.add_all([old_video_event, current_video_event, image_event])
        db.commit()
        old_id = old_video_event.id
        current_id = current_video_event.id
    finally:
        db.close()

    with patch.object(events_api, "SessionLocal", test_session):
        notifications = events_api.get_notifications(limit=50, before_id=None)
        assert [item["id"] for item in notifications] == [current_id, old_id]
        assert notifications[1]["zone_name"] is None
        assert notifications[1]["video_time_seconds"] is None
        assert notifications[1]["job_id"] is None

        older_page = events_api.get_notifications(limit=50, before_id=current_id)
        assert [item["id"] for item in older_page] == [old_id]


class NotificationTests(unittest.TestCase):
    def test_deduplicated_events_are_persisted_as_one_notification_each(self):
        verify_deduplicated_events_are_persisted_as_one_notification_each()

    def test_notification_feed_is_newest_first_and_old_rows_remain_valid(self):
        verify_notification_feed_is_newest_first_and_old_rows_remain_valid()
