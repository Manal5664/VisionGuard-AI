import unittest

from fastapi.testclient import TestClient

from app.core.config import DEFAULT_FRONTEND_ORIGINS, get_frontend_origins
from app.main import app


class CorsConfigurationTests(unittest.TestCase):
    def test_default_origins_cover_vite_fallback_port(self):
        self.assertIn("http://localhost:5173", DEFAULT_FRONTEND_ORIGINS)
        self.assertIn("http://127.0.0.1:5173", DEFAULT_FRONTEND_ORIGINS)
        self.assertIn("http://localhost:5174", DEFAULT_FRONTEND_ORIGINS)
        self.assertIn("http://127.0.0.1:5174", DEFAULT_FRONTEND_ORIGINS)

    def test_configured_origins_are_trimmed_normalized_and_deduplicated(self):
        self.assertEqual(
            get_frontend_origins(
                " http://localhost:4173/,http://localhost:4173,http://ui.test "
            ),
            ["http://localhost:4173", "http://ui.test"],
        )

    def test_wildcard_is_rejected_when_credentials_are_enabled(self):
        with self.assertRaisesRegex(ValueError, "cannot contain"):
            get_frontend_origins("*")

    def test_vercel_production_origin_is_normalized(self):
        self.assertEqual(
            get_frontend_origins("https://visionguard.vercel.app/"),
            ["https://visionguard.vercel.app"],
        )

    def test_localhost_5174_camera_preflight_is_allowed(self):
        with TestClient(app) as client:
            response = client.options(
                "/api/cameras",
                headers={
                    "Origin": "http://localhost:5174",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5174",
        )
        self.assertEqual(response.headers["access-control-allow-credentials"], "true")


if __name__ == "__main__":
    unittest.main()
