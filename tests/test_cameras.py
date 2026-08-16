import tempfile
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.api.cameras as cameras_api
import app.api.events as events_api
import app.api.zones as zones_api
from app.core.database import Base
from app.models.camera import Camera
from app.models.event import Event
from app.services.camera_monitor import CameraMonitorManager, LiveCameraMonitor


def make_test_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


class FakeManager:
    def __init__(self):
        self.updated_zone = None

    def status(self, camera_id):
        return {
            "camera_id": camera_id,
            "status": "stopped",
            "error": None,
            "session_id": None,
            "frame": 0,
            "event_count": 0,
        }

    def update_zone(self, camera_id, zone):
        self.updated_zone = (camera_id, zone)


class FakeCapture:
    def __init__(self):
        self.released = False

    def isOpened(self):
        return True

    def get(self, property_id):
        return 30.0 if property_id == cv2.CAP_PROP_FPS else 0.0

    def read(self):
        time.sleep(0.005)
        return True, np.zeros((48, 64, 3), dtype=np.uint8)

    def release(self):
        self.released = True


class EmptyDetector:
    def detect_frame(self, frame):
        return []


class EntryExitDetector:
    def __init__(self):
        self.calls = 0

    def detect_frame(self, frame):
        self.calls += 1
        outside = self.calls == 6
        bbox = (
            {"x1": 50, "y1": 10, "x2": 60, "y2": 20}
            if outside
            else {"x1": 10, "y1": 10, "x2": 20, "y2": 20}
        )
        return [
            {
                "class_name": "person",
                "confidence": 0.92,
                "bbox": bbox,
                "track_id": 4,
            }
        ]


class CameraTests(unittest.TestCase):
    def test_camera_zone_is_scoped_and_does_not_become_global(self):
        test_session = make_test_session()
        manager = FakeManager()
        with (
            patch.object(cameras_api, "SessionLocal", test_session),
            patch.object(cameras_api, "camera_manager", manager),
            patch.object(zones_api, "SessionLocal", test_session),
        ):
            camera = cameras_api.create_camera(
                cameras_api.CameraCreate(name="Office Webcam", webcam_index=0)
            )
            zone = cameras_api.create_camera_zone(
                camera["id"],
                cameras_api.CameraZoneCreate(
                    name="Door",
                    x1=10,
                    y1=12,
                    x2=100,
                    y2=90,
                ),
            )
            camera_zones = cameras_api.list_camera_zones(camera["id"])
            global_zones = zones_api.get_zones()

        self.assertEqual(zone["camera_id"], camera["id"])
        self.assertEqual([item["id"] for item in camera_zones], [zone["id"]])
        self.assertEqual(global_zones, [])
        self.assertEqual(manager.updated_zone[1]["name"], "Door")

    def test_stop_monitoring_releases_webcam(self):
        test_session = make_test_session()
        db = test_session()
        db.add(Camera(name="Test Webcam", webcam_index=0))
        db.commit()
        camera_id = db.query(Camera).one().id
        db.close()

        capture = FakeCapture()
        monitor = LiveCameraMonitor(
            {
                "id": camera_id,
                "name": "Test Webcam",
                "source_type": "webcam",
                "webcam_index": 0,
            },
            None,
            capture_factory=lambda index: capture,
            detector_factory=EmptyDetector,
            session_factory=test_session,
        )
        self.assertEqual(monitor.start(timeout=1)["status"], "running")
        deadline = time.monotonic() + 1
        while monitor.status()["frame"] == 0 and time.monotonic() < deadline:
            time.sleep(0.01)
        mjpeg_frame = next(monitor.mjpeg_frames())
        stopped = monitor.stop(timeout=1)

        self.assertTrue(mjpeg_frame.startswith(b"--frame\r\nContent-Type: image/jpeg"))
        self.assertEqual(stopped["status"], "stopped")
        self.assertTrue(capture.released)
        self.assertFalse(monitor.is_running)

    def test_persisted_camera_event_appears_once_in_notifications(self):
        test_session = make_test_session()
        db = test_session()
        db.add(Camera(name="Notification Webcam", webcam_index=0))
        db.commit()
        camera_id = db.query(Camera).one().id
        db.close()

        with tempfile.TemporaryDirectory() as output_dir:
            monitor = LiveCameraMonitor(
                {
                    "id": camera_id,
                    "name": "Notification Webcam",
                    "source_type": "webcam",
                    "webcam_index": 0,
                },
                {
                    "name": "Entrance",
                    "x1": 1,
                    "y1": 1,
                    "x2": 40,
                    "y2": 40,
                },
                session_factory=test_session,
                output_dir=output_dir,
            )
            monitor._session_id = "camera-session"
            saved = monitor._persist_event(
                np.zeros((48, 64, 3), dtype=np.uint8),
                {"frame": 3, "track_id": 7, "confidence": 0.93},
            )
            with patch.object(events_api, "SessionLocal", test_session):
                notifications = events_api.get_notifications(limit=50, before_id=None)

        db = test_session()
        try:
            self.assertEqual(db.query(Event).count(), 1)
        finally:
            db.close()
        self.assertEqual([item["id"] for item in notifications], [saved["id"]])
        self.assertEqual(notifications[0]["source"], "camera")
        self.assertEqual(notifications[0]["camera_id"], camera_id)
        self.assertEqual(notifications[0]["zone_name"], "Entrance")

    def test_one_episode_persists_once_and_exit_reentry_persists_again(self):
        test_session = make_test_session()
        db = test_session()
        db.add(Camera(name="Episode Webcam", webcam_index=0))
        db.commit()
        camera_id = db.query(Camera).one().id
        db.close()
        capture = FakeCapture()
        published = []

        with tempfile.TemporaryDirectory() as output_dir:
            monitor = LiveCameraMonitor(
                {
                    "id": camera_id,
                    "name": "Episode Webcam",
                    "source_type": "webcam",
                    "webcam_index": 0,
                },
                {
                    "name": "Entrance",
                    "x1": 1,
                    "y1": 1,
                    "x2": 40,
                    "y2": 40,
                },
                event_callback=lambda source_id, event: published.append(event),
                capture_factory=lambda index: capture,
                detector_factory=EntryExitDetector,
                session_factory=test_session,
                output_dir=output_dir,
            )
            monitor.start(timeout=1)
            deadline = time.monotonic() + 2
            event_count = 0
            while time.monotonic() < deadline:
                db = test_session()
                try:
                    event_count = db.query(Event).count()
                finally:
                    db.close()
                if event_count >= 2:
                    break
                time.sleep(0.02)
            monitor.stop(timeout=1)

            with patch.object(events_api, "SessionLocal", test_session):
                notifications = events_api.get_notifications(limit=50, before_id=None)

        self.assertEqual(event_count, 2)
        self.assertEqual(len(published), 2)
        self.assertEqual(len(notifications), 2)
        self.assertEqual(
            [event["event_sequence"] for event in published],
            [1, 2],
        )

    def test_sse_broker_emits_persisted_intrusion_payload(self):
        manager = CameraMonitorManager()
        stream = manager.event_stream(3)
        self.assertEqual(next(stream), "retry: 2000\n\n")
        manager.publish_event(3, {"id": 11, "source": "camera"})
        message = next(stream)
        stream.close()
        self.assertIn("event: intrusion", message)
        self.assertIn('"id": 11', message)


if __name__ == "__main__":
    unittest.main()
