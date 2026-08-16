import { useCallback, useEffect, useState } from "react";
import CameraMonitor from "./CameraMonitor";

export default function Cameras({ apiBase, onEventsChanged }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [name, setName] = useState("");
  const [webcamIndex, setWebcamIndex] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadCameras = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/cameras`);
      if (!response.ok) throw new Error(`Server responded with status ${response.status}.`);
      setCameras(await response.json());
      setError(null);
    } catch (loadError) {
      setError(`Cameras could not be loaded: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

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
    <div className="workspace-page cameras-page">
      <header className="workspace-header">
        <div>
          <span className="eyebrow">Live security</span>
          <h1>Cameras</h1>
          <p>Add a local webcam and open its focused live monitor.</p>
        </div>
        <button type="button" className="button button-secondary" onClick={loadCameras}>
          Refresh
        </button>
      </header>

      {error && <p className="status status-error" role="alert">{error}</p>}

      <div className="camera-layout">
        <section className="dashboard-panel camera-list-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Configured sources</span>
              <h2>Webcams</h2>
            </div>
          </div>
          <div className="camera-list">
            {loading ? (
              <p className="muted">Loading cameras...</p>
            ) : cameras.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>No cameras configured</strong>
                <span>Add the webcam connected to this backend computer.</span>
              </div>
            ) : (
              cameras.map((camera) => (
                <article className="camera-card" key={camera.id}>
                  <div>
                    <span className={`camera-status camera-status-${camera.monitor?.status}`}>
                      {camera.monitor?.status === "running" ? "Live" : "Stopped"}
                    </span>
                    <h3>{camera.name}</h3>
                    <p>Local webcam index {camera.webcam_index}</p>
                  </div>
                  <button type="button" className="button button-primary" onClick={() => setSelectedCamera(camera)}>
                    Open Monitor
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="dashboard-panel add-camera-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Phase 1 source</span>
              <h2>Add webcam</h2>
            </div>
          </div>
          <form className="camera-form" onSubmit={createCamera}>
            <label className="field">
              <span className="label">Camera name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Front desk" />
            </label>
            <label className="field">
              <span className="label">Webcam index</span>
              <input type="number" min="0" value={webcamIndex} onChange={(event) => setWebcamIndex(event.target.value)} />
            </label>
            <button type="submit" className="button button-primary" disabled={saving || !name.trim()}>
              {saving ? "Adding..." : "Add Camera"}
            </button>
            <p className="hint">RTSP is reserved for a later phase and is not enabled here.</p>
          </form>
        </section>
      </div>
    </div>
  );
}
