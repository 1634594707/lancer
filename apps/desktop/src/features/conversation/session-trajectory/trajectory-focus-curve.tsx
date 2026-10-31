import { useLayoutEffect, useRef, useState } from "react";

/** Read-only geometry overlay. Scrolling stays owned by useTimelineViewport. */
export function TrajectoryFocusCurve({
  targetId,
  sessionId,
}: {
  readonly targetId: string | null;
  readonly sessionId: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [path, setPath] = useState<string | null>(null);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const root = svg?.parentElement;
    if (!root || !targetId) {
      setPath(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const escaped = CSS.escape(targetId);
      const source = root.querySelector<HTMLElement>(
        `.conversation [data-scroll-target="${escaped}"], .conversation [data-process-id="${escaped}"]`,
      );
      const destination = root.querySelector<HTMLElement>(
        `[data-lane-id="lane:${CSS.escape(sessionId)}"][data-scroll-target="${escaped}"], [data-lane-id="lane:${CSS.escape(sessionId)}"][data-node-id="${escaped}"]`,
      );
      const from = source?.querySelector(".process-stage__head, .process-handoff__title") ?? source;
      const to = destination?.querySelector(".trajectory-event-glyph, .session-trajectory__glyph");
      const pane = root.querySelector("[data-testid='timeline-pane']");
      if (!from || !to || !pane) {
        setPath(null);
        return;
      }
      const a = from.getBoundingClientRect(),
        b = to.getBoundingClientRect();
      const clip = pane.getBoundingClientRect();
      const graphClip = destination!.closest(".session-trajectory__body")!.getBoundingClientRect();
      if (
        a.bottom < clip.top ||
        a.top > clip.bottom ||
        b.bottom < graphClip.top ||
        b.top > graphClip.bottom
      ) {
        setPath(null);
        return;
      }
      const rect = root.getBoundingClientRect();
      // Leave from the phase's trailing edge so the curve never strikes through its title.
      const x1 = a.right - rect.left,
        y1 = a.top + a.height / 2 - rect.top;
      const x2 = b.left + b.width / 2 - rect.left,
        y2 = b.top + b.height / 2 - rect.top;
      const bend = Math.max(60, (x2 - x1) * 0.55);
      setPath(`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    for (const element of root.querySelectorAll(
      ".conversation, .process-stage, .multi-lane-graph, [data-testid='timeline-pane']",
    ))
      resize.observe(element);
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "data-process-id", "data-node-id"],
    });
    root.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      resize.disconnect();
      mutation.disconnect();
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [targetId, sessionId]);
  return (
    <svg ref={svgRef} className="trajectory-focus-curve" aria-hidden="true">
      {path ? (
        <path
          key={`${sessionId}:${targetId}`}
          data-testid="trajectory-focus-curve"
          data-target-id={targetId}
          d={path}
          pathLength="1"
        />
      ) : null}
    </svg>
  );
}
