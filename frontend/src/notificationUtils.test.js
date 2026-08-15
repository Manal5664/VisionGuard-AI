import assert from "node:assert/strict";
import test from "node:test";
import {
  READ_NOTIFICATION_IDS_KEY,
  countUnreadNotifications,
  deduplicateNotifications,
  formatVideoTime,
  getNotificationVideoUrl,
  loadReadNotificationIds,
  markNotificationsRead,
  saveReadNotificationIds,
} from "./notificationUtils.js";

test("one persistent event ID produces one message even when refreshed repeatedly", () => {
  const notifications = deduplicateNotifications([
    { id: 11, track_id: 4 },
    { id: 11, track_id: 4 },
    { id: 12, track_id: 7 },
  ]);

  assert.deepEqual(notifications.map((item) => item.id), [11, 12]);
});

test("unread count and mark all as read use browser-local IDs", () => {
  const notifications = [{ id: 11 }, { id: 12 }];
  const initiallyRead = new Set(["11"]);
  assert.equal(countUnreadNotifications(notifications, initiallyRead), 1);

  const allRead = markNotificationsRead(initiallyRead, notifications);
  assert.equal(countUnreadNotifications(notifications, allRead), 0);

  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  saveReadNotificationIds(storage, allRead);
  assert.equal(values.has(READ_NOTIFICATION_IDS_KEY), true);
  assert.deepEqual([...loadReadNotificationIds(storage)].sort(), ["11", "12"]);
});

test("video time and old-event fallbacks are safe", () => {
  assert.equal(formatVideoTime(91.9), "01:31");
  assert.equal(formatVideoTime(null), "Unavailable");
  assert.equal(formatVideoTime(undefined), "Unavailable");
  assert.equal(
    getNotificationVideoUrl("http://127.0.0.1:8000", "outputs\\videos\\job.mp4"),
    "http://127.0.0.1:8000/outputs/videos/job.mp4",
  );
});
