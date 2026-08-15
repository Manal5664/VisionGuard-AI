import { useEffect, useRef, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import { useZoneDrawer } from "./useZoneDrawer";

const API_BASE = "http://127.0.0.1:8000";
const POLL_INTERVAL_MS = 1500;
const FIRST_FRAME_TIME = 0.1;
const FRAME_EXTRACT_TIMEOUT_MS = 15000;
const ALERT_PULSE_MS = 1100;
const ALERT_GAP_MS = 120;
const PLAYBACK_TIME_EPSILON_SECONDS = 0.01;

const statusText = {
  queued: "Waiting in queue…",
  processing: "Analyzing frames…",
  completed: "Detection complete",
  failed: "Detection failed",
};

function extractFirstFrame(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    let timeoutId;

    const cleanup = () => {
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const succeed = (url, width, height) => {
      cleanup();
      resolve({ url, width, height });
    };

    const fail = (message) => {
      cleanup();
      reject(new Error(message));
    };

    const tryDraw = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height || video.readyState < 2) return;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        fail("Canvas drawing is not supported in this browser.");
        return;
      }

      context.drawImage(video, 0, 0);
      try {
        succeed(canvas.toDataURL("image/jpeg", 0.85), width, height);
      } catch {
        fail("Could not encode the first frame as an image.");
      }
    };

    const onLoadedMetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const target = Math.min(FIRST_FRAME_TIME, duration / 2 || FIRST_FRAME_TIME);
      try {
        video.currentTime = Math.max(0.01, target);
      } catch {
        // currentTime can throw in error states; the timeout reports the failure
      }
    };

    const onLoadedData = () => tryDraw();
    const onSeeked = () => tryDraw();

    const onError = () => {
      fail("Could not load the video. It may be corrupt or in an unsupported format.");
    };

    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = objectUrl;

    timeoutId = setTimeout(() => {
      fail(
        "Timed out extracting the first frame. The file may be corrupt or in an unsupported format.",
      );
    }, FRAME_EXTRACT_TIMEOUT_MS);
  });
}

