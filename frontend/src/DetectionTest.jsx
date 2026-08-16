import { useEffect, useRef, useState } from "react";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import StepIndicator from "./components/ui/StepIndicator";

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
    <div>
      <PageHeader
        eyebrow="Image analysis"
        title="Image Detection"
        description="Run object detection on a single image and check restricted-zone intrusions."
      />

      <StepIndicator
        steps={[
          { id: "image", label: "Choose an image", sub: imageName || "jpg / png" },
          { id: "run", label: "Run detection", sub: running ? "Analyzing" : "Ready" },
          { id: "review", label: "Review results", sub: result ? "Complete" : "—" },
        ]}
        current={running ? 1 : result ? 2 : 0}
      />

      <Card eyebrow="Step 1 · Input" title="Choose an image" className="video-step-panel">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFileChange}
        />
        {imageUrl ? (
          <div className="zone-draw-preview">
            <div className="draw-canvas">
              <img src={imageUrl} alt="Selected preview" draggable={false} />
            </div>
            <span className="hint">
              The YOLO model will detect objects and check for restricted-zone intrusions.
            </span>
            <Button
              variant="secondary"
              icon="image"
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
            >
              Change image
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="drop-zone"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
          >
            <span className="drop-zone-icon" aria-hidden="true">
              <Icon name="image" />
            </span>
            <strong>No image selected yet</strong>
            <span>Choose an image to run object detection.</span>
          </button>
        )}
      </Card>

      <Card eyebrow="Step 2 · Analyze" title="Run detection">
        <div className="stack">
          <div className="actions">
            <Button
              variant="primary"
              icon="scan"
              onClick={handleRun}
              loading={running}
            >
              {running ? "Running detection…" : "Run Detection"}
            </Button>
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
            <div>
              <div className="result-summary">
                <span className="badge badge-info">{result.count} object(s) detected</span>
                <span className={`badge ${intrusionCount > 0 ? "badge-danger" : "badge-success"}`}>
                  {intrusionCount} intrusion(s)
                </span>
              </div>

              <div className="annotated-frame">
                <img
                  className="video-results-media"
                  src={`${API_BASE}${result.annotated_image_path}`}
                  alt="Annotated detection result"
                />
              </div>

              {result.detections.length > 0 && (
                <div className="detect-list" style={{ marginTop: "var(--sp-4)" }}>
                  {result.detections.map((detection, index) => (
                    <div className="detect-row" key={index}>
                      <div className="detect-row-copy">
                        <strong>{detection.class_name}</strong>
                        <small>{(detection.confidence * 100).toFixed(1)}%</small>
                      </div>
                      {detection.is_intrusion ? (
                        <span className="badge badge-danger">Intrusion</span>
                      ) : (
                        <span className="badge badge-success">OK</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
