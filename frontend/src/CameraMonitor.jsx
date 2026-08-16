import { useCallback, useEffect, useRef, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import useAlarm from "./useAlarm";
import { useZoneDrawer } from "./useZoneDrawer";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import FormField from "./components/ui/FormField";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import StatusPill from "./components/ui/StatusPill";
import SecurityAlertBanner from "./components/security/SecurityAlertBanner";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

const STATUS_LABEL = {
  starting: "Starting",
  running: "Live",
  stopping: "Stopping",
  error: "Error",
  stopped: "Stopped",
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

export default function CameraMonitor({ apiBase, camera, onBack, onEventsChanged }) {
  const initialStatus = camera.monitor || { status: "stopped", event_count: 0 };
  const [monitorStatus, setMonitorStatus] = useState(initialStatus);
  const [monitoring, setMonitoring] = useState(ACTIVE_STATUSES.has(initialStatus.status));
  const [streamVersion, setStreamVersion] = useState(Date.now());
  const [zones, setZones] = useState([]);
  const [zoneName, setZoneName] = useState("");
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [pendingAction, setPendingAction] = useState(null);
  const [status, setStatus] = useState(null);
  const [fps, setFps] = useState(null);
  const [alertTime, setAlertTime] = useState(null);
  const {
    muted,
    activeEvent,
    pulseActive,
    unlockAudio,
    toggleMuted,
    triggerAlarm,
    clearAlerts,
  } = useAlarm();
  const { wrapperRef, rect, clear, pointerHandlers } = useZoneDrawer({
    enabled: monitoring,
    onReset: () => setStatus(null),
  });

  const prevFramesRef = useRef({});
  const fpsRef = useRef({});
  const startedAtRef = useRef(null);

  const loadZones = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/cameras/${camera.id}/zones`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);
      setZones(await response.json());
    } catch (loadError) {
      setStatus({ type: "error", message: `Zones could not be loaded: ${loadError.message}` });
    }
  }, [apiBase, camera.id]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  useEffect(() => {
    const source = new EventSource(`${apiBase}/api/cameras/${camera.id}/events/stream`);
    const handleIntrusion = (message) => {
      try {
        const intrusionEvent = JSON.parse(message.data);
        triggerAlarm(intrusionEvent);
        setAlertTime(new Date());
        setMonitorStatus((current) => ({
          ...current,
          event_count: Number(current.event_count || 0) + 1,
        }));
        onEventsChanged?.();
      } catch {
        setStatus({ type: "error", message: "A live intrusion alert could not be read." });
      }
    };
    source.addEventListener("intrusion", handleIntrusion);
    return () => {
      source.removeEventListener("intrusion", handleIntrusion);
      source.close();
    };
  }, [apiBase, camera.id, onEventsChanged, triggerAlarm]);

  useEffect(() => {
    if (!monitoring) return undefined;
    const poll = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cameras/${camera.id}/monitor/status`);
        if (!response.ok) return;
        const nextStatus = await response.json();
        setMonitorStatus(nextStatus);
        if (ACTIVE_STATUSES.has(nextStatus.status)) {
          const now = Date.now();
          const frame = nextStatus.frame ?? 0;
          const previous = prevFramesRef.current;
          const delta = previous.time ? (now - previous.time) / 1000 : null;
          if (previous.time && delta && delta >= 0.8) {
            const instant = (frame - previous.frame) / delta;
            if (instant >= 0) {
              const smooth = fpsRef.current != null ? fpsRef.current * 0.6 + instant * 0.4 : instant;
              fpsRef.current = smooth;
              setFps(smooth);
            }
          }
          if (startedAtRef.current == null) startedAtRef.current = now;
          prevFramesRef.current = { frame, time: now };
        } else {
          setMonitoring(false);
          prevFramesRef.current = {};
          fpsRef.current = null;
          setFps(null);
          if (nextStatus.error) {
            setStatus({ type: "error", message: nextStatus.error });
          }
        }
      } catch {
        // The MJPEG stream remains authoritative during brief status failures.
      }
    };
    const timer = setInterval(poll, 1500);
    return () => clearInterval(timer);
  }, [apiBase, camera.id, monitoring]);

  const startMonitoring = async () => {
    unlockAudio();
    setPendingAction("start");
    setStatus(null);
    startedAtRef.current = null;
    fpsRef.current = null;
    try {
      const response = await fetch(
        `${apiBase}/api/cameras/${camera.id}/monitor/start`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `Server responded with status ${response.status}.`);
      }
      const nextStatus = await response.json();
      setMonitorStatus(nextStatus);
      setMonitoring(true);
      setStreamVersion(Date.now());
      setStatus({ type: "success", message: "Live webcam monitoring started." });
    } catch (startError) {
      setStatus({ type: "error", message: `Monitoring could not start: ${startError.message}` });
    } finally {
      setPendingAction(null);
    }
  };

  const stopMonitoring = async () => {
    setPendingAction("stop");
    setStatus(null);
    try {
      const response = await fetch(
        `${apiBase}/api/cameras/${camera.id}/monitor/stop`,
        { method: "POST" },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `Server responded with status ${response.status}.`);
      }
      setMonitorStatus(await response.json());
      setMonitoring(false);
      clearAlerts();
      prevFramesRef.current = {};
      fpsRef.current = null;
      setFps(null);
      setStatus({ type: "success", message: "Monitoring stopped and the webcam was released." });
    } catch (stopError) {
      setStatus({ type: "error", message: `Monitoring could not stop: ${stopError.message}` });
    } finally {
      setPendingAction(null);
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

  const saveZone = async () => {
    if (!previewCoords) {
      setStatus({ type: "error", message: "Draw a restricted zone over the live frame first." });
      return;
    }
    if (!zoneName.trim()) {
      setStatus({ type: "error", message: "Enter a zone name." });
      return;
    }
    setPendingAction("zone");
    setStatus(null);
    try {
      const response = await fetch(`${apiBase}/api/cameras/${camera.id}/zones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: zoneName.trim(), ...previewCoords }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.detail || `Server responded with status ${response.status}.`);
      }
      const zone = await response.json();
      setZones((current) => [zone, ...current]);
      clear();
      setZoneName("");
      setStatus({
        type: "success",
        message: `Zone "${zone.name}" is now active for this camera.`,
      });
    } catch (saveError) {
      setStatus({ type: "error", message: `Zone could not be saved: ${saveError.message}` });
    } finally {
      setPendingAction(null);
    }
  };

  const activeZone = zones[0];
  const confidence = Number(activeEvent?.confidence);
  const duration =
    startedAtRef.current != null ? (Date.now() - startedAtRef.current) / 1000 : null;

  return (
    <div>
      <PageHeader
        eyebrow="Live camera monitor"
        title={camera.name}
        description={`Local webcam index ${camera.webcam_index}`}
        actions={
          <div className="page-header-actions">
            <Button variant="ghost" icon="arrowLeft" onClick={onBack}>
              Back to Cameras
            </Button>
            <Button
              variant="secondary"
              icon={muted ? "volumeOff" : "volume"}
              onClick={toggleMuted}
              aria-pressed={muted}
            >
              {muted ? "Unmute alerts" : "Mute alerts"}
            </Button>
            {monitoring ? (
              <Button
                variant="danger"
                icon="close"
                onClick={stopMonitoring}
                loading={pendingAction === "stop"}
              >
                {pendingAction === "stop" ? "Stopping..." : "Stop Monitoring"}
              </Button>
            ) : (
              <Button
                variant="primary"
                icon="play"
                onClick={startMonitoring}
                loading={pendingAction === "start"}
              >
                {pendingAction === "start" ? "Starting..." : "Start Monitoring"}
              </Button>
            )}
          </div>
        }
      />

      {status && <p className={`status status-${status.type}`} role="status">{status.message}</p>}

      {activeEvent && (
        <SecurityAlertBanner
          label="Security Alert"
          title={`A person entered the restricted area "${activeEvent.zone_name || activeZone?.name || "Camera zone"}".`}
          meta={[
            `Camera: ${camera.name}`,
            `Track ID: ${activeEvent.track_id == null ? "Unavailable" : `#${activeEvent.track_id}`}`,
            `Confidence: ${Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : "Unavailable"}`,
            `Alert time: ${alertTime ? alertTime.toLocaleTimeString() : new Date().toLocaleTimeString()}`,
          ]}
        />
      )}

      <div className="camera-monitor-grid">
        <Card
          className="monitor-stage-card"
          eyebrow="MJPEG preview"
          title="Live feed"
          actions={
            <StatusPill status={monitorStatus.status} className={monitorStatus.status}>
              {STATUS_LABEL[monitorStatus.status] || "Stopped"}
            </StatusPill>
          }
          flush
        >
          {monitoring ? (
            <div className="live-stage live-stage-wide">
              <div
                className={`annotated-frame${pulseActive ? " intrusion-active" : ""}`}
              >
                <div ref={wrapperRef} className="draw-canvas" {...pointerHandlers}>
                  <img
                    key={streamVersion}
                    className="camera-stream-image"
                    src={`${apiBase}/api/cameras/${camera.id}/monitor/stream?v=${streamVersion}`}
                    alt={`Live feed from ${camera.name}`}
                    draggable={false}
                    onLoad={(event) => setNaturalSize({
                      width: event.currentTarget.naturalWidth,
                      height: event.currentTarget.naturalHeight,
                    })}
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
              </div>
              <div className="feed-chips">
                <span className="feed-chip feed-chip-live">LIVE</span>
                {fps != null && (
                  <span className="feed-chip">
                    <Icon name="gauge" />
                    {Math.round(fps)} fps
                  </span>
                )}
                {duration != null && (
                  <span className="feed-chip">
                    <Icon name="clock" />
                    {formatDuration(duration)}
                  </span>
                )}
                <span className="feed-chip">
                  <Icon name="alert" />
                  {monitorStatus.event_count || 0} events
                </span>
              </div>
            </div>
          ) : (
            <div className="camera-offline-placeholder">
              <Icon name="camera" />
              <strong>Webcam is stopped</strong>
              <span>Start monitoring to open the device and display the live feed.</span>
            </div>
          )}
          <div className="camera-runtime-meta">
            <span className="meta-chip">Frame: {monitorStatus.frame || 0}</span>
            <span className="meta-chip">Source: Webcam only</span>
          </div>
        </Card>

        <Card className="monitor-panel" eyebrow="Camera-specific" title="Restricted zone">
          <div className="camera-zone-stack">
            {activeZone ? (
              <p className="hint">
                Active zone: <strong className="mono">{activeZone.name}</strong>
              </p>
            ) : (
              <p className="muted">No zone is active. The preview can run without creating intrusion events.</p>
            )}
            <span className="hint">Start the feed, then drag over it to draw a new active zone.</span>
            <FormField label="Zone name">
              <input
                value={zoneName}
                onChange={(event) => setZoneName(event.target.value)}
                placeholder="e.g. Front Door"
                disabled={!monitoring}
              />
            </FormField>
            <div className="coords-box">
              <span className="coords-label">Camera coordinates</span>
              {previewCoords ? (
                <code className="coords-value">
                  x1: {previewCoords.x1}, y1: {previewCoords.y1}, x2: {previewCoords.x2}, y2:{" "}
                  {previewCoords.y2}
                </code>
              ) : (
                <span className="muted">Draw a rectangle on the live feed.</span>
              )}
            </div>
            <div className="actions">
              <Button
                variant="primary"
                icon="check"
                onClick={saveZone}
                loading={pendingAction === "zone"}
                disabled={!monitoring}
              >
                {pendingAction === "zone" ? "Saving..." : "Save Camera Zone"}
              </Button>
              <Button variant="secondary" icon="close" onClick={clear} disabled={!rect}>
                Clear Drawing
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