export default function VideoDetection() {
  const [videoName, setVideoName] = useState("");
  const [firstFrameUrl, setFirstFrameUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoneName, setZoneName] = useState("");
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [muted, setMuted] = useState(false);
  const [activeIntrusionEvent, setActiveIntrusionEvent] = useState(null);
  const [intrusionPulseActive, setIntrusionPulseActive] = useState(false);

  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const pollTimerRef = useRef(null);
  const extractTokenRef = useRef(0);
  const audioContextRef = useRef(null);
  const mutedRef = useRef(false);
  const triggeredPlaybackEventKeysRef = useRef(new Set());
  const alertQueueRef = useRef([]);
  const alertQueueRunningRef = useRef(false);
  const alertTimerRef = useRef(null);
  const previousPlaybackTimeRef = useRef(0);
  const seekStartTimeRef = useRef(0);
  const isSeekingRef = useRef(false);

  const {
    wrapperRef,
    rect,
    clear,
    pointerHandlers,
  } = useZoneDrawer({
    enabled: Boolean(firstFrameUrl),
    onReset: () => setStatus(null),
  });

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close().catch(() => {});
      }
      extractTokenRef.current += 1;
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const clearPlaybackAlertPresentation = () => {
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
      alertTimerRef.current = null;
    }
    alertQueueRef.current = [];
    alertQueueRunningRef.current = false;
    setActiveIntrusionEvent(null);
    setIntrusionPulseActive(false);
  };

  const resetPlaybackAlerts = (previousTime = 0) => {
    clearPlaybackAlertPresentation();
    triggeredPlaybackEventKeysRef.current.clear();
    previousPlaybackTimeRef.current = previousTime;
    seekStartTimeRef.current = previousTime;
    isSeekingRef.current = false;
  };

  const unlockAudio = () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioContextConstructor();
      }

      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      return audioContextRef.current;
    } catch {
      audioContextRef.current = null;
      return null;
    }
  };

  const playAlertBeep = () => {
    const audioContext = audioContextRef.current;
    if (mutedRef.current || !audioContext || audioContext.state !== 'running') return;

    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch {
      // Audio failures must not interrupt completed detection results.
    }
  };

  const presentNextIntrusionEvent = () => {
    const nextPlaybackEvent = alertQueueRef.current.shift();
    if (!nextPlaybackEvent) {
      alertQueueRunningRef.current = false;
      setIntrusionPulseActive(false);
      return;
    }

    alertQueueRunningRef.current = true;
    setActiveIntrusionEvent(nextPlaybackEvent.event);
    setIntrusionPulseActive(true);
    playAlertBeep();

    alertTimerRef.current = setTimeout(() => {
      setActiveIntrusionEvent(null);
      setIntrusionPulseActive(false);
      alertTimerRef.current = null;

      if (alertQueueRef.current.length > 0) {
        alertTimerRef.current = setTimeout(() => {
          alertTimerRef.current = null;
          presentNextIntrusionEvent();
        }, ALERT_GAP_MS);
      } else {
        alertQueueRunningRef.current = false;
      }
    }, ALERT_PULSE_MS);
  };

  const enqueuePlaybackAlerts = (playbackEvents) => {
    alertQueueRef.current.push(...playbackEvents);

    if (!alertQueueRunningRef.current && alertQueueRef.current.length > 0) {
      presentNextIntrusionEvent();
    }
  };

  const handleMuteToggle = () => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) unlockAudio();
  };

  const handleVideoLoadedMetadata = (event) => {
    resetPlaybackAlerts(event.currentTarget.currentTime || 0);
  };

  const handleVideoPlay = (event) => {
    unlockAudio();
    const currentTime = event.currentTarget.currentTime;

    if (currentTime <= PLAYBACK_TIME_EPSILON_SECONDS) {
      resetPlaybackAlerts(currentTime - PLAYBACK_TIME_EPSILON_SECONDS);
    } else if (currentTime < previousPlaybackTimeRef.current) {
      previousPlaybackTimeRef.current = currentTime;
    }
  };

  const handleVideoTimeUpdate = (event) => {
    const video = event.currentTarget;
    const currentTime = video.currentTime;
    if (!Number.isFinite(currentTime) || isSeekingRef.current || video.seeking) return;

    if (video.paused || video.ended) {
      previousPlaybackTimeRef.current = currentTime;
      return;
    }

    const previousTime = previousPlaybackTimeRef.current;
    if (currentTime < previousTime) {
      previousPlaybackTimeRef.current = currentTime;
      return;
    }

    const crossedEvents = getCrossedPlaybackEvents(
      getPlaybackEvents(job),
      previousTime,
      currentTime,
      triggeredPlaybackEventKeysRef.current,
    );

    crossedEvents.forEach(({ key }) => triggeredPlaybackEventKeysRef.current.add(key));
    previousPlaybackTimeRef.current = currentTime;
    if (crossedEvents.length > 0) enqueuePlaybackAlerts(crossedEvents);
  };

  const handleVideoSeeking = () => {
    seekStartTimeRef.current = previousPlaybackTimeRef.current;
    isSeekingRef.current = true;
    clearPlaybackAlertPresentation();
  };

  const handleVideoSeeked = (event) => {
    const currentTime = event.currentTarget.currentTime;
    const seekingBackward =
      currentTime < seekStartTimeRef.current - PLAYBACK_TIME_EPSILON_SECONDS;

    if (seekingBackward) {
      rearmPlaybackEventsAfterBackwardSeek(
        getPlaybackEvents(job),
        triggeredPlaybackEventKeysRef.current,
        currentTime,
      );
    }

    if (currentTime <= PLAYBACK_TIME_EPSILON_SECONDS) {
      triggeredPlaybackEventKeysRef.current.clear();
    }

    previousPlaybackTimeRef.current = seekingBackward
      ? currentTime - PLAYBACK_TIME_EPSILON_SECONDS
      : currentTime;
    seekStartTimeRef.current = currentTime;
    isSeekingRef.current = false;
  };

  const handleVideoEnded = () => {
    resetPlaybackAlerts(-PLAYBACK_TIME_EPSILON_SECONDS);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const token = ++extractTokenRef.current;
    selectedFileRef.current = file;
    event.target.value = "";

    setVideoName(file.name);
    setFirstFrameUrl(null);
    setExtracting(true);
    setExtractError(null);
    setNaturalSize({ width: 0, height: 0 });
    setZoneName("");
    clear();
    setStatus(null);
    setJob(null);
    resetPlaybackAlerts();

    extractFirstFrame(file)
      .then(({ url, width, height }) => {
        if (token !== extractTokenRef.current) return;
        setFirstFrameUrl(url);
        setNaturalSize({ width, height });
      })
      .catch((error) => {
        if (token !== extractTokenRef.current) return;
        setExtractError(error.message);
      })
      .finally(() => {
        if (token === extractTokenRef.current) setExtracting(false);
      });
  };

  const handleClear = () => {
    clear();
    setZoneName("");
    setStatus(null);
  };

  const handleRun = async () => {
    const file = selectedFileRef.current;
    if (!file) {
      setStatus({ type: "error", message: "Choose a video first." });
      return;
    }
    if (!firstFrameUrl) {
      setStatus({
        type: "error",
        message: "The first frame could not be extracted. Choose another video.",
      });
      return;
    }
    if (!rect || Math.abs(rect.x2 - rect.x1) < 1 || Math.abs(rect.y2 - rect.y1) < 1) {
      setStatus({
        type: "error",
        message: "Draw a rectangle over the first frame to mark the zone.",
      });
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
      setStatus({ type: "error", message: "Could not compute zone coordinates." });
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("zone_name", zoneName.trim());
    body.append("x1", coordinates.x1);
    body.append("y1", coordinates.y1);
    body.append("x2", coordinates.x2);
    body.append("y2", coordinates.y2);

    resetPlaybackAlerts();
    unlockAudio();
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
            message: `${data.event_count} intrusion event(s) logged from ${data.processed_frames} analyzed frames${
              data.zone ? ` using zone "${data.zone.name}"` : ""
            }.`,
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
  const drawRect = rect ? normalizeRect(rect) : null;

  const bounds = wrapperRef.current?.getBoundingClientRect();
  const previewCoords = displayToImage(
    drawRect,
    bounds?.width ?? 0,
    bounds?.height ?? 0,
    naturalSize.width,
    naturalSize.height,
  );
  const displayedIntrusionEvent = activeIntrusionEvent;
  const intrusionTimestamp = displayedIntrusionEvent
    ? formatTimestamp(displayedIntrusionEvent.frame, job)
    : null;

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

          <div className="preview-wrap">
            {firstFrameUrl ? (
              <>
                <div ref={wrapperRef} className="draw-canvas" {...pointerHandlers}>
                  <img
                    src={firstFrameUrl}
                    alt="First frame of selected video"
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
                  Click and drag over the first frame to draw the restricted zone for this video.
                </p>
              </>
            ) : (
              <div className="placeholder">
                {extracting ? (
                  <p>Extracting the first frame…</p>
                ) : extractError ? (
                  <>
                    <p className="status status-error" role="status">
                      {extractError}
                    </p>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={running}
                    >
                      Choose a different video
                    </button>
                  </>
                ) : (
                  <>
                    <p>No video selected yet.</p>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={running}
                    >
                      Choose a video
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
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
              placeholder="e.g. Lobby camera"
              disabled={running}
            />
          </label>

          <div className="coords-row">
            <span className="label">Video coordinates</span>
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
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Starting…" : "Run Video Detection"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleClear}
              disabled={running}
            >
              Clear Zone
            </button>
            <button
              type='button'
              className='button button-secondary sound-toggle'
              onClick={handleMuteToggle}
              aria-pressed={muted}
            >
              {muted ? 'Unmute alerts' : 'Mute alerts'}
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

              <div className="zone-used">
                <span className="label">Zone used for this job</span>
                {job.zone ? (
                  <code className="coords">
                    {job.zone.name} · x1: {job.zone.x1}, y1: {job.zone.y1}, x2: {job.zone.x2}, y2:{" "}
                    {job.zone.y2}
                  </code>
                ) : (
                  <p className="muted">No zone was applied to this job.</p>
                )}
              </div>

              {activeIntrusionEvent && (
                <div className='intrusion-alert' role='alert' aria-live='assertive' aria-atomic='true'>
                  <div className='intrusion-alert-heading'>
                    <span className='intrusion-alert-label'>Security alert</span>
                    <strong>INTRUSION DETECTED</strong>
                  </div>
                  {(intrusionTimestamp || displayedIntrusionEvent?.track_id != null) && (
                    <div className='intrusion-alert-meta'>
                      {intrusionTimestamp && <span>Timestamp: {intrusionTimestamp}</span>}
                      {displayedIntrusionEvent?.track_id != null && (
                        <span>Track ID: {displayedIntrusionEvent.track_id}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div
                className={
                  intrusionPulseActive
                    ? 'annotated-video-frame intrusion-active'
                    : 'annotated-video-frame'
                }
              >
                <video
                className="annotated-img"
                src={`${API_BASE}/${job.annotated_video_path.replace(/^\/+/, "")}`}
                controls
                onLoadedMetadata={handleVideoLoadedMetadata}
                onPlay={handleVideoPlay}
                onTimeUpdate={handleVideoTimeUpdate}
                onSeeking={handleVideoSeeking}
                onSeeked={handleVideoSeeked}
                onEnded={handleVideoEnded}
                />
              </div>

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
        <p>
          Video analysis runs in the background using the zone drawn for this job. Intrusion events
          are stored in the database.
        </p>
      </footer>
    </div>
  );
}

function formatTimestamp(frame, job) {
  if (!job?.fps) return null;
  const seconds = (frame / job.fps).toFixed(1);
  return `${seconds}s`;
}

function getPlaybackEvents(job) {
  const fps = Number(job?.fps);
  if (!Number.isFinite(fps) || fps <= 0 || !Array.isArray(job?.events)) return [];

  return job.events
    .map((event, index) => {
      if (event?.frame == null) return null;
      const frame = Number(event.frame);
      if (!Number.isFinite(frame) || frame < 0) return null;

      return {
        event,
        key: [
          job.id ?? 'job',
          index,
          event.frame,
          event.track_id ?? 'untracked',
        ].join(':'),
        timeSeconds: frame / fps,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.timeSeconds - second.timeSeconds);
}

function getCrossedPlaybackEvents(
  playbackEvents,
  previousTime,
  currentTime,
  triggeredEventKeys,
) {
  if (
    !Number.isFinite(previousTime) ||
    !Number.isFinite(currentTime) ||
    currentTime <= previousTime
  ) {
    return [];
  }

  return playbackEvents.filter(
    ({ key, timeSeconds }) =>
      !triggeredEventKeys.has(key) &&
      timeSeconds > previousTime &&
      timeSeconds <= currentTime,
  );
}

function rearmPlaybackEventsAfterBackwardSeek(playbackEvents, triggeredEventKeys, targetTime) {
  const rearmFrom = targetTime - PLAYBACK_TIME_EPSILON_SECONDS;
  playbackEvents.forEach(({ key, timeSeconds }) => {
    if (timeSeconds >= rearmFrom) triggeredEventKeys.delete(key);
  });
}
