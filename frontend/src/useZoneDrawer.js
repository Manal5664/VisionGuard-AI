import { useRef, useState } from "react";

export function useZoneDrawer({ enabled = true, onReset } = {}) {
  const wrapperRef = useRef(null);
  const [rect, setRect] = useState(null);
  const [dragging, setDragging] = useState(false);

  const getDisplayPoint = (event) => {
    const bounds = wrapperRef.current.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  };

  const handlePointerDown = (event) => {
    if (!enabled) return;
    event.preventDefault();
    wrapperRef.current.setPointerCapture(event.pointerId);
    const point = getDisplayPoint(event);
    setRect({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    setDragging(true);
    onReset?.();
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const point = getDisplayPoint(event);
    setRect((previous) => ({
      ...previous,
      x2: point.x,
      y2: point.y,
    }));
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  const clear = () => {
    setRect(null);
    setDragging(false);
  };

  return {
    wrapperRef,
    rect,
    dragging,
    clear,
    getDisplayPoint,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}
