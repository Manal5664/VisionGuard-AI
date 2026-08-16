import { useEffect } from "react";
import {
  formatVideoTime,
  getDetectionSeekTime,
  getNotificationVideoUrl,
} from "./notificationUtils";
import Icon from "./components/ui/Icon";

export default function DetectionViewer({ apiBase, notification, onClose }) {
  const mediaUrl = getNotificationVideoUrl(apiBase, notification.media_path);
  const isCameraEvent = notification.source === "camera";
  const seekSeconds = notification.video_time_seconds == null
    ? Number.NaN
    : Number(notification.video_time_seconds);
  const zoneName = notification.zone_name || "Restricted area";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={isCameraEvent ? "Camera intrusion snapshot" : "Intrusion detection video"}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <span className="modal-header-eyebrow">
              <Icon name="alert" />
              Security alert
            </span>
            <strong>{zoneName}</strong>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {isCameraEvent ? (
          <img
            className="modal-media"
            src={mediaUrl}
            alt={`Intrusion detected in ${zoneName}`}
          />
        ) : (
          <video
            className="modal-media"
            src={mediaUrl}
            controls
            autoPlay
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              const targetTime = getDetectionSeekTime(seekSeconds, video.duration);
              if (targetTime !== null) video.currentTime = targetTime;
            }}
          />
        )}
        <p className="modal-time">
          {isCameraEvent
            ? `Live camera #${notification.camera_id ?? "unknown"}`
            : `Video time: ${formatVideoTime(notification.video_time_seconds)}`}
        </p>
      </section>
    </div>
  );
}
