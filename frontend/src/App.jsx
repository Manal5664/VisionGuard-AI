import { useEffect, useRef, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import { useZoneDrawer } from "./useZoneDrawer";
import Cameras from "./Cameras";
import Dashboard from "./Dashboard";
import DetectionTest from "./DetectionTest";
import DetectionViewer from "./DetectionViewer";
import EventsPage from "./EventsPage";
import NotificationCenter from "./NotificationCenter";
import VideoDetection from "./VideoDetection";
import useNotifications from "./useNotifications";

const API_BASE = "http://127.0.0.1:8000";
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "events", label: "Events" },
  { id: "cameras", label: "Cameras" },
  { id: "setup", label: "Restricted Zones" },
  { id: "test", label: "Image Detection" },
  { id: "video", label: "Video Detection" },
];

export default function App() {
  const [view, setView] = useState("dashboard");
  const [imageUrl, setImageUrl] = useState(null);
  const [imageName, setImageName] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoneName, setZoneName] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedZone, setSavedZone] = useState(null);
  const [notificationRefreshToken, setNotificationRefreshToken] = useState(0);
  const [eventRefreshToken, setEventRefreshToken] = useState(0);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const notificationState = useNotifications(API_BASE, notificationRefreshToken);

  const fileInputRef = useRef(null);

  const {
    wrapperRef,
    rect,
    clear,
    getDisplayPoint,
    pointerHandlers,
  } = useZoneDrawer({
    enabled: Boolean(imageUrl),
    onReset: () => {
      setStatus(null);
      setSavedZone(null);
    },
  });

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    clear();
    setStatus(null);
    setSavedZone(null);
  };

  const handleImageLoad = (event) => {
    setNaturalSize({
      width: event.target.naturalWidth,
      height: event.target.naturalHeight,
    });
  };

  const handleClear = () => {
    clear();
    setZoneName("");
    setStatus(null);
    setSavedZone(null);
  };

  const handleSave = async () => {
    if (!imageUrl) {
      setStatus({ type: "error", message: "Choose an image first." });
      return;
    }
    if (!rect || Math.abs(rect.x2 - rect.x1) < 1 || Math.abs(rect.y2 - rect.y1) < 1) {
      setStatus({ type: "error", message: "Draw a rectangle over the image first." });
      return;
    }
    if (!zoneName.trim()) {
      setStatus({ type: "error", message: "Enter a zone name." });
      return;
    }

    const bounds = wrapperRef.current.getBoundingClientRect();
    const coordinates = displayToImage(
      rect,
      bounds.width,
      bounds.height,
      naturalSize.width,
      naturalSize.height,
    );
    if (!coordinates) {
      setStatus({ type: "error", message: "Could not compute image coordinates." });
      return;
    }

    const payload = { name: zoneName.trim(), ...coordinates };

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 201) {
        const created = await response.json();
        setSavedZone(created);
        setStatus({
          type: "success",
          message: `Zone "${created.name}" saved successfully.`,
        });
      } else {
        let detail = `Server responded with status ${response.status}.`;
        try {
          const data = await response.json();
          if (data?.detail) {
            detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
        } catch {
          // response body was not JSON
        }
        setStatus({ type: "error", message: `Save failed: ${detail}` });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: `Save failed: ${error.message}. Is the backend running at ${API_BASE}?`,
      });
    } finally {
      setSaving(false);
    }
  };

  const drawRect = rect ? normalizeRect(rect) : null;

  const bounds = wrapperRef.current?.getBoundingClientRect();
  const previewCoords = displayToImage(
    drawRect,
    bounds?.width ?? 0,
    bounds?.height ?? 0,
    naturalSize.width,
    naturalSize.height,
  );

  const handleVideoEventsChanged = () => {
    setNotificationRefreshToken((token) => token + 1);
    setEventRefreshToken((token) => token + 1);
  };

  const handleViewDetection = (notification) => {
    notificationState.markRead(notification);
    setSelectedNotification(notification);
  };

  return (
    <>
      <header className="app-topbar">
        <button type="button" className="app-brand" onClick={() => setView("dashboard")}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 2.5 20 6v5.5c0 5.2-3.3 8.5-8 10-4.7-1.5-8-4.8-8-10V6l8-3.5Z" />
              <path d="m8.7 12 2.1 2.1 4.7-4.7" />
            </svg>
          </span>
          <span>
            <strong>VisionGuard</strong>
            <small>Security intelligence</small>
          </span>
        </button>
        <nav className="nav" aria-label="Page navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link${view === item.id ? " nav-link-active" : ""}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <NotificationCenter
          notifications={notificationState.notifications}
          readIds={notificationState.readIds}
          unreadCount={notificationState.unreadCount}
          loading={notificationState.loading}
          error={notificationState.error}
          onRefresh={notificationState.loadNotifications}
          onMarkAllRead={notificationState.markAllRead}
          onView={handleViewDetection}
        />
      </header>
      {view === "dashboard" ? (
        <Dashboard
          apiBase={API_BASE}
          notifications={notificationState.notifications}
          readIds={notificationState.readIds}
          unreadCount={notificationState.unreadCount}
          onViewDetection={handleViewDetection}
          onNavigate={setView}
          refreshToken={eventRefreshToken}
        />
      ) : view === "events" ? (
        <EventsPage
          apiBase={API_BASE}
          onViewDetection={handleViewDetection}
          refreshToken={eventRefreshToken}
        />
      ) : view === "cameras" ? (
        <Cameras
          apiBase={API_BASE}
          onEventsChanged={handleVideoEventsChanged}
        />
      ) : view === "setup" ? (
        <div className="page">
          <header className="header">
            <h1>VisionGuard</h1>
            <p className="subtitle">Restricted Zone Setup</p>
          </header>

      <main className="card">
        <section className="panel">
          <div className="panel-header">
            <h2>1 · Choose an image</h2>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              {imageName ? "Change image" : "Choose image"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />
          </div>

          {imageUrl ? (
            <div className="preview-wrap">
              <div
                ref={wrapperRef}
                className="draw-canvas"
                {...pointerHandlers}
              >
                <img
                  src={imageUrl}
                  alt="Selected preview"
                  onLoad={handleImageLoad}
                  draggable={false}
                />
                {drawRect && (
                  <div
                    className="zone-rect"
                    style={{
                      left: drawRect.x1,
                      top: drawRect.y1,
                      width: drawRect.x2 - drawRect.x1,
                      height: drawRect.y2 - drawRect.y1,
                    }}
                  />
                )}
              </div>
              <p className="hint">
                Click and drag over the image to draw the restricted zone.
              </p>
            </div>
          ) : (
            <div className="placeholder">
              <p>No image selected yet.</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                Choose an image
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>2 · Define the zone</h2>
          </div>

          <label className="field">
            <span className="label">Zone name</span>
            <input
              type="text"
              value={zoneName}
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="e.g. Main Entrance"
            />
          </label>

          <div className="coords-row">
            <span className="label">Image coordinates</span>
            {previewCoords ? (
              <code className="coords">
                x1: {previewCoords.x1}, y1: {previewCoords.y1}, x2: {previewCoords.x2}, y2:{" "}
                {previewCoords.y2}
              </code>
            ) : (
              <span className="muted">Draw a rectangle to preview coordinates.</span>
            )}
          </div>

          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Zone"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleClear}
              disabled={saving}
            >
              Clear Zone
            </button>
          </div>

          {status && (
            <p className={`status status-${status.type}`} role="status">
              {status.message}
            </p>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Restricted zones are stored in the VisionGuard PostgreSQL database.</p>
      </footer>
      </div>
    ) : view === "test" ? (
      <DetectionTest onEventsChanged={() => setEventRefreshToken((token) => token + 1)} />
    ) : (
      <VideoDetection
        onNotificationsChanged={handleVideoEventsChanged}
      />
    )}
      {selectedNotification && (
        <DetectionViewer
          apiBase={API_BASE}
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      )}
    </>
  );
}
