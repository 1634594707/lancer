import { useCallback, useEffect, useRef, useState } from "react";

export interface PaneWidthBounds {
  readonly min: number;
  readonly max: number;
}

/**
 * Drag and keyboard handle on one vertical edge of a pane. The handle must be a
 * direct child of the pane; `bounds` receives the pane and the pane's parent.
 * `edge` is the pane edge the handle sits on, so dragging away from the pane widens it.
 */
export function PaneResizeHandle({
  className,
  label,
  controls,
  edge,
  bounds,
  onResize,
  onReset,
}: {
  readonly className: string;
  readonly label: string;
  readonly controls: string;
  readonly edge: "left" | "right";
  readonly bounds: (pane: HTMLElement, container: HTMLElement) => PaneWidthBounds;
  readonly onResize: (width: number) => void;
  readonly onReset?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null);
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const [size, setSize] = useState({ width: 0, min: 0, max: 0 });
  const [resizing, setResizing] = useState(false);

  const measure = useCallback(() => {
    const pane = ref.current?.parentElement;
    const container = pane?.parentElement;
    if (!pane || !container) return null;
    const { min, max } = boundsRef.current(pane, container);
    return {
      width: Math.round(pane.getBoundingClientRect().width),
      min: Math.min(min, max),
      max,
    };
  }, []);

  useEffect(() => {
    const pane = ref.current?.parentElement;
    const container = pane?.parentElement;
    if (!pane || !container) return;
    const refresh = () => {
      const next = measure();
      if (next) setSize(next);
    };
    const observer = new ResizeObserver(refresh);
    observer.observe(pane);
    observer.observe(container);
    refresh();
    return () => observer.disconnect();
  }, [measure]);

  const widen = edge === "right" ? 1 : -1;
  const resize = (width: number, limits = size) =>
    onResize(Math.max(limits.min, Math.min(limits.max, width)));
  return (
    <div
      ref={ref}
      className={className}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-controls={controls}
      aria-valuemin={size.min}
      aria-valuemax={size.max}
      aria-valuenow={size.width}
      tabIndex={0}
      data-resizing={resizing}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const current = measure();
        if (!current) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointerId: event.pointerId, x: event.clientX, width: current.width };
        setResizing(true);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start && start.pointerId === event.pointerId)
          resize(start.width + widen * (event.clientX - start.x));
      }}
      onPointerUp={(event) => {
        if (drag.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        setResizing(false);
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        // Observer notifications can trail a committed layout. A new keyboard
        // step starts from the visible pane, not the previous observation.
        const current = measure();
        if (!current) return;
        const next =
          event.key === "ArrowRight"
            ? current.width + widen * 20
            : event.key === "ArrowLeft"
              ? current.width - widen * 20
              : event.key === "Home"
                ? current.min
                : event.key === "End"
                  ? current.max
                  : undefined;
        if (next === undefined) return;
        event.preventDefault();
        resize(next, current);
      }}
    />
  );
}
