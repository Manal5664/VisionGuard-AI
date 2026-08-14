function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizeRect(rect) {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

export function displayToImage(rect, displayedWidth, displayedHeight, naturalWidth, naturalHeight) {
  if (
    !rect ||
    displayedWidth <= 0 ||
    displayedHeight <= 0 ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const scaleX = naturalWidth / displayedWidth;
  const scaleY = naturalHeight / displayedHeight;

  const normalized = normalizeRect(rect);

  return {
    x1: Math.round(clamp(normalized.x1 * scaleX, 0, naturalWidth)),
    y1: Math.round(clamp(normalized.y1 * scaleY, 0, naturalHeight)),
    x2: Math.round(clamp(normalized.x2 * scaleX, 0, naturalWidth)),
    y2: Math.round(clamp(normalized.y2 * scaleY, 0, naturalHeight)),
  };
}
