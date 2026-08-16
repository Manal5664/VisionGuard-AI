import { useEffect, useState } from "react";
import Icon from "../ui/Icon";
import StatusPill from "../ui/StatusPill";

const API_LABELS = {
  online: "API Online",
  checking: "Checking…",
  offline: "API Offline",
};

const ACTIVE_MONITOR_STATUSES = ["starting", "running", "stopping"];

const SYSTEM_STATE = {
  active: { className: "system-state-active", label: "Monitoring Active" },
  ready: { className: "system-state-ready", label: "System Ready" },
  offline: { className: "system-state-offline", label: "System Offline" },
  checking: { className: "system-state-checking", label: "Checking" },
};

const THEME_OPTIONS = [
  { value: "dark", icon: "moon", label: "Dark", title: "Dark Command Center" },
  { value: "light", icon: "sun", label: "Light", title: "Light Professional" },
  { value: "midnight", icon: "moonStars", label: "Midnight", title: "Midnight Blue" },
];

export default function TopBar({ meta, apiStatus, apiBase, theme, onThemeChange, notificationCenter, onMenu }) {
  const [anyMonitoring, setAnyMonitoring] = useState(false);

  useEffect(() => {
    if (!apiBase) return undefined;
    let cancelled = false;
    const checkMonitoring = async () => {
      try {
        const response = await fetch(`${apiBase}/api/cameras`);
        if (!response.ok) return;
        const cameras = await response.json();
        if (!cancelled) {
          setAnyMonitoring(
            Array.isArray(cameras) &&
              cameras.some((camera) =>
                ACTIVE_MONITOR_STATUSES.includes(camera.monitor?.status),
              ),
          );
        }
      } catch {
        // Keep the previous state during transient failures.
      }
    };
    checkMonitoring();
    const timer = setInterval(checkMonitoring, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [apiBase]);

  const systemState =
    apiStatus === "offline"
      ? SYSTEM_STATE.offline
      : anyMonitoring
        ? SYSTEM_STATE.active
        : apiStatus === "online"
          ? SYSTEM_STATE.ready
          : SYSTEM_STATE.checking;

  return (
    <header className="topbar">
      <button
        type="button"
        className="hamburger"
        onClick={onMenu}
        aria-label="Open navigation menu"
      >
        <Icon name="menu" />
      </button>

      <div className="topbar-title">
        <span className="topbar-title-eyebrow">Security command center</span>
        <h1>{meta.title}</h1>
        <p>{meta.description}</p>
      </div>

      <div className="topbar-actions">
        <span className={`system-state ${systemState.className}`}>
          <span className="status-pill-dot" aria-hidden="true" />
          {systemState.label}
        </span>
        <StatusPill
          status={apiStatus}
          className={apiStatus === "online" ? "status-online" : ""}
        >
          {API_LABELS[apiStatus]}
        </StatusPill>
        <div className="theme-switcher" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`theme-option${theme === option.value ? " theme-option-active" : ""}`}
              title={option.title}
              aria-pressed={theme === option.value}
              onClick={() => onThemeChange(option.value)}
            >
              <Icon name={option.icon} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        {notificationCenter}
        <span className="avatar" title="Local operator">
          <Icon name="user" />
        </span>
      </div>
    </header>
  );
}
