export const PLAYBACK_TIME_EPSILON_SECONDS = 0.01;

export function getPlaybackEvents(job) {
  const fps = Number(job?.fps);
  if (!Number.isFinite(fps) || fps <= 0 || !Array.isArray(job?.events)) return [];
  return job.events
    .map((event, index) => {
      if (event?.frame == null) return null;
      const frame = Number(event.frame);
      if (!Number.isFinite(frame) || frame < 0) return null;
      return {
        event,
        key: [job.id ?? "job", index, event.frame, event.track_id ?? "untracked"].join(":"),
        timeSeconds: frame / fps,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.timeSeconds - second.timeSeconds);
}

export function getCrossedPlaybackEvents(playbackEvents, previousTime, currentTime, triggeredEventKeys) {
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime) || currentTime <= previousTime) {
    return [];
  }
  return playbackEvents.filter(
    ({ key, timeSeconds }) =>
      !triggeredEventKeys.has(key) &&
      timeSeconds > previousTime &&
      timeSeconds <= currentTime,
  );
}

export function rearmPlaybackEventsAfterBackwardSeek(playbackEvents, triggeredEventKeys, targetTime) {
  const rearmFrom = targetTime - PLAYBACK_TIME_EPSILON_SECONDS;
  playbackEvents.forEach(({ key, timeSeconds }) => {
    if (timeSeconds >= rearmFrom) triggeredEventKeys.delete(key);
  });
}
