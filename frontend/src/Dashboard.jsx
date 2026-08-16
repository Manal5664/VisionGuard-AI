import { useCallback, useEffect, useState } from "react";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import SecurityMessage from "./SecurityMessage";

const EMPTY_SUMMARY = {
  total_events: 0,
  total_intrusions: 0,
  total_detections: 0,
  image_events: 0,
  video_events: 0,
  camera_events: 0,
  events_today: 0,
};

function startOfTodayIso() {
  const now = new Date();
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return local.toISOString();
}

export default function Dashboard({
  apiBase,
  notifications,
  readIds,
  unreadCount,
  onViewDetection,
  onNavigate,
  refreshToken,
}) {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [zoneCount, setZoneCount] = useState(0);
  const [intrusionsToday, setIntrusionsToday] = useState(null);
  const [activeCameras, setActiveCameras] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const todayQuery = `event_type=intrusion&created_from=${encodeURIComponent(startOfTodayIso())}`;
      const [summaryResponse, zonesResponse, intrusionsResponse, camerasResponse] = await Promise.all([
        fetch(`${apiBase}/api/events/summary`),
        fetch(`${apiBase}/api/zones`),
        fetch(`${apiBase}/api/events?${todayQuery}`),
        fetch(`${apiBase}/api/cameras`),
      ]);
      if (
        !summaryResponse.ok ||
        !zonesResponse.ok ||
        !intrusionsResponse.ok ||
        !camerasResponse.ok
      ) {
        throw new Error("One or more dashboard endpoints failed.");
      }

      const [nextSummary, zones, intrusionsPage, nextCameras] = await Promise.all([
        summaryResponse.json(),
        zonesResponse.json(),
        intrusionsResponse.json(),
        camerasResponse.json(),
      ]);
      setSummary({ ...EMPTY_SUMMARY, ...nextSummary });
      setZoneCount(Array.isArray(zones) ? zones.length : 0);
      setIntrusionsToday(intrusionsPage.total ?? intrusionsPage.items?.length ?? 0);
      setActiveCameras(
        Array.isArray(nextCameras)
          ? nextCameras.filter((camera) => camera.monitor?.status === "running").length
          : 0,
      );
      if (Array.isArray(nextCameras)) setCameras(nextCameras);
      setError(null);
    } catch (loadError) {
      setError(`Dashboard data could not be refreshed: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshToken]);

  useEffect(() => {
    const poll = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cameras`);
        if (!response.ok) return;
        const nextCameras = await response.json();
        if (Array.isArray(nextCameras)) setCameras(nextCameras);
      } catch {
        // The preview keeps the last known state during transient failures.
      }
    };
    const timer = setInterval(poll, 5000);
    return () => clearInterval(timer);
  }, [apiBase]);

  const runningCamera = cameras.find((camera) => camera.monitor?.status === "running");
  const recentNotifications = notifications.slice(0, 4);
  const systemHealthy = !loading && !error && intrusionsToday === 0;

  return (
    <div>
      <PageHeader
        eyebrow="System overview"
        title="Dashboard"
        description="Monitor security activity and move quickly to the tools you need."
        actions={
          <Button variant="secondary" icon="refresh" onClick={loadDashboard} loading={loading}>
            Refresh
          </Button>
        }
      />

      {error && (
        <p className="status status-error" role="alert">
          {error}
        </p>
      )}

      <section className={`hero-strip ${loading ? "" : systemHealthy ? "hero-healthy" : "hero-alert"}`}>
        <div className="hero-status">
          <span
            className={`hero-status-icon tone-${loading ? "blue" : systemHealthy ? "green" : "red"}`}
            aria-hidden="true"
          >
            <Icon name={loading ? "clock" : systemHealthy ? "shield" : "alert"} />
          </span>
          <span className="hero-status-copy">
            <strong>{loading ? "Checking status..." : systemHealthy ? "All clear" : "Intrusion detected"}</strong>
            <span>
              {loading
                ? "Gathering live status from the backend."
                : systemHealthy
                  ? "No restricted-zone intrusions recorded today."
                  : `${intrusionsToday} intrusion(s) recorded today. Review recent alerts below.`}
            </span>
          </span>
        </div>
        <div className="hero-chips">
          <span className="hero-chip">
            <span className="hero-chip-label">
              <small>Intrusions today</small>
              <strong>{intrusionsToday == null ? "—" : intrusionsToday}</strong>
            </span>
            <span className={`hero-chip-dot ${loading ? "" : systemHealthy ? "status-online" : "status-offline"}`} />
          </span>
          <span className="hero-chip">
            <span className="hero-chip-label">
              <small>Active cameras</small>
              <strong>{activeCameras == null ? "—" : activeCameras}</strong>
            </span>
          </span>
          <span className="hero-chip">
            <span className="hero-chip-label">
              <small>Unread alerts</small>
              <strong>{unreadCount}</strong>
            </span>
          </span>
          <span className="hero-chip">
            <span className="hero-chip-label">
              <small>Events today</small>
              <strong>{summary.events_today}</strong>
            </span>
          </span>
          {!loading && (
            <span className={`system-health-chip ${systemHealthy ? "ok" : "threat"}`}>
              <span className="status-pill-dot" />
              {systemHealthy ? "System ready" : "Threat active"}
            </span>
          )}
        </div>
      </section>

      <section className="metric-grid" aria-label="Event summary">
        <MetricCard
          label="Total events"
          value={summary.total_events}
          detail={`${summary.events_today} recorded today`}
          tone="blue"
          loading={loading}
          icon="events"
        />
        <MetricCard
          label="Security alerts"
          value={summary.total_intrusions}
          detail={`${summary.video_events} video · ${summary.camera_events} live camera`}
          tone="red"
          loading={loading}
          icon="alert"
        />
        <MetricCard
          label="Object detections"
          value={summary.total_detections}
          detail={`${summary.image_events} image events total`}
          tone="green"
          loading={loading}
          icon="scan"
        />
        <MetricCard
          label="Restricted zones"
          value={zoneCount}
          detail="Saved monitoring areas"
          tone="blue"
          loading={loading}
          icon="zone"
        />
      </section>

      <div className="dashboard-grid">
        <Card
          eyebrow="Latest activity"
          title="Recent security alerts"
          actions={
            <div className="split" style={{ gap: "var(--sp-3)" }}>
              <span className="count-chip">{unreadCount} unread</span>
              <Button variant="ghost" iconRight="chevronRight" onClick={() => onNavigate("events")}>
                View all
              </Button>
            </div>
          }
          flush
        >
          {recentNotifications.length === 0 ? (
            <EmptyState
              icon="bell"
              title="No intrusion alerts yet"
              description="New restricted-zone alerts will appear here."
            />
          ) : (
            <div className="dashboard-alert-list">
              {recentNotifications.map((notification) => (
                <SecurityMessage
                  key={notification.id}
                  notification={notification}
                  unread={!readIds.has(String(notification.id))}
                  onView={onViewDetection}
                />
              ))}
            </div>
          )}
        </Card>

        <div className="dashboard-side">
          <Card eyebrow="Live monitoring" title="Camera preview">
            {runningCamera ? (
              <>
                <div className="dashboard-preview-wrap">
                  <img
                    className="dashboard-preview"
                    src={`${apiBase}/api/cameras/${runningCamera.id}/monitor/stream`}
                    alt={`Live preview from ${runningCamera.name}`}
                  />
                  <div className="dashboard-preview-overlay">
                    <span className="dashboard-preview-live">Live</span>
                    <span>
                      <strong>{runningCamera.name}</strong>
                      <span className="mono"> index {runningCamera.webcam_index}</span>
                    </span>
                  </div>
                </div>
                <div className="split" style={{ marginTop: "var(--sp-3)" }}>
                  <Button
                    variant="secondary"
                    iconRight="chevronRight"
                    onClick={() => onNavigate("cameras")}
                  >
                    Open Monitor
                  </Button>
                </div>
              </>
            ) : (
              <EmptyState
                icon="camera"
                title="No camera is live"
                description="Start monitoring a camera to preview it here."
                actions={
                  <Button variant="primary" icon="camera" onClick={() => onNavigate("cameras")}>
                    Go to Cameras
                  </Button>
                }
              />
            )}
          </Card>

          <Card eyebrow="Shortcuts" title="Quick actions">
            <div className="quick-action-list">
              <QuickAction
                title="Monitor a camera"
                copy="Open a configured webcam and its live zone."
                onClick={() => onNavigate("cameras")}
                icon="camera"
              />
              <QuickAction
                title="Analyze an image"
                copy="Run object detection against your saved zone."
                onClick={() => onNavigate("test")}
                icon="image"
              />
              <QuickAction
                title="Process a video"
                copy="Track intrusions and review playback alerts."
                onClick={() => onNavigate("video")}
                icon="video"
              />
              <QuickAction
                title="Configure a zone"
                copy="Draw and save a restricted monitoring area."
                onClick={() => onNavigate("setup")}
                icon="zone"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone, loading, icon }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span className="metric-card-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <div>
        <span className="metric-label">{label}</span>
        <strong className={loading ? "metric-value metric-value-loading" : "metric-value"}>
          {loading ? "—" : Number(value).toLocaleString()}
        </strong>
        <span className="metric-detail">{detail}</span>
      </div>
    </article>
  );
}

function QuickAction({ title, copy, onClick, icon }) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="quick-action-icon" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <span className="quick-action-arrow" aria-hidden="true">
        <Icon name="chevronRight" />
      </span>
    </button>
  );
}
