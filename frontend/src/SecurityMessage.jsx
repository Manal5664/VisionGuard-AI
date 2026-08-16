import { formatVideoTime } from "./notificationUtils";

export default function SecurityMessage({ notification, unread, onView }) {
  const zoneName = notification.zone_name || "Restricted area";
  const confidence = notification.confidence == null
    ? Number.NaN
    : Number(notification.confidence);
  const canView = Boolean(notification.media_path);

  return (
    <article className={`security-message${unread ? " security-message-unread" : ""}`}>
      <div className="security-message-title">
        <span className="security-message-icon" aria-hidden="true">!</span>
        <span>SECURITY ALERT</span>
        {unread && <span className="security-unread-dot" aria-label="Unread" />}
      </div>
      <p className="security-message-copy">
        A person entered the restricted area &quot;{zoneName}&quot;.
      </p>
      <dl className="security-message-details">
        <div>
          <dt>{notification.source === "camera" ? "Source" : "Video time"}</dt>
          <dd>
            {notification.source === "camera"
              ? `Camera #${notification.camera_id ?? "unknown"}`
              : formatVideoTime(notification.video_time_seconds)}
          </dd>
        </div>
        <div>
          <dt>Track ID</dt>
          <dd>{notification.track_id == null ? "Unavailable" : `#${notification.track_id}`}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : "Unavailable"}</dd>
        </div>
      </dl>
      <button
        type="button"
        className="notification-view-button"
        onClick={() => onView(notification)}
        disabled={!canView}
      >
        {canView ? "View Detection" : "Detection unavailable"}
      </button>
    </article>
  );
}
