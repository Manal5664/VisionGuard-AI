import { useCallback, useEffect, useRef, useState } from "react";
import DetectionViewer from "./DetectionViewer";
import SecurityMessage from "./SecurityMessage";
import {
  countUnreadNotifications,
  deduplicateNotifications,
  loadReadNotificationIds,
  markNotificationsRead,
  saveReadNotificationIds,
} from "./notificationUtils";

export default function NotificationCenter({ apiBase, refreshToken }) {
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => loadReadNotificationIds(window.localStorage));
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const centerRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/notifications?limit=100`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);

      const data = await response.json();
      setNotifications(deduplicateNotifications(Array.isArray(data) ? data : []));
      setError(null);
    } catch (loadError) {
      setError(`Could not load security notifications: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, refreshToken]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (!centerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const persistReadIds = (nextReadIds) => {
    setReadIds(nextReadIds);
    saveReadNotificationIds(window.localStorage, nextReadIds);
  };

  const handleViewDetection = (notification) => {
    const nextReadIds = new Set(readIds);
    nextReadIds.add(String(notification.id));
    persistReadIds(nextReadIds);
    setOpen(false);
    setSelectedNotification(notification);
  };

  const unreadCount = countUnreadNotifications(notifications, readIds);

  return (
    <>
      <div className="notification-center" ref={centerRef}>
        <button
          type="button"
          className="notification-bell"
          aria-label={`Security notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen) loadNotifications();
          }}
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span className="notification-count" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <section className="notification-panel" role="dialog" aria-label="Security notifications">
            <div className="notification-panel-header">
              <div>
                <strong>Security notifications</strong>
                <span>{unreadCount} unread</span>
              </div>
              <button
                type="button"
                className="notification-mark-read"
                onClick={() => persistReadIds(markNotificationsRead(readIds, notifications))}
                disabled={unreadCount === 0}
              >
                Mark all as read
              </button>
            </div>

            <div className="notification-list">
              {loading && notifications.length === 0 ? (
                <p className="notification-empty">Loading security alerts…</p>
              ) : error && notifications.length === 0 ? (
                <div className="notification-empty">
                  <p>{error}</p>
                  <button type="button" className="button button-secondary" onClick={loadNotifications}>
                    Retry
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <p className="notification-empty">No intrusion notifications yet.</p>
              ) : (
                notifications.map((notification) => (
                  <SecurityMessage
                    key={notification.id}
                    notification={notification}
                    unread={!readIds.has(String(notification.id))}
                    onView={handleViewDetection}
                  />
                ))
              )}
            </div>
          </section>
        )}
      </div>

      {selectedNotification && (
        <DetectionViewer
          apiBase={apiBase}
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}
    </>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
