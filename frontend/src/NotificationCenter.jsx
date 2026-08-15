import { useEffect, useRef, useState } from "react";
import SecurityMessage from "./SecurityMessage";

export default function NotificationCenter({
  notifications,
  readIds,
  unreadCount,
  loading,
  error,
  onRefresh,
  onMarkAllRead,
  onView,
}) {
  const [open, setOpen] = useState(false);
  const centerRef = useRef(null);

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

  const handleViewDetection = (notification) => {
    setOpen(false);
    onView(notification);
  };

  return (
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
          if (nextOpen) onRefresh();
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
              onClick={onMarkAllRead}
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
                <button type="button" className="button button-secondary" onClick={onRefresh}>
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
