import unittest
from unittest.mock import Mock, patch

from fastapi.testclient import TestClient

import app.api.detection as detection_api
from app.main import app
from app.services.detector import Detector, InferenceUnavailableError


class DetectorAvailabilityTests(unittest.TestCase):
    def test_model_loading_is_lazy_and_happens_once(self):
        fake_model = Mock()

        with patch("app.services.detector._load_yolo_model", return_value=fake_model) as loader:
            detector = Detector("portfolio-model.pt")
            loader.assert_not_called()

            self.assertIs(detector.model, fake_model)
            self.assertIs(detector.model, fake_model)

        loader.assert_called_once_with("portfolio-model.pt")

    def test_model_execution_failure_has_a_stable_service_error(self):
        fake_model = Mock(side_effect=RuntimeError("runtime exhausted"))

        with patch("app.services.detector._load_yolo_model", return_value=fake_model):
            detector = Detector()
            with self.assertRaisesRegex(InferenceUnavailableError, "temporarily unavailable"):
                detector.detect("example.jpg")

    def test_image_endpoint_returns_503_when_inference_is_unavailable(self):
        with patch.object(
            detection_api.detector,
            "detect",
            side_effect=InferenceUnavailableError("model unavailable"),
        ):
            with TestClient(app) as client:
                response = client.post(
                    "/api/detect",
                    files={"file": ("example.jpg", b"not-an-image", "image/jpeg")},
                )

        self.assertEqual(response.status_code, 503)
        self.assertIn("temporarily unavailable", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
