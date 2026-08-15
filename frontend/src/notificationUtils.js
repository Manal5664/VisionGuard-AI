export const READ_NOTIFICATION_IDS_KEY = "visionguard.read-notification-ids.v1";

export function deduplicateNotifications(notifications) {
  const seenIds = new Set();

  return notifications.filter((notification) => {
    const id = String(notification?.id ?? "");
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}

export function loadReadNotificationIds(storage) {
  try {
    const stored = JSON.parse(storage?.getItem(READ_NOTIFICATION_IDS_KEY) ?? "[]");
    if (!Array.isArray(stored)) return new Set();
    return new Set(stored.map(String));
  } catch {
    return new Set();
  }
}

export function saveReadNotificationIds(storage, readIds) {
  try {
    storage?.setItem(READ_NOTIFICATION_IDS_KEY, JSON.stringify([...readIds]));
  } catch {
    // Notifications still work when storage is unavailable or full.
  }
}

export function countUnreadNotifications(notifications, readIds) {
  return notifications.reduce(
    (count, notification) => count + (readIds.has(String(notification.id)) ? 0 : 1),
    0,
  );
}

export function markNotificationsRead(readIds, notifications) {
  const nextReadIds = new Set(readIds);
  notifications.forEach((notification) => nextReadIds.add(String(notification.id)));
  return nextReadIds;
}

export function formatVideoTime(seconds) {
  if (seconds === null || seconds === undefined || seconds === "") return "Unavailable";
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds < 0) return "Unavailable";

  const wholeSeconds = Math.floor(numericSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function getNotificationVideoUrl(apiBase, mediaPath) {
  if (!mediaPath) return null;
  const normalizedPath = String(mediaPath).replaceAll("\\", "/").replace(/^\/+/, "");
  return `${apiBase}/${normalizedPath}`;
}

export function getDetectionSeekTime(videoTimeSeconds, durationSeconds) {
  if (
    videoTimeSeconds === null ||
    videoTimeSeconds === undefined ||
    videoTimeSeconds === ""
  ) {
    return null;
  }

  const seekSeconds = Number(videoTimeSeconds);
  if (!Number.isFinite(seekSeconds) || seekSeconds < 0) return null;

  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration)) return seekSeconds;
  return Math.min(seekSeconds, Math.max(0, duration - 0.01));
}
