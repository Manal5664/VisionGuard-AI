from threading import Lock


class InferenceUnavailableError(RuntimeError):
    """Raised when the YOLO model cannot be loaded or run on this instance."""


def _load_yolo_model(model_path: str):
    # Importing Ultralytics also imports PyTorch, so keep it off the API startup path.
    from ultralytics import YOLO

    return YOLO(model_path)


class Detector:
    def __init__(self, model_path: str = "yolo11n.pt"):
        self.model_path = model_path
        self._model = None
        self._model_lock = Lock()
        self._inference_lock = Lock()

    @property
    def model(self):
        if self._model is None:
            with self._model_lock:
                if self._model is None:
                    try:
                        self._model = _load_yolo_model(self.model_path)
                    except Exception as exc:
                        raise InferenceUnavailableError(
                            "YOLO inference is unavailable because the model could not be loaded."
                        ) from exc
        return self._model

    def detect(self, source, conf=0.25):
        try:
            model = self.model
            with self._inference_lock:
                results = model(source, verbose=False, conf=conf)
            return self._collect(results, model, with_ids=False)
        except InferenceUnavailableError:
            raise
        except Exception as exc:
            raise InferenceUnavailableError(
                "YOLO inference is temporarily unavailable on this instance."
            ) from exc

    def detect_frame(self, frame, conf=0.25, track=True):
        """Detect on a single frame, optionally with persistent ByteTrack IDs."""
        kwargs = {"verbose": False, "conf": conf}
        try:
            model = self.model
            with self._inference_lock:
                if track:
                    results = model.track(frame, persist=True, **kwargs)
                else:
                    results = model(frame, **kwargs)
            return self._collect(results, model, with_ids=track)
        except InferenceUnavailableError:
            raise
        except Exception as exc:
            raise InferenceUnavailableError(
                "YOLO inference is temporarily unavailable on this instance."
            ) from exc

    def _collect(self, results, model, with_ids):
        detections = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detection = {
                    "class_id": class_id,
                    "class_name": model.names[class_id],
                    "confidence": round(confidence, 3),
                    "bbox": {
                        "x1": round(x1, 2),
                        "y1": round(y1, 2),
                        "x2": round(x2, 2),
                        "y2": round(y2, 2),
                    },
                }

                if with_ids:
                    detection["track_id"] = int(box.id[0]) if box.id is not None else None

                detections.append(detection)

        return detections
