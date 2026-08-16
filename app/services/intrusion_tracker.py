from collections.abc import MutableMapping, Sequence
from typing import Any

from app.services.intrusion import Coordinates, is_person_intrusion


class IntrusionTracker:
    """Track restricted-zone entry episodes across analyzed frames."""

    def __init__(
        self,
        restricted_zone: Coordinates | None,
        cooldown_frames: int,
        *,
        repeat_active_after_cooldown: bool = True,
        untracked_episode_mode: bool = False,
    ) -> None:
        self.restricted_zone = restricted_zone
        self.cooldown_frames = max(1, int(cooldown_frames))
        self.repeat_active_after_cooldown = repeat_active_after_cooldown
        self.untracked_episode_mode = untracked_episode_mode
        self.reset()

    def reset(self, restricted_zone: Coordinates | None = None) -> None:
        if restricted_zone is not None:
            self.restricted_zone = restricted_zone
        self.active_tracks: set[int] = set()
        self.untracked_active = False
        self.last_event_frames: dict[int, int] = {}
        self.last_untracked_event_frame: float = float("-inf")

    def process_frame(
        self,
        detections: Sequence[MutableMapping[str, Any]],
        frame_index: int,
    ) -> dict[str, Any]:
        events: list[dict[str, Any]] = []
        intruding_tracks: set[int] = set()
        untracked_seen = False
        intrusion_count = 0
        for detection in detections:
            is_intrusion = False
            if self.restricted_zone is not None:
                is_intrusion = is_person_intrusion(
                    detection["class_name"],
                    detection["bbox"],
                    self.restricted_zone,
                )
            detection["is_intrusion"] = is_intrusion
            if not is_intrusion:
                continue

            intrusion_count += 1
            track_id = detection.get("track_id")
            confidence = detection["confidence"]

            if track_id is not None:
                track_id = int(track_id)
                intruding_tracks.add(track_id)
                last_seen = self.last_event_frames.get(track_id, float("-inf"))
                is_entry = track_id not in self.active_tracks
                cooldown_elapsed = frame_index - last_seen >= self.cooldown_frames
                if is_entry or (self.repeat_active_after_cooldown and cooldown_elapsed):
                    events.append(
                        {
                            "frame": frame_index,
                            "track_id": track_id,
                            "confidence": confidence,
                        }
                    )
                    self.last_event_frames[track_id] = frame_index
            else:
                is_entry = not self.untracked_active and not untracked_seen
                cooldown_elapsed = (
                    frame_index - self.last_untracked_event_frame >= self.cooldown_frames
                )
                should_emit = is_entry if self.untracked_episode_mode else cooldown_elapsed
                if should_emit:
                    events.append(
                        {
                            "frame": frame_index,
                            "track_id": None,
                            "confidence": confidence,
                        }
                    )
                    self.last_untracked_event_frame = frame_index
                untracked_seen = True
        self.active_tracks = intruding_tracks
        self.untracked_active = untracked_seen
        return {"events": events, "intrusion_count": intrusion_count}
