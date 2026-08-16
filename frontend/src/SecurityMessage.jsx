import { formatVideoTime } from "./notificationUtils";
import Icon from "./components/ui/Icon";

export default function SecurityMessage({ notification, unread, onView }) {
  const zoneName = notification.zone_name || "Restricted area";
  const confidence = notification.confidence == null
    ? Number.NaN
    : Number(notification.confidence);
  const canView = Boolean(notification.media_path);
  const isCameraEvent = notification.source === "camera";

  return (
    <article className={`security-message${unread ? " security-message-unread" : ""}`}>
      <div className="security-message-title">
        <span className="security-message-icon" aria-hidden="true">
          <Icon name="alert" size={11} />
        </span>
        <span>Security alert</span>
        {unread && <span className="security-unread-dot" aria-label="Unread" />}
      </div>
      <p className="security-message-copy">
        A person entered the restricted area &quot;{zoneName}&quot;.
      </p>
      <dl className="security-message-details">
        <div>
          <dt>{isCameraEvent ? "Source" : "Video time"}</dt>
          <dd className="plain">
            {isCameraEvent
              ? `Camera #${notification.camera_id ?? "unknown"}`
              : formatVideoTime(notification.video_time_seconds)}
          </dd>
        </div>
        <div>
          <dt>Track ID</dt>
          <dd>{notification.track_id == null ? "Unavailable" : String(notification.track_id)}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd className="plain">
            {Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : "Unavailable"}
          </dd>
        </div>
      </dl>
      <ButtonSmall canView={canView} onView={() => onView(notification)} />
    </article>
  );
}

function ButtonSmall({ canView, onView }) {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={onView}
      disabled={!canView}
    >
      {canView ? "View Detection" : "Detection unavailable"}
    </button>
  );
}
