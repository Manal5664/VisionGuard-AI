import { useEffect, useRef, useState } from "react";
import Button from "./components/ui/Button";
import Icon from "./components/ui/Icon";
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
    const handleScrollLock = () => {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return previous;
    };
    const previousOverflow = handleScrollLock();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
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
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="notification-overlay"
            aria-hidden="true"
            onPointerDown={() => setOpen(false)}
          />
          <section className="notification-panel" role="dialog" aria-label="Security notifications">
            <div className="notification-panel-header">
              <div>
                <strong>Security notifications</strong>
                <small>{unreadCount} unread</small>
              </div>
              <div className="notification-panel-actions">
                <Button
                  variant="ghost"
                  icon="check"
                  onClick={onMarkAllRead}
                  disabled={unreadCount === 0}
                >
                  Mark all read
                </Button>
                <Button variant="ghost" icon="refresh" onClick={onRefresh} disabled={loading}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="notification-list">
              {loading && notifications.length === 0 ? (
                <p className="notification-empty">Loading security alerts…</p>
              ) : error && notifications.length === 0 ? (
                <div className="notification-empty">
                  <p>{error}</p>
                  <Button variant="secondary" onClick={onRefresh}>
                    Retry
                  </Button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="notification-empty">
                  <Icon name="bell" />
                  <p>No intrusion notifications yet.</p>
                </div>
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
        </>
      )}
    </div>
  );
}
