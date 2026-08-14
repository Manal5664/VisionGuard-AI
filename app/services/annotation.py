from pathlib import Path
from typing import Any, Mapping, Sequence
from uuid import uuid4

import cv2

from app.services.intrusion import Coordinates, is_person_intrusion


ANNOTATED_OUTPUT_DIR = Path("outputs/detections")
ZONE_COLOR = (0, 215, 255)
STANDARD_BOX_COLOR = (0, 180, 0)
INTRUSION_BOX_COLOR = (0, 0, 255)


def draw_detections(
    image,
    detections: Sequence[Mapping[str, Any]],
    restricted_zone: Coordinates | None = None,
):
    """Draw the restricted zone and detections on a copy of an image/frame."""
    annotated = image.copy()

    if restricted_zone is not None:
        zone_start = (round(restricted_zone["x1"]), round(restricted_zone["y1"]))
        zone_end = (round(restricted_zone["x2"]), round(restricted_zone["y2"]))
        cv2.rectangle(annotated, zone_start, zone_end, ZONE_COLOR, 2)

    image_height, image_width = annotated.shape[:2]
    for detection in detections:
        bounding_box = detection["bbox"]
        class_name = str(detection["class_name"])
        is_intrusion = detection.get("is_intrusion")
        if is_intrusion is None and restricted_zone is not None:
            is_intrusion = is_person_intrusion(
                class_name,
                bounding_box,
                restricted_zone,
            )
        box_start = (
            _clamp(round(bounding_box["x1"]), 0, image_width - 1),
            _clamp(round(bounding_box["y1"]), 0, image_height - 1),
        )
        box_end = (
            _clamp(round(bounding_box["x2"]), 0, image_width - 1),
            _clamp(round(bounding_box["y2"]), 0, image_height - 1),
        )

        label = "INTRUSION" if is_intrusion else class_name
        color = INTRUSION_BOX_COLOR if is_intrusion else STANDARD_BOX_COLOR
        cv2.rectangle(annotated, box_start, box_end, color, 2)
        cv2.putText(
            annotated,
            label,
            (box_start[0], max(box_start[1] - 8, 20)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            color,
            2,
            cv2.LINE_AA,
        )

    return annotated


def annotate_detections(
    image_path: str | Path,
    detections: Sequence[Mapping[str, Any]],
    restricted_zone: Coordinates | None = None,
    output_dir: str | Path = ANNOTATED_OUTPUT_DIR,
) -> Path:
    """Draw the restricted zone and detections on a copy of an image."""
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not read image for annotation: {image_path}")

    annotated = draw_detections(image, detections, restricted_zone)

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    output_path = destination / f"{uuid4().hex}.jpg"
    if not cv2.imwrite(str(output_path), annotated):
        raise OSError(f"Could not write annotated image: {output_path}")

    return output_path


def _clamp(value: int, minimum: int, maximum: int) -> int:
    return max(minimum, min(value, maximum))
