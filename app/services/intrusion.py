from typing import Mapping, TypeAlias


Coordinates: TypeAlias = Mapping[str, float]
Point: TypeAlias = tuple[float, float]


def calculate_bounding_box_center(bounding_box: Coordinates) -> Point:
    """Return the center point of a detection bounding box."""
    center_x = (bounding_box["x1"] + bounding_box["x2"]) / 2
    center_y = (bounding_box["y1"] + bounding_box["y2"]) / 2

    return center_x, center_y


def is_center_in_restricted_zone(
    bounding_box: Coordinates,
    restricted_zone: Coordinates,
) -> bool:
    """Return whether a bounding box center is inside a rectangular zone."""
    center_x, center_y = calculate_bounding_box_center(bounding_box)

    return (
        restricted_zone["x1"] <= center_x <= restricted_zone["x2"]
        and restricted_zone["y1"] <= center_y <= restricted_zone["y2"]
    )


def is_person_intrusion(
    class_name: str,
    bounding_box: Coordinates,
    restricted_zone: Coordinates,
) -> bool:
    """Return whether a detection is a person centered inside the zone."""
    return class_name == "person" and is_center_in_restricted_zone(
        bounding_box,
        restricted_zone,
    )
