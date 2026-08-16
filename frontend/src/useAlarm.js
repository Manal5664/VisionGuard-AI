import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_PULSE_MS = 1100;
const DEFAULT_GAP_MS = 120;

export default function useAlarm({
  pulseMs = DEFAULT_PULSE_MS,
  gapMs = DEFAULT_GAP_MS,
} = {}) {
  const [muted, setMuted] = useState(false);
  const [activeEvent, setActiveEvent] = useState(null);
  const [pulseActive, setPulseActive] = useState(false);
  const audioContextRef = useRef(null);
  const mutedRef = useRef(false);
  const queueRef = useRef([]);
  const queueRunningRef = useRef(false);
  const timerRef = useRef(null);
  const presentNextRef = useRef(null);

  const unlockAudio = useCallback(() => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContextConstructor();
      }
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume().catch(() => {});
      }
      return audioContextRef.current;
    } catch {
      audioContextRef.current = null;
      return null;
    }
  }, []);

  const playBeep = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (mutedRef.current || !audioContext || audioContext.state !== "running") return;
    try {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.2);
    } catch {
      // Alarm presentation must never interrupt detection.
    }
  }, []);

  const clearAlerts = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    queueRef.current = [];
    queueRunningRef.current = false;
    setActiveEvent(null);
    setPulseActive(false);
  }, []);

  presentNextRef.current = () => {
    const nextEvent = queueRef.current.shift();
    if (!nextEvent) {
      queueRunningRef.current = false;
      setPulseActive(false);
      return;
    }
    queueRunningRef.current = true;
    setActiveEvent(nextEvent);
    setPulseActive(true);
    playBeep();
    timerRef.current = setTimeout(() => {
      setActiveEvent(null);
      setPulseActive(false);
      timerRef.current = null;
      if (queueRef.current.length > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          presentNextRef.current?.();
        }, gapMs);
      } else {
        queueRunningRef.current = false;
      }
    }, pulseMs);
  };

  const enqueueAlerts = useCallback((events) => {
    queueRef.current.push(...events.filter(Boolean));
    if (!queueRunningRef.current && queueRef.current.length > 0) {
      presentNextRef.current?.();
    }
  }, []);

  const triggerAlarm = useCallback(
    (event) => enqueueAlerts([event]),
    [enqueueAlerts],
  );

  const toggleMuted = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) unlockAudio();
  }, [unlockAudio]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      queueRef.current = [];
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close().catch(() => {});
      }
    };
  }, []);

  return {
    muted,
    activeEvent,
    pulseActive,
    unlockAudio,
    toggleMuted,
    triggerAlarm,
    enqueueAlerts,
    clearAlerts,
  };
}
