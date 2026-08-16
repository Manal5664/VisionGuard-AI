import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import EmptyState from "./components/ui/EmptyState";
import FormField from "./components/ui/FormField";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import StatusPill from "./components/ui/StatusPill";
import CameraMonitor from "./CameraMonitor";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

const STATUS_TEXT = {
  running: "LIVE",
  starting: "STARTING",
  stopping: "STOPPING",
  stopped: "STOPPED",
  error: "OFFLINE",
};

function formatDuration(totalSeconds) {
  if (totalSeconds == null) return "-";
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function Cameras({ apiBase, onEventsChanged }) {
  const [cameras, setCameras] = useState([]);
  const [zones, setZones] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [name, setName] = useState("");
  const [webcamIndex, setWebcamIndex] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fpsMap, setFpsMap] = useState({});
  const [, setTick] = useState(0);

  const prevFramesRef = useRef({});
  const fpsRef = useRef({});
  const startedAtRef = useRef({});

  const loadCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [camerasResponse, zonesResponse] = await Promise.all([
        fetch(`${apiBase}/api/cameras`),
        fetch(`${apiBase}/api/zones`),
      ]);
      if (!camerasResponse.ok) {
        throw new Error(`Server responded with status ${camerasResponse.status}.`);
      }
      setCameras(await camerasResponse.json());
      if (zonesResponse.ok) setZones(await zonesResponse.json());
    } catch (loadError) {
      setError(`Cameras could not be loaded: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cameras`);
        if (!response.ok) return;
        const next = await response.json();
        if (cancelled || !Array.isArray(next)) return;

        const now = Date.now();
        const fpsUpdates = {};
        for (const camera of next) {
          const id = String(camera.id);
          const status = camera.monitor?.status;
          const frame = camera.monitor?.frame ?? 0;
          const active = ACTIVE_STATUSES.has(status);
          if (active) {
            const previous = prevFramesRef.current[id];
            const delta = previous ? (now - previous.time) / 1000 : null;
            if (previous && delta && delta >= 0.8) {
              const instant = (frame - previous.frame) / delta;
              if (instant >= 0) {
                const smooth =
                  fpsRef.current[id] != null ? fpsRef.current[id] * 0.6 + instant * 0.4 : instant;
                fpsRef.current[id] = smooth;
                fpsUpdates[id] = smooth;
              } else {
                fpsUpdates[id] = fpsRef.current[id] ?? 0;
              }
            } else {
              fpsUpdates[id] = fpsRef.current[id] ?? 0;
            }
            if (startedAtRef.current[id] == null) startedAtRef.current[id] = now;
            prevFramesRef.current[id] = { frame, time: now };
          } else {
            delete prevFramesRef.current[id];
            delete fpsRef.current[id];
            delete startedAtRef.current[id];
          }
        }
        setCameras(next);
        setFpsMap((previous) => {
          const merged = { ...previous };
          for (const id in fpsUpdates) merged[id] = fpsUpdates[id];
          for (const id of Object.keys(merged)) {
            if (!(id in fpsUpdates)) delete merged[id];
          }
          return merged;
        });
      } catch {
        // Transient failures keep the last known state.
      }
    };
    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBase]);

  const zoneByCamera = useMemo(() => {
    const map = {};
    for (const zone of zones) {
      if (zone.camera_id != null && map[zone.camera_id] == null) map[zone.camera_id] = zone;
    }
    return map;
  }, [zones]);

  const monitoringCount = cameras.filter((camera) =>
    ACTIVE_STATUSES.has(camera.monitor?.status),
  ).length;
  const stoppedCount = cameras.filter((camera) =>
    camera.monitor?.status === "stopped" || camera.monitor?.status === "error",
  ).length;
  const threatCount = cameras.reduce(
    (sum, camera) => sum + (camera.monitor?.event_count ?? 0),
    0,
  );

  const createCamera = async (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          source_type: "webcam",
          webcam_index: Number(webcamIndex),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `Server responded with status ${response.status}.`);
      }
      setName("");
      setWebcamIndex("0");
      setFormOpen(false);
      await loadCameras();
    } catch (saveError) {
      setError(`Camera could not be added: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (selectedCamera) {
    return (
      <CameraMonitor
        apiBase={apiBase}
        camera={selectedCamera}
        onBack={() => {
          setSelectedCamera(null);
          loadCameras();
        }}
        onEventsChanged={onEventsChanged}
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Live security"
        title="Cameras"
        description="Add a local webcam and open its focused live monitor."
        actions={
          <>
            <Button variant="secondary" icon="refresh" onClick={loadCameras} loading={loading}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
              Add Camera
            </Button>
          </>
        }
      />

      {error && <p className="status status-error" role="alert">{error}</p>}

      <section className="camera-summary" aria-label="Camera summary">
        <SummaryStat label="Total cameras" value={cameras.length} icon="camera" tone="blue" />
        <SummaryStat label="Monitoring" value={monitoringCount} icon="activity" tone="green" />
        <SummaryStat
          label="Stopped / offline"
          value={stoppedCount}
          icon="cameraOff"
          tone="neutral"
        />
        <SummaryStat
          label="Recent intrusions"
          value={threatCount}
          icon="alert"
          tone={threatCount > 0 ? "red" : "neutral"}
        />
      </section>

      {loading ? (
        <Card flush>
          <div className="loading-row">
            <span className="spinner spinner-sm" />
            Loading cameras...
          </div>
        </Card>
      ) : cameras.length === 0 ? (
        <Card flush>
          <EmptyState
            icon="camera"
            title="No cameras configured"
            description="Add the webcam connected to this backend computer."
            actions={
              <Button variant="primary" icon="plus" onClick={() => setFormOpen(true)}>
                Add Camera
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="camera-grid">
          {cameras.map((camera) => (
            <CameraCard
              key={camera.id}
              camera={camera}
              apiBase={apiBase}
              fps={fpsMap[String(camera.id)]}
              startedAt={startedAtRef.current[String(camera.id)]}
              zone={zoneByCamera[camera.id]}
              onOpenMonitor={() => setSelectedCamera(camera)}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <AddCameraModal
          name={name}
          webcamIndex={webcamIndex}
          saving={saving}
          onNameChange={setName}
          onWebcamIndexChange={setWebcamIndex}
          onSubmit={createCamera}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function SummaryStat({ label, value, icon, tone }) {
  return (
    <div className="summary-stat">
      <span className={`summary-stat-icon tone-${tone}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="summary-stat-copy">
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}

function CameraCard({ camera, apiBase, fps, startedAt, zone, onOpenMonitor }) {
  const monitor = camera.monitor || {};
  const status = monitor.status || "stopped";
  const active = ACTIVE_STATUSES.has(status);
  const duration = active && startedAt ? (Date.now() - startedAt) / 1000 : null;
  const eventCount = monitor.event_count ?? 0;

  return (
    <article className="camera-card">
      <div className="camera-thumb">
        {active ? (
          <img
            src={`${apiBase}/api/cameras/${camera.id}/monitor/stream`}
            alt={`Live preview from ${camera.name}`}
          />
        ) : (
          <span className="camera-thumb-offline">
            <Icon name={status === "error" ? "cameraOff" : "camera"} />
            <span>{status === "error" ? "Camera unavailable" : "No live feed"}</span>
          </span>
        )}

        <div className="camera-thumb-top">
          <StatusPill status={status}>{STATUS_TEXT[status] || status}</StatusPill>
          {active && fps != null && (
            <span className="overlay-chip">
              <Icon name="gauge" />
              {Math.round(fps)} fps
            </span>
          )}
        </div>

        {active && (
          <div className="camera-thumb-bottom">
            <span className="overlay-chip">
              <Icon name="clock" />
              {formatDuration(duration)}
            </span>
            <span className="overlay-chip">
              <Icon name="alert" />
              {eventCount} {eventCount === 1 ? "event" : "events"}
            </span>
          </div>
        )}
      </div>

      <div className="camera-card-body">
        <div className="camera-card-copy">
          <strong>{camera.name}</strong>
          <small>Webcam index {camera.webcam_index}</small>
        </div>
      </div>

      <div className="camera-card-footer">
        <div className="camera-card-tags">
          {zone ? (
            <span className="meta-chip zone-chip">
              <Icon name="zone" />
              {zone.name}
            </span>
          ) : (
            <span className="meta-chip">No zone</span>
          )}
        </div>
        <Button variant="secondary" size="sm" iconRight="chevronRight" onClick={onOpenMonitor}>
          Open Monitor
        </Button>
      </div>
    </article>
  );
}

function AddCameraModal({
  name,
  webcamIndex,
  saving,
  onNameChange,
  onWebcamIndexChange,
  onSubmit,
  onClose,
}) {
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
        className="modal modal-narrow"
        role="dialog"
        aria-modal="true"
        aria-label="Add a webcam"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header modal-header-plain">
          <div>
            <span className="modal-header-eyebrow">
              <Icon name="camera" />
              Source
            </span>
            <strong>Add webcam</strong>
            <small>Register a webcam connected to the backend computer.</small>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>

        <form className="camera-form" onSubmit={onSubmit}>
          <FormField label="Camera name">
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Front desk"
              autoFocus
            />
          </FormField>
          <FormField label="Webcam index">
            <input
              type="number"
              min="0"
              value={webcamIndex}
              onChange={(event) => onWebcamIndexChange(event.target.value)}
            />
          </FormField>
          <span className="hint">RTSP is reserved for a later phase and is not enabled here.</span>
          <div className="actions modal-actions">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon="plus" type="submit" loading={saving} disabled={!name.trim()}>
              {saving ? "Adding..." : "Add Camera"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
