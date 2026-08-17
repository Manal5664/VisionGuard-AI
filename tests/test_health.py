import unittest

from fastapi.testclient import TestClient

from app.main import app


class HealthCheckTests(unittest.TestCase):
    def test_render_health_endpoint_is_available_without_running_inference(self):
        with TestClient(app) as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "healthy")


if __name__ == "__main__":
    unittest.main()
