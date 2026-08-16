import test from "node:test";
import assert from "node:assert/strict";
import {
  getCrossedPlaybackEvents,
  getPlaybackEvents,
  rearmPlaybackEventsAfterBackwardSeek,
} from "./playbackAlertUtils.js";

test("video alerts fire at crossed timestamps, deduplicate, and rearm after rewind", () => {
  const playbackEvents = getPlaybackEvents({
    id: "job-1",
    fps: 25,
    events: [{ frame: 75, track_id: 8 }, { frame: 25, track_id: 4 }],
  });
  assert.deepEqual(playbackEvents.map((item) => item.timeSeconds), [1, 3]);
  const triggered = new Set();
  const firstCrossing = getCrossedPlaybackEvents(playbackEvents, 0.5, 1.2, triggered);
  assert.equal(firstCrossing.length, 1);
  triggered.add(firstCrossing[0].key);
  assert.equal(getCrossedPlaybackEvents(playbackEvents, 0.8, 1.2, triggered).length, 0);
  rearmPlaybackEventsAfterBackwardSeek(playbackEvents, triggered, 0.5);
  assert.equal(getCrossedPlaybackEvents(playbackEvents, 0.5, 1.2, triggered).length, 1);
});
