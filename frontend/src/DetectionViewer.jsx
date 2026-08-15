import { useEffect } from "react";
import {
  formatVideoTime,
  getDetectionSeekTime,
  getNotificationVideoUrl,
} from "./notificationUtils";

export default function DetectionViewer({ apiBase, notification, onClose }) {
  const videoUrl = getNotificationVideoUrl(apiBase, notification.media_path);
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
    <div className="detection-viewer-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="detection-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Intrusion detection video"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="detection-viewer-header">
          <div>
            <span>SECURITY ALERT</span>
            <strong>{zoneName}</strong>
          </div>
          <button type="button" className="detection-viewer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <video
          className="detection-viewer-video"
          src={videoUrl}
          controls
          autoPlay
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            const targetTime = getDetectionSeekTime(seekSeconds, video.duration);
            if (targetTime !== null) video.currentTime = targetTime;
          }}
        />
        <p className="detection-viewer-time">
          Video time: {formatVideoTime(notification.video_time_seconds)}
        </p>
      </section>
    </div>
  );
}
