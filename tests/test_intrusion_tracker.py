import copy
import unittest

from app.services.intrusion import is_person_intrusion
from app.services.intrusion_tracker import IntrusionTracker


ZONE = {"x1": 10, "y1": 10, "x2": 90, "y2": 90}


def detection(track_id=1, *, inside=True, class_name="person"):
    bbox = (
        {"x1": 30, "y1": 30, "x2": 50, "y2": 50}
        if inside
        else {"x1": 100, "y1": 100, "x2": 120, "y2": 120}
    )
    return {
        "class_name": class_name,
        "confidence": 0.9,
        "bbox": bbox,
        "track_id": track_id,
    }


def legacy_video_tracking(frames, cooldown_frames):
    """Pre-extraction video algorithm used as a behavioral parity oracle."""
    active_tracks = set()
    last_event_frames = {}
    last_untracked_event_frame = float("-inf")
    events = []
    intrusion_count = 0
    for frame_index, detections in frames:
        intruding_tracks = set()
        for item in detections:
            intruding = is_person_intrusion(item["class_name"], item["bbox"], ZONE)
            item["is_intrusion"] = intruding
            if not intruding:
                continue
            intrusion_count += 1
            track_id = item.get("track_id")
            if track_id is not None:
                intruding_tracks.add(track_id)
                last_seen = last_event_frames.get(track_id, float("-inf"))
                if track_id not in active_tracks or frame_index - last_seen >= cooldown_frames:
                    events.append(
                        {"frame": frame_index, "track_id": track_id, "confidence": item["confidence"]}
                    )
                    last_event_frames[track_id] = frame_index
            elif frame_index - last_untracked_event_frame >= cooldown_frames:
                events.append(
                    {"frame": frame_index, "track_id": None, "confidence": item["confidence"]}
                )
                last_untracked_event_frame = frame_index
        active_tracks = intruding_tracks
    return events, intrusion_count, frames


class IntrusionTrackerTests(unittest.TestCase):
    def test_video_behavior_matches_pre_extraction_algorithm(self):
        frames = [
            (0, [detection(1), detection(9, class_name="car")]),
            (1, [detection(1), detection(2, inside=False)]),
            (4, [detection(1), detection(None)]),
            (5, [detection(1), detection(None)]),
            (6, []),
            (7, [detection(1), detection(None)]),
            (10, [detection(None)]),
        ]
        expected_frames = copy.deepcopy(frames)
        actual_frames = copy.deepcopy(frames)
        expected = legacy_video_tracking(expected_frames, cooldown_frames=4)

        tracker = IntrusionTracker(ZONE, cooldown_frames=4)
        events = []
        intrusion_count = 0
        for frame_index, detections in actual_frames:
            result = tracker.process_frame(detections, frame_index)
            events.extend(result["events"])
            intrusion_count += result["intrusion_count"]

        self.assertEqual((events, intrusion_count, actual_frames), expected)

    def test_live_mode_emits_once_per_entry_and_rearms_after_exit(self):
        tracker = IntrusionTracker(
            ZONE,
            cooldown_frames=2,
            repeat_active_after_cooldown=False,
        )
        events = []
        frames = [
            (0, [detection(4)]),
            (1, [detection(4)]),
            (20, [detection(4)]),
            (21, []),
            (22, [detection(4)]),
        ]
        for frame_index, detections in frames:
            events.extend(tracker.process_frame(detections, frame_index)["events"])
        self.assertEqual([event["frame"] for event in events], [0, 22])

    def test_missing_zone_marks_detections_non_intruding(self):
        item = detection()
        result = IntrusionTracker(None, cooldown_frames=1).process_frame([item], 0)
        self.assertEqual(result, {"events": [], "intrusion_count": 0})
        self.assertFalse(item["is_intrusion"])

    def test_live_untracked_detection_is_one_episode_until_exit(self):
        tracker = IntrusionTracker(
            ZONE,
            cooldown_frames=2,
            repeat_active_after_cooldown=False,
            untracked_episode_mode=True,
        )
        events = []
        for frame_index, detections in [
            (0, [detection(None)]),
            (10, [detection(None)]),
            (11, []),
            (12, [detection(None)]),
        ]:
            events.extend(tracker.process_frame(detections, frame_index)["events"])
        self.assertEqual([event["frame"] for event in events], [0, 12])


if __name__ == "__main__":
    unittest.main()
