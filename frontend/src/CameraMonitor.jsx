import { useCallback, useEffect, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import useAlarm from "./useAlarm";
import { useZoneDrawer } from "./useZoneDrawer";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

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
        if (!ACTIVE_STATUSES.has(nextStatus.status)) {
          setMonitoring(false);
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

  return (
    <div className="workspace-page camera-monitor-page">
      <header className="workspace-header camera-monitor-header">
        <div>
          <button type="button" className="text-button camera-back-button" onClick={onBack}>
            Back to Cameras
          </button>
          <span className="eyebrow">Live camera monitor</span>
          <h1>{camera.name}</h1>
          <p>Local webcam index {camera.webcam_index}</p>
        </div>
        <div className="camera-monitor-actions">
          <button type="button" className="button button-secondary" onClick={toggleMuted} aria-pressed={muted}>
            {muted ? "Unmute alerts" : "Mute alerts"}
          </button>
          {monitoring ? (
            <button
              type="button"
              className="button button-danger"
              onClick={stopMonitoring}
              disabled={pendingAction === "stop"}
            >
              {pendingAction === "stop" ? "Stopping..." : "Stop Monitoring"}
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              onClick={startMonitoring}
              disabled={pendingAction === "start"}
            >
              {pendingAction === "start" ? "Starting..." : "Start Monitoring"}
            </button>
          )}
        </div>
      </header>

      {status && <p className={`status status-${status.type}`} role="status">{status.message}</p>}

      {activeEvent && (
        <div className="intrusion-alert" role="alert" aria-live="assertive">
          <div className="intrusion-alert-heading">
            <span className="intrusion-alert-label">SECURITY ALERT</span>
            <strong>
              A person entered the restricted area &quot;{activeEvent.zone_name || activeZone?.name || "Camera zone"}&quot;.
            </strong>
          </div>
          <div className="intrusion-alert-meta">
            <span>Camera: {camera.name}</span>
            <span>Track ID: {activeEvent.track_id == null ? "Unavailable" : `#${activeEvent.track_id}`}</span>
            <span>Confidence: {Number.isFinite(confidence) ? `${(confidence * 100).toFixed(1)}%` : "Unavailable"}</span>
          </div>
        </div>
      )}

      <div className="camera-monitor-layout">
        <section className="dashboard-panel live-camera-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">MJPEG preview</span>
              <h2>Live feed</h2>
            </div>
            <span className={`camera-status camera-status-${monitorStatus.status}`}>
              {monitoring ? "Live" : monitorStatus.status === "error" ? "Error" : "Stopped"}
            </span>
          </div>

          {monitoring ? (
            <div className={pulseActive ? "annotated-video-frame intrusion-active" : "annotated-video-frame"}>
              <div ref={wrapperRef} className="draw-canvas camera-draw-canvas" {...pointerHandlers}>
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
          ) : (
            <div className="camera-offline-placeholder">
              <strong>Webcam is stopped</strong>
              <span>Start monitoring to open the device and display the live feed.</span>
            </div>
          )}

          <div className="camera-runtime-meta">
            <span>Session events: {monitorStatus.event_count || 0}</span>
            <span>Frame: {monitorStatus.frame || 0}</span>
            <span>Source: Webcam only</span>
          </div>
        </section>

        <aside className="dashboard-panel camera-zone-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Camera-specific</span>
              <h2>Restricted zone</h2>
            </div>
          </div>
          {activeZone ? (
            <p className="camera-active-zone">
              Active zone: <strong>{activeZone.name}</strong>
            </p>
          ) : (
            <p className="muted">No zone is active. The preview can run without creating intrusion events.</p>
          )}
          <p className="hint">Start the feed, then drag over it to draw a new active zone.</p>
          <label className="field">
            <span className="label">Zone name</span>
            <input
              value={zoneName}
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="e.g. Front Door"
              disabled={!monitoring}
            />
          </label>
          <div className="coords-row">
            <span className="label">Camera coordinates</span>
            {previewCoords ? (
              <code className="coords">
                x1: {previewCoords.x1}, y1: {previewCoords.y1}, x2: {previewCoords.x2}, y2: {previewCoords.y2}
              </code>
            ) : (
              <span className="muted">Draw a rectangle on the live feed.</span>
            )}
          </div>
          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={saveZone}
              disabled={!monitoring || pendingAction === "zone"}
            >
              {pendingAction === "zone" ? "Saving..." : "Save Camera Zone"}
            </button>
            <button type="button" className="button button-secondary" onClick={clear} disabled={!rect}>
              Clear Drawing
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
