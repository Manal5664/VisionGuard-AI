import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.api.zones as zones_api
from app.core.database import Base
from app.models.camera import Camera


def make_test_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


class FakeManager:
    def __init__(self):
        self.updated_zone = None

    def update_zone(self, camera_id, zone):
        self.updated_zone = (camera_id, zone)


class ZoneApiTests(unittest.TestCase):
    def setUp(self):
        self.test_session = make_test_session()
        db = self.test_session()
        try:
            db.add(Camera(name="Entrance Cam", webcam_index=0))
            db.commit()
            self.camera_id = db.query(Camera).one().id
        finally:
            db.close()

    def create_zone(self, name="Lobby", x1=10, y1=12, x2=100, y2=90):
        db = self.test_session()
        try:
            from app.models.zone import RestrictedZone

            zone = RestrictedZone(name=name, x1=x1, y1=y1, x2=x2, y2=y2)
            db.add(zone)
            db.commit()
            db.refresh(zone)
            return zone.id
        finally:
            db.close()

    def test_patch_updates_name_and_coordinates(self):
        zone_id = self.create_zone()
        with patch.object(zones_api, "SessionLocal", self.test_session):
            updated = zones_api.update_zone(
                zone_id,
                zones_api.ZoneUpdate(name="Main Lobby", x1=5, y1=6, x2=80, y2=70),
            )

        self.assertEqual(updated["id"], zone_id)
        self.assertEqual(updated["name"], "Main Lobby")
        self.assertEqual((updated["x1"], updated["y1"], updated["x2"], updated["y2"]), (5, 6, 80, 70))
        self.assertIsNone(updated["camera_id"])

        with patch.object(zones_api, "SessionLocal", self.test_session):
            zones = zones_api.get_zones()
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0]["name"], "Main Lobby")

    def test_patch_name_only_leaves_coordinates_untouched(self):
        zone_id = self.create_zone()
        with patch.object(zones_api, "SessionLocal", self.test_session):
            updated = zones_api.update_zone(zone_id, zones_api.ZoneUpdate(name="Renamed"))

        self.assertEqual(updated["name"], "Renamed")
        self.assertEqual(updated["x1"], 10)

    def test_patch_links_zone_to_a_camera(self):
        zone_id = self.create_zone()
        manager = FakeManager()
        with (
            patch.object(zones_api, "SessionLocal", self.test_session),
            patch.object(zones_api, "camera_manager", manager),
        ):
            updated = zones_api.update_zone(
                zone_id,
                zones_api.ZoneUpdate(camera_id=self.camera_id),
            )

        self.assertEqual(updated["camera_id"], self.camera_id)
        self.assertEqual(manager.updated_zone[0], self.camera_id)
        self.assertEqual(manager.updated_zone[1]["id"], zone_id)

        with patch.object(zones_api, "SessionLocal", self.test_session):
            global_zones = zones_api.get_zones()
        self.assertEqual(global_zones, [])

    def test_patch_camera_id_null_makes_zone_global_again(self):
        zone_id = self.create_zone()
        with patch.object(zones_api, "SessionLocal", self.test_session):
            zones_api.update_zone(zone_id, zones_api.ZoneUpdate(camera_id=self.camera_id))
            updated = zones_api.update_zone(zone_id, zones_api.ZoneUpdate(camera_id=None))

        self.assertIsNone(updated["camera_id"])
        with patch.object(zones_api, "SessionLocal", self.test_session):
            self.assertEqual([item["id"] for item in zones_api.get_zones()], [zone_id])

    def test_patch_missing_zone_returns_404(self):
        with patch.object(zones_api, "SessionLocal", self.test_session):
            with self.assertRaises(HTTPException) as context:
                zones_api.update_zone(999, zones_api.ZoneUpdate(name="Ghost"))

        self.assertEqual(context.exception.status_code, 404)

    def test_patch_missing_camera_returns_404(self):
        zone_id = self.create_zone()
        with patch.object(zones_api, "SessionLocal", self.test_session):
            with self.assertRaises(HTTPException) as context:
                zones_api.update_zone(zone_id, zones_api.ZoneUpdate(camera_id=404))

        self.assertEqual(context.exception.status_code, 404)

    def test_patch_validates_coordinates_like_creation(self):
        with self.assertRaises(ValidationError):
            zones_api.ZoneUpdate(x1=10, y1=12, x2=10, y2=90)
        with self.assertRaises(ValidationError):
            zones_api.ZoneUpdate(x1=10, y1=12, x2=100, y2=12)
        with self.assertRaises(ValidationError):
            zones_api.ZoneUpdate(x1=10, y1=12, x2=100)

    def test_patch_rejects_blank_name(self):
        with self.assertRaises(ValidationError):
            zones_api.ZoneUpdate(name="   ")

    def test_delete_removes_only_the_requested_zone(self):
        first_id = self.create_zone(name="First")
        second_id = self.create_zone(name="Second")
        with patch.object(zones_api, "SessionLocal", self.test_session):
            result = zones_api.delete_zone(first_id)

        self.assertIsNone(result)
        with patch.object(zones_api, "SessionLocal", self.test_session):
            zones = zones_api.get_zones()
        self.assertEqual([item["id"] for item in zones], [second_id])

    def test_delete_missing_zone_returns_404(self):
        with patch.object(zones_api, "SessionLocal", self.test_session):
            with self.assertRaises(HTTPException) as context:
                zones_api.delete_zone(999)

        self.assertEqual(context.exception.status_code, 404)

    def test_delete_camera_zone_does_not_affect_global_zones(self):
        db = self.test_session()
        try:
            from app.models.zone import RestrictedZone

            camera_zone = RestrictedZone(
                name="Door",
                x1=1,
                y1=1,
                x2=20,
                y2=20,
                camera_id=self.camera_id,
            )
            global_zone = RestrictedZone(name="Lobby", x1=5, y1=5, x2=50, y2=50)
            db.add_all([camera_zone, global_zone])
            db.commit()
            db.refresh(camera_zone)
            db.refresh(global_zone)
            camera_zone_id = camera_zone.id
            global_zone_id = global_zone.id
        finally:
            db.close()

        with patch.object(zones_api, "SessionLocal", self.test_session):
            zones_api.delete_zone(camera_zone_id)
            global_zones = zones_api.get_zones()

        self.assertEqual([item["id"] for item in global_zones], [global_zone_id])


if __name__ == "__main__":
    unittest.main()
