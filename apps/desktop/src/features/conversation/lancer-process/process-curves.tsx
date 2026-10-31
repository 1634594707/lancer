import { renderRoute, updateFlight, svgElement } from "@lancer/light-ui";
export { flightGeometry } from "@lancer/light-ui";
import { useLayoutEffect, useRef } from "react";
import { flightEase, LANDING_SECONDS, outEase, segment, type Point } from "./process-math";
import { processCurveRoutes, readCurveAnchor } from "./process-curve-routes";
import type { ProcessFixture, ProcessViewState } from "./process-types";

/** These are the actual painted SVG routes, not invisible proxy paths for tests.
 * Each invalidated frame resolves semantic DOM anchors in the SVG's current screen coordinate
 * system. The traveling head is separate from the full authored cubic endpoint. */
export function ProcessCurves({
  data,
  state,
  emissions = true,
}: {
  readonly data: ProcessFixture;
  readonly state: ProcessViewState;
  readonly emissions?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const input = useRef({ data, state, emissions });
  input.current = { data, state, emissions };
  const invalidate = useRef<() => void>(() => {});
  // React commits update geometry; only active live effects request animation frames.
  useLayoutEffect(() => invalidate.current());
  useLayoutEffect(() => {
    const svg = ref.current,
      root = svg?.parentElement;
    if (!svg || !root) return;
    const painted = new Map<string, { node: SVGElement; color?: string }>();
    let frame = 0,
      serial = 0,
      revision = 0;
    const draw = () => {
      const { data, state: sampled, emissions } = input.current;
      const elapsed =
        sampled.flightSampledAt === undefined
          ? 0
          : Math.max(0, (performance.now() - sampled.flightSampledAt) / 1000);
      const state =
        sampled.flightTimes && sampled.flightSampledAt !== undefined
          ? {
              ...sampled,
              flightTimes: Object.fromEntries(
                Object.entries(sampled.flightTimes).map(([id, time]) => [id, time + elapsed]),
              ),
            }
          : sampled;
      if (document.hidden) return;
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const cache = new Map<string, Point | null>();
      const read = (key: Parameters<typeof readCurveAnchor>[1]) => {
        if (!cache.has(key)) cache.set(key, readCurveAnchor(root, key, rect));
        return cache.get(key) ?? null;
      };
      const moving = emissions && !matchMedia("(prefers-reduced-motion: reduce)").matches;
      const routes =
        getComputedStyle(root).visibility === "hidden"
          ? []
          : processCurveRoutes(data, state, moving, read);
      const landings: { id: string; attrs: Record<string, string | number> }[] = [];
      if (moving)
        for (const event of data.events) {
          if (event.emits === false || event.kind === "tool" || event.kind === "start") continue;
          const time = state.flightTimes ? state.flightTimes[event.id] : state.time;
          if (time === undefined) continue;
          const age = time - event.time;
          if (age < 0 || age >= LANDING_SECONDS) continue;
          const to = read(`tree:${event.id}`);
          if (!to) continue;
          const progress = outEase(age / LANDING_SECONDS);
          landings.push({
            id: event.id,
            attrs: {
              cx: to.x,
              cy: to.y,
              "data-flight-landing": event.id,
              r: 5 + progress * 20,
              fill: "none",
              stroke: data.lanes.find((lane) => lane.id === event.lane)?.color ?? "#3B82F6",
              "stroke-width": 1.2,
              opacity: (1 - progress) * 0.5 * (state.focus && state.focus !== event.lane ? 0.2 : 1),
            },
          });
        }
      const viewBox = `0 0 ${rect.width} ${rect.height}`;
      if (svg.getAttribute("viewBox") !== viewBox) svg.setAttribute("viewBox", viewBox);
      const alive = new Set<string>();
      for (const route of routes) {
        const key = route.id;
        alive.add(key);
        let entry = painted.get(key);
        if (route.kind === "flight" && entry?.color === route.color) {
          updateFlight(entry.node as SVGGElement, route);
        } else {
          entry?.node.remove();
          entry = { node: renderRoute(route, serial++), color: route.color };
          painted.set(key, entry);
          svg.append(entry.node);
        }
      }
      for (const landing of landings) {
        const key = `landing:${landing.id}`;
        alive.add(key);
        let entry = painted.get(key);
        if (!entry) {
          entry = { node: svgElement("circle", {}) };
          painted.set(key, entry);
          svg.append(entry.node);
        }
        for (const [name, value] of Object.entries(landing.attrs))
          entry.node.setAttribute(name, String(value));
      }
      for (const [key, entry] of painted) {
        if (!alive.has(key)) {
          entry.node.remove();
          painted.delete(key);
        }
      }
      svg.dataset.endpoints = JSON.stringify(
        routes.map((route) => ({
          id: route.eventId,
          curveId: route.id,
          from: route.points[0],
          to: route.points[3],
          dashed: Boolean(route.dashed),
        })),
      );
      svg.dataset.time = String(state.time);
      svg.dataset.revision = String(++revision);
      if (
        moving &&
        sampled.flightSampledAt !== undefined &&
        data.events.some((event) => {
          const time = state.flightTimes?.[event.id];
          return time !== undefined && time < event.time + LANDING_SECONDS;
        })
      )
        schedule();
    };
    const schedule = () => {
      if (frame || document.hidden) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        draw();
      });
    };
    // React has committed new node positions: align routes before this paint.
    invalidate.current = draw;
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    for (const element of root.querySelectorAll(".main, .rp2, .model-catalog__families"))
      resize.observe(element);
    root.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => {
      invalidate.current = () => {};
      cancelAnimationFrame(frame);
      resize.disconnect();
      root.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);
  return (
    <svg
      ref={ref}
      className="process-flight-canvas"
      style={{ width: "100%", height: "100%", overflow: "hidden" }}
      data-testid="process-curves"
      aria-hidden="true"
    />
  );
}
