import { useEffect, useRef, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function DetectionTest({ onEventsChanged }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageName, setImageName] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);

  const fileInputRef = useRef(null);

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
    setStatus(null);
    setResult(null);
  };

  const handleRun = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ type: "error", message: "Choose an image first." });
      return;
    }

    const body = new FormData();
    body.append("file", file);

    setRunning(true);
    setResult(null);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/api/detect`, {
        method: "POST",
        body,
      });

      if (response.ok) {
        const data = await response.json();
        setResult(data);
        setStatus({
          type: "success",
          message: `Detection complete: ${data.count} object(s) found.`,
        });
        onEventsChanged?.();
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
        setStatus({ type: "error", message: `Detection failed: ${detail}` });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: `Detection failed: ${error.message}. Is the backend running at ${API_BASE}?`,
      });
    } finally {
      setRunning(false);
    }
  };

  const intrusionCount = result
    ? result.detections.filter((detection) => detection.is_intrusion).length
    : 0;

  return (
    <div className="page">
      <header className="header">
        <h1>VisionGuard</h1>
        <p className="subtitle">Detection Test</p>
      </header>

      <main className="card">
        <section className="panel">
          <div className="panel-header">
            <h2>1 · Choose an image</h2>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
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
              <div className="draw-canvas">
                <img src={imageUrl} alt="Selected preview" draggable={false} />
              </div>
              <p className="hint">
                The YOLO model will detect objects and check for restricted-zone intrusions.
              </p>
            </div>
          ) : (
            <div className="placeholder">
              <p>No image selected yet.</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
              >
                Choose an image
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>2 · Run detection</h2>
          </div>

          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Running detection…" : "Run Detection"}
            </button>
          </div>

          {running && (
            <p className="status status-info" role="status">
              Analyzing image with the YOLO model… This may take a few seconds.
            </p>
          )}

          {status && !running && (
            <p className={`status status-${status.type}`} role="status">
              {status.message}
            </p>
          )}

          {result && (
            <div className="detect-results">
              <div className="detect-summary">
                <span>
                  {result.count} object(s) detected
                </span>
                <span className={intrusionCount > 0 ? "badge badge-danger" : "badge badge-ok"}>
                  {intrusionCount} intrusion(s)
                </span>
              </div>

              <img
                className="annotated-img"
                src={`${API_BASE}${result.annotated_image_path}`}
                alt="Annotated detection result"
              />

              {result.detections.length > 0 && (
                <table className="detect-table">
                  <thead>
                    <tr>
                      <th>Class</th>
                      <th>Confidence</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.detections.map((detection, index) => (
                      <tr key={index}>
                        <td>{detection.class_name}</td>
                        <td>{(detection.confidence * 100).toFixed(1)}%</td>
                        <td>
                          {detection.is_intrusion ? (
                            <span className="badge badge-danger">INTRUSION</span>
                          ) : (
                            <span className="badge badge-ok">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>Detection results use the saved restricted zone and are stored as events.</p>
      </footer>
    </div>
  );
}
