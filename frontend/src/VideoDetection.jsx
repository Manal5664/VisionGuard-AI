import { useEffect, useRef, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";
const POLL_INTERVAL_MS = 1500;

const statusText = {
  queued: "Waiting in queue…",
  processing: "Analyzing frames…",
  completed: "Detection complete",
  failed: "Detection failed",
};

export default function VideoDetection() {
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);

  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
    setStatus(null);
    setJob(null);
  };

  const handleRun = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus({ type: "error", message: "Choose a video first." });
      return;
    }

    const body = new FormData();
    body.append("file", file);

    setRunning(true);
    setJob(null);
    setStatus(null);
    stopPolling();

    try {
      const response = await fetch(`${API_BASE}/api/video-detect`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        let detail = `Server responded with status ${response.status}.`;
        try {
          const data = await response.json();
          if (data?.detail) {
            detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
          }
        } catch {
          // response body was not JSON
        }
        setStatus({ type: "error", message: `Upload failed: ${detail}` });
        setRunning(false);
        return;
      }

      const data = await response.json();
      setStatus({ type: "info", message: "Uploaded. Waiting for processing…" });
      startPolling(data.job_id);
    } catch (error) {
      setStatus({
        type: "error",
        message: `Upload failed: ${error.message}. Is the backend running at ${API_BASE}?`,
      });
      setRunning(false);
    }
  };

  const startPolling = (jobId) => {
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/video-jobs/${jobId}`);
        if (!response.ok) {
          stopPolling();
          setRunning(false);
          setStatus({ type: "error", message: `Could not fetch job status (${response.status}).` });
          return;
        }

        const data = await response.json();
        setJob(data);

        if (data.status === "completed") {
          stopPolling();
          setRunning(false);
          setStatus({
            type: "success",
            message: `${data.event_count} intrusion event(s) logged from ${data.processed_frames} analyzed frames.`,
          });
        } else if (data.status === "failed") {
          stopPolling();
          setRunning(false);
          setStatus({ type: "error", message: `Detection failed: ${data.error ?? "unknown error"}` });
        }
      } catch (error) {
        stopPolling();
        setRunning(false);
        setStatus({
          type: "error",
          message: `Status check failed: ${error.message}. Is the backend running at ${API_BASE}?`,
        });
      }
    };

    poll();
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);
  };

  const isProcessing = running || job?.status === "processing" || job?.status === "queued";

  return (
    <div className="page">
      <header className="header">
        <h1>VisionGuard</h1>
        <p className="subtitle">Video Detection</p>
      </header>

      <main className="card">
        <section className="panel">
          <div className="panel-header">
            <h2>1 · Choose a video</h2>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => fileInputRef.current?.click()}
              disabled={running}
            >
              {videoName ? "Change video" : "Choose video"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={handleFileChange}
            />
          </div>

          {videoUrl ? (
            <div className="preview-wrap">
              <video className="annotated-img" src={videoUrl} controls muted />
              <p className="hint">
                Frames are analyzed with YOLO tracking. Intrusions are logged once per person entry,
                not once per frame.
              </p>
            </div>
          ) : (
            <div className="placeholder">
              <p>No video selected yet.</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
              >
                Choose a video
              </button>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>2 · Run video detection</h2>
          </div>

          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Starting…" : "Run Video Detection"}
            </button>
          </div>

          {isProcessing && (
            <div className="video-progress" role="status">
              <div className="video-progress-label">
                <span>{job ? statusText[job.status] : "Preparing…"}</span>
                {job?.status === "processing" && <span>{job.progress}%</span>}
              </div>
              <div className="progress-track">
                <div className="progress-bar" style={{ width: `${job?.progress ?? 0}%` }} />
              </div>
            </div>
          )}

          {status && !isProcessing && (
            <p className={`status status-${status.type}`} role="status">
              {status.message}
            </p>
          )}

          {job?.status === "completed" && job.annotated_video_path && (
            <div className="detect-results">
              <div className="detect-summary">
                <span>{job.processed_frames} frame(s) analyzed</span>
                <span className={job.intrusion_count > 0 ? "badge badge-danger" : "badge badge-ok"}>
                  {job.intrusion_count} intrusion frame(s)
                </span>
                <span className={job.event_count > 0 ? "badge badge-danger" : "badge badge-ok"}>
                  {job.event_count} event(s)
                </span>
              </div>

              <video
                className="annotated-img"
                src={`${API_BASE}${job.annotated_video_path}`}
                controls
              />

              {job.events.length > 0 && (
                <table className="detect-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Track ID</th>
                      <th>Frame</th>
                      <th>Timestamp</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.events.map((event, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{event.track_id ?? "—"}</td>
                        <td>{event.frame}</td>
                        <td>{formatTimestamp(event.frame, job)}</td>
                        <td>{(event.confidence * 100).toFixed(1)}%</td>
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
        <p>Video analysis runs in the background and intrusion events are stored in the database.</p>
      </footer>
    </div>
  );
}

function formatTimestamp(frame, job) {
  if (!job?.fps) return null;
  const seconds = (frame / job.fps).toFixed(1);
  return `${seconds}s`;
}
