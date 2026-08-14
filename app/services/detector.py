from ultralytics import YOLO


class Detector:
    def __init__(self, model_path: str = "yolo11n.pt"):
        self.model = YOLO(model_path)

    def detect(self, source, conf=0.25):
        results = self.model(source, verbose=False, conf=conf)
        return self._collect(results, with_ids=False)

    def detect_frame(self, frame, conf=0.25, track=True):
        """Detect on a single frame, optionally with persistent ByteTrack IDs."""
        kwargs = {"verbose": False, "conf": conf}
        if track:
            results = self.model.track(frame, persist=True, **kwargs)
            return self._collect(results, with_ids=True)
        return self._collect(self.model(frame, **kwargs), with_ids=False)

    def _collect(self, results, with_ids):
        detections = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                x1, y1, x2, y2 = box.xyxy[0].tolist()

                detection = {
                    "class_id": class_id,
                    "class_name": self.model.names[class_id],
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