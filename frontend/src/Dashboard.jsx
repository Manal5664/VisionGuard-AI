import { useCallback, useEffect, useState } from "react";
import SecurityMessage from "./SecurityMessage";

const EMPTY_SUMMARY = {
  total_events: 0,
  total_intrusions: 0,
  total_detections: 0,
  image_events: 0,
  video_events: 0,
  events_today: 0,
};

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, zonesResponse] = await Promise.all([
        fetch(`${apiBase}/api/events/summary`),
        fetch(`${apiBase}/api/zones`),
      ]);
      if (!summaryResponse.ok || !zonesResponse.ok) {
        const status = !summaryResponse.ok ? summaryResponse.status : zonesResponse.status;
        throw new Error(`Server responded with status ${status}.`);
      }

      const [nextSummary, zones] = await Promise.all([
        summaryResponse.json(),
        zonesResponse.json(),
      ]);
      setSummary({ ...EMPTY_SUMMARY, ...nextSummary });
      setZoneCount(Array.isArray(zones) ? zones.length : 0);
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

  const recentNotifications = notifications.slice(0, 4);

  return (
    <div className="workspace-page dashboard-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">System overview</span>
          <h1>Dashboard</h1>
          <p>Monitor security activity and move quickly to the tools you need.</p>
        </div>
        <button type="button" className="button button-secondary refresh-button" onClick={loadDashboard}>
          <RefreshIcon />
          Refresh
        </button>
      </header>

      {error && (
        <p className="status status-error dashboard-status" role="alert">
          {error}
        </p>
      )}

      <section className="metric-grid" aria-label="Event summary">
        <MetricCard
          label="Total events"
          value={summary.total_events}
          detail={`${summary.events_today} recorded today`}
          tone="blue"
          loading={loading}
          icon={<ActivityIcon />}
        />
        <MetricCard
          label="Security alerts"
          value={summary.total_intrusions}
          detail={`${summary.video_events} from video`}
          tone="red"
          loading={loading}
          icon={<AlertIcon />}
        />
        <MetricCard
          label="Object detections"
          value={summary.total_detections}
          detail={`${summary.image_events} image events total`}
          tone="green"
          loading={loading}
          icon={<ScanIcon />}
        />
        <MetricCard
          label="Restricted zones"
          value={zoneCount}
          detail="Saved monitoring areas"
          tone="amber"
          loading={loading}
          icon={<ZoneIcon />}
        />
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel recent-alerts-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Latest activity</span>
              <h2>Recent security alerts</h2>
            </div>
            <div className="section-heading-actions">
              <span className="unread-chip">{unreadCount} unread</span>
              <button type="button" className="text-button" onClick={() => onNavigate("events")}>
                View all
              </button>
            </div>
          </div>

          <div className="dashboard-alert-list">
            {recentNotifications.length === 0 ? (
              <div className="empty-state compact-empty">
                <AlertIcon />
                <strong>No video intrusion alerts yet</strong>
                <span>New restricted-zone alerts will appear here.</span>
              </div>
            ) : (
              recentNotifications.map((notification) => (
                <SecurityMessage
                  key={notification.id}
                  notification={notification}
                  unread={!readIds.has(String(notification.id))}
                  onView={onViewDetection}
                />
              ))
            )}
          </div>
        </section>

        <aside className="dashboard-panel quick-actions-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Shortcuts</span>
              <h2>Quick actions</h2>
            </div>
          </div>
          <div className="quick-action-list">
            <QuickAction
              title="Analyze an image"
              copy="Run object detection against your saved zone."
              onClick={() => onNavigate("test")}
              icon={<ScanIcon />}
            />
            <QuickAction
              title="Process a video"
              copy="Track intrusions and review playback alerts."
              onClick={() => onNavigate("video")}
              icon={<VideoIcon />}
            />
            <QuickAction
              title="Configure a zone"
              copy="Draw and save a restricted monitoring area."
              onClick={() => onNavigate("setup")}
              icon={<ZoneIcon />}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value, detail, tone, loading, icon }) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <div className="metric-card-icon">{icon}</div>
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
      <span className="quick-action-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <span className="quick-action-arrow" aria-hidden="true">→</span>
    </button>
  );
}

function ActivityIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2.4-6 4.2 12 2.4-6h5" /></svg>;
}

function AlertIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg>;
}

function ScanIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4" /><circle cx="12" cy="12" r="3" /></svg>;
}

function ZoneIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z" /><path d="m4 9 4-4m12 4-4-4M4 15l4 4m12-4-4 4" /></svg>;
}

function VideoIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.7-2.5L20 11M4 13l2.2 4.5A7 7 0 0 0 17.9 15" /></svg>;
}
