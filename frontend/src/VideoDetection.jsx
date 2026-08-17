import { useEffect, useRef, useState } from "react";
import { displayToImage, normalizeRect } from "./coords";
import { formatVideoTime } from "./notificationUtils";
import {
  getCrossedPlaybackEvents,
  getPlaybackEvents,
  PLAYBACK_TIME_EPSILON_SECONDS,
  rearmPlaybackEventsAfterBackwardSeek,
} from "./playbackAlertUtils";
import useAlarm from "./useAlarm";
import { useZoneDrawer } from "./useZoneDrawer";
import Button from "./components/ui/Button";
import Card from "./components/ui/Card";
import FormField from "./components/ui/FormField";
import Icon from "./components/ui/Icon";
import PageHeader from "./components/ui/PageHeader";
import ProgressBar from "./components/ui/ProgressBar";
import StepIndicator from "./components/ui/StepIndicator";
import SecurityAlertBanner from "./components/security/SecurityAlertBanner";
import { API_BASE } from "./config";

const POLL_INTERVAL_MS = 1500;
const FIRST_FRAME_TIME = 0.1;
const FRAME_EXTRACT_TIMEOUT_MS = 15000;
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

export default function VideoDetection({ onNotificationsChanged }) {
  const [videoName, setVideoName] = useState("");
  const [firstFrameUrl, setFirstFrameUrl] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [zoneName, setZoneName] = useState("");
  const [running, setRunning] = useState(false);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const {
    muted,
    activeEvent: activeIntrusionEvent,
    pulseActive: intrusionPulseActive,
    unlockAudio,
    toggleMuted: handleMuteToggle,
    enqueueAlerts,
    clearAlerts: clearPlaybackAlertPresentation,
  } = useAlarm();

  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const pollTimerRef = useRef(null);
  const extractTokenRef = useRef(0);
  const triggeredPlaybackEventKeysRef = useRef(new Set());
  const previousPlaybackTimeRef = useRef(0);
  const seekStartTimeRef = useRef(0);
  const isSeekingRef = useRef(false);
  const annotatedVideoRef = useRef(null);

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
      extractTokenRef.current += 1;
    };
  }, []);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const resetPlaybackAlerts = (previousTime = 0) => {
    clearPlaybackAlertPresentation();
    triggeredPlaybackEventKeysRef.current.clear();
    previousPlaybackTimeRef.current = previousTime;
    seekStartTimeRef.current = previousTime;
    isSeekingRef.current = false;
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
    if (crossedEvents.length > 0) {
      enqueueAlerts(crossedEvents.map(({ event: intrusionEvent }) => intrusionEvent));
    }
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
          onNotificationsChanged?.();
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
          message: `Status check failed: ${error.message}. Is the backend available?`,
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
  const intrusionVideoTime = displayedIntrusionEvent
    ? formatVideoTime(getEventVideoTimeSeconds(displayedIntrusionEvent, job))
    : null;
  const intrusionZoneName = displayedIntrusionEvent?.zone_name || job?.zone?.name || "Restricted area";
  const intrusionConfidence = Number(displayedIntrusionEvent?.confidence);

  return (
    <div>
      <PageHeader
        eyebrow="Video analysis"
        title="Video Detection"
        description="Upload video, draw a restricted zone, and review the intrusion timeline. CPU-only hosted processing can be slow."
      />

      <StepIndicator
        steps={[
          { id: "video", label: "Choose a video", sub: videoName || "MP4 / webm" },
          { id: "zone", label: "Define the zone", sub: zoneName || "Unnamed" },
          { id: "run", label: "Run & review", sub: isProcessing ? "Processing" : "Results" },
        ]}
        current={isProcessing ? 2 : job?.status === "completed" ? 3 : 0}
      />

      <Card
        eyebrow="Step 1 · Source"
        title="Choose a video"
        className="video-step-panel"
        actions={
          <Button
            variant="secondary"
            icon="film"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
          >
            {videoName ? "Change video" : "Choose video"}
          </Button>
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={handleFileChange}
        />
        {firstFrameUrl ? (
          <div className="zone-draw-preview">
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
            <span className="hint">
              Click and drag over the first frame to draw the restricted zone for this video.
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="drop-zone"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
          >
            <span className="drop-zone-icon" aria-hidden="true">
              <Icon name={extracting ? "clock" : "film"} />
            </span>
            {extracting ? (
              <strong>Extracting the first frame…</strong>
            ) : extractError ? (
              <>
                <strong>Could not load the video</strong>
                <span>{extractError}</span>
              </>
            ) : (
              <>
                <strong>No video selected yet</strong>
                <span>Choose a video file and VisionGuard will extract its first frame.</span>
              </>
            )}
          </button>
        )}
      </Card>

      <Card eyebrow="Step 2 · Restricted area" title="Define the zone">
        <div className="stack">
          <FormField label="Zone name">
            <input
              type="text"
              value={zoneName}
              onChange={(event) => setZoneName(event.target.value)}
              placeholder="e.g. Lobby camera"
              disabled={running}
            />
          </FormField>

          <div className="coords-box">
            <span className="coords-label">Video coordinates</span>
            {previewCoords ? (
              <code className="coords-value">
                x1: {previewCoords.x1}, y1: {previewCoords.y1}, x2: {previewCoords.x2}, y2:{" "}
                {previewCoords.y2}
              </code>
            ) : (
              <span className="muted">Draw a rectangle to preview coordinates.</span>
            )}
          </div>

          <div className="actions">
            <Button
              variant="primary"
              icon="play"
              onClick={handleRun}
              disabled={running}
            >
              {running ? "Starting…" : "Run Video Detection"}
            </Button>
            <Button
              variant="secondary"
              icon="close"
              onClick={handleClear}
              disabled={running}
            >
              Clear Zone
            </Button>
            <Button
              variant="secondary"
              icon={muted ? "volumeOff" : "volume"}
              onClick={handleMuteToggle}
              aria-pressed={muted}
            >
              {muted ? "Unmute alerts" : "Mute alerts"}
            </Button>
          </div>

          {isProcessing && (
            <ProgressBar
              label={job ? statusText[job.status] : "Preparing…"}
              detail={job?.status === "processing" ? `${job.progress}%` : undefined}
              value={job?.progress ?? 0}
            />
          )}

          {status && !isProcessing && (
            <p className={`status status-${status.type}`} role="status">
              {status.message}
            </p>
          )}

          {job?.status === "completed" && job.annotated_video_path && (
            <div>
              <div className="result-summary">
                <BadgeInfo>{job.processed_frames} frame(s) analyzed</BadgeInfo>
                <BadgeInfo tone={job.intrusion_count > 0 ? "danger" : "success"}>
                  {job.intrusion_count} intrusion frame(s)
                </BadgeInfo>
                <BadgeInfo tone={job.event_count > 0 ? "danger" : "success"}>
                  {job.event_count} event(s)
                </BadgeInfo>
              </div>

              <div className="zone-used-box">
                <span className="coords-label">Zone used for this job</span>
                {job.zone ? (
                  <code className="coords-value">
                    {job.zone.name} · x1: {job.zone.x1}, y1: {job.zone.y1}, x2: {job.zone.x2}, y2:{" "}
                    {job.zone.y2}
                  </code>
                ) : (
                  <span className="muted">No zone was applied to this job.</span>
                )}
              </div>

              {activeIntrusionEvent && (
                <SecurityAlertBanner
                  label="Security Alert"
                  title={`A person entered the restricted area "${intrusionZoneName}".`}
                  meta={[
                    `Video time: ${intrusionVideoTime}`,
                    `Track ID: ${displayedIntrusionEvent?.track_id == null ? "Unavailable" : `#${displayedIntrusionEvent.track_id}`}`,
                    `Confidence: ${Number.isFinite(intrusionConfidence) ? `${(intrusionConfidence * 100).toFixed(1)}%` : "Unavailable"}`,
                  ]}
                  actions={
                    <Button
                      variant="primary"
                      size="sm"
                      icon="play"
                      onClick={() => {
                        annotatedVideoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                        annotatedVideoRef.current?.focus();
                      }}
                    >
                      View Detection
                    </Button>
                  }
                />
              )}

              <div className="video-stage">
                <div
                  className={`annotated-frame${intrusionPulseActive ? " intrusion-active" : ""}`}
                >
                  <video
                    ref={annotatedVideoRef}
                    className="video-results-media"
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
              </div>

              {job.events.length > 0 && (
                <div>
                  <div className="section-label">
                    <Icon name="clock" />
                    Intrusion timeline
                  </div>
                  <div className="event-timeline">
                    {job.events.map((event, index) => (
                      <div className="event-item" key={index}>
                        <span className="event-item-dot" aria-hidden="true" />
                        <div className="event-item-copy">
                          <strong>Intrusion · Track {event.track_id ?? "—"}</strong>
                          <small>Frame {event.frame}</small>
                        </div>
                        <span className="event-item-meta">
                          {formatTimestamp(event.frame, job)} · {(event.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function BadgeInfo({ tone = "neutral", children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function formatTimestamp(frame, job) {
  if (!job?.fps) return null;
  const seconds = (frame / job.fps).toFixed(1);
  return `${seconds}s`;
}

function getEventVideoTimeSeconds(event, job) {
  const persistedTime = event?.video_time_seconds == null
    ? Number.NaN
    : Number(event.video_time_seconds);
  if (Number.isFinite(persistedTime) && persistedTime >= 0) return persistedTime;

  const frame = Number(event?.frame);
  const fps = Number(job?.fps);
  if (!Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return null;
  return frame / fps;
}
