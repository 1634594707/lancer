import { flightControls, FLIGHT_SECONDS, type Point, type CurveRoute } from "@lancer/light-ui";
export { cubicPoint, cubicPath, flightControls } from "@lancer/light-ui";
export type { Cubic } from "@lancer/light-ui";
import type { ProcessEvent, ProcessFixture, ProcessViewState } from "./process-types";

export type CurveKey = `chat:${string}` | `tree:${string}` | `chip:${string}` | `family:${string}`;
export interface ProcessCurveRoute extends CurveRoute {
  readonly source: CurveKey;
  readonly target: CurveKey;
}
export type ReadCurveAnchor = (key: CurveKey) => Point | null;
/** Persistent graph edges belong to the tree's scrollable coordinate system.
 * A parent outside the viewport must not disconnect its visible descendants. */
export function processTreeRoutes(
  data: ProcessFixture,
  state: ProcessViewState,
  point: (event: ProcessEvent) => Point,
): readonly ProcessCurveRoute[] {
  const events = new Map(data.events.map((event) => [event.id, event]));
  const colors = new Map(data.lanes.map((lane) => [lane.id, lane.color]));
  const routes: ProcessCurveRoute[] = [];
  for (const event of data.events) {
    if (event.time > state.time) continue;
    for (const kind of ["reference", "retry"] as const) {
      const targetId = kind === "reference" ? event.reference : event.retryTarget;
      const related = targetId ? events.get(targetId) : undefined;
      // A filtered or missing parent is not permission to invent an origin.
      if (!related || related.time > state.time) continue;
      const source = kind === "reference" ? related : event;
      const target = kind === "reference" ? event : related;
      const a = point(source),
        b = point(target);
      const dimmed = Boolean(
        state.focus && state.focus !== source.lane && state.focus !== target.lane,
      );
      routes.push({
        id: `${kind}:${event.id}`,
        eventId: event.id,
        source: `tree:${source.id}`,
        target: `tree:${target.id}`,
        kind,
        points:
          kind === "reference"
            ? [a, { x: a.x, y: a.y + 40 }, { x: b.x + 60, y: b.y - 30 }, b]
            : [a, { x: a.x + 30, y: a.y }, { x: b.x + 30, y: b.y }, b],
        color: kind === "retry" ? "#EF4444" : (colors.get(source.lane) ?? "#3B82F6"),
        opacity: kind === "reference" ? (dimmed ? 0.22 : 0.7) : dimmed ? 0.16 : 0.8,
        dashed: true,
      });
    }
  }
  return routes;
}
/** The same semantic graph serves native conversations and the read-only fixture.
 * Transient flights/selection need visible DOM anchors; persistent edges use processTreeRoutes.
 * No coordinate-based pairing; a clipped anchor cannot be replaced by a nearby node. */
export function processCurveRoutes(
  data: ProcessFixture,
  state: ProcessViewState,
  emissions: boolean,
  read: ReadCurveAnchor,
): readonly ProcessCurveRoute[] {
  const routes: ProcessCurveRoute[] = [];
  const selected = state.hovered || state.highlighted;
  for (const event of data.events) {
    const lane = data.lanes.findIndex((lane) => lane.id === event.lane);
    const color = data.lanes[lane]?.color ?? "#3B82F6";
    const dim = state.focus && state.focus !== event.lane ? 0.2 : 1;
    const tree: CurveKey = `tree:${event.id}`;
    const chat: CurveKey = `chat:${event.id}`;
    const chip = (actor: string): CurveKey => `chip:${event.lane}:${actor}`;
    const add = (
      id: string,
      source: CurveKey,
      target: CurveKey,
      kind: "selection" | "flight",
      progress?: number,
    ) => {
      const a = read(source),
        b = read(target);
      if (!a || !b) return;
      const controls: readonly [Point, Point] =
        kind === "flight"
          ? flightControls(a, b, state.flightSeeds?.[event.id] ?? 0.5)
          : [
              { x: a.x + 180, y: a.y - 30 - lane * 8 },
              { x: b.x - 160, y: b.y + (a.y < b.y ? -40 : 40) },
            ];
      routes.push({
        id,
        eventId: event.id,
        source,
        target,
        kind,
        points: [a, ...controls, b],
        color:
          kind === "flight"
            ? color
            : event.reference
              ? (data.lanes.find(
                  (lane) => lane.id === data.events.find((e) => e.id === event.reference)?.lane,
                )?.color ?? color)
              : color,
        opacity: kind === "selection" ? (state.hovered ? 0.75 : 0.18) : dim,
        dashed: kind === "selection" && Boolean(event.reference || event.retryTarget),
        progress,
      });
    };
    if (selected === event.id && (state.traceSelection !== false || state.hovered))
      add(`selection:${event.id}`, chat, tree, "selection");
    const flightTime = state.flightTimes ? state.flightTimes[event.id] : state.time;
    const distance = flightTime === undefined ? 0 : event.time - flightTime;
    if (
      !emissions ||
      event.emits === false ||
      event.kind === "tool" ||
      event.kind === "start" ||
      distance <= 0 ||
      distance >= FLIGHT_SECONDS
    )
      continue;
    const progress = 1 - distance / FLIGHT_SECONDS;
    if (event.modelFamily) {
      add(`flight:${event.id}:model`, `family:${event.modelFamily}`, tree, "flight", progress);
      if (read(chat)) add(`flight:${event.id}:chat`, chat, tree, "flight", progress);
    } else if (event.reference)
      add(`flight:${event.id}:reference`, `tree:${event.reference}`, tree, "flight", progress);
    else if (event.kind !== "retry") {
      // RULING-2: identical anchor precedence for live and replay.
      if (event.kind !== "merge" && read(chat))
        add(`flight:${event.id}:chat`, chat, tree, "flight", progress);
      else if (event.kind === "handoff" && event.targetActor) {
        if (progress < 0.45)
          add(
            `flight:${event.id}:transfer`,
            chip(event.actor),
            chip(event.targetActor),
            "flight",
            progress / 0.45,
          );
        else
          add(
            `flight:${event.id}:arrival`,
            chip(event.targetActor),
            tree,
            "flight",
            (progress - 0.45) / 0.55,
          );
      } else
        for (const actor of event.kind === "merge"
          ? [event.actor, event.targetActor ?? event.actor]
          : [event.actor])
          add(`flight:${event.id}:${actor}`, chip(actor), tree, "flight", progress);
    }
  }
  return routes;
}

/** Viewport-local CSS coordinates, including transformed/scaled glyphs. The source
 * must be fully visible, exactly as prototype chatSrc; tree centers must be on-screen. */
export function readCurveAnchor(root: Element, key: CurveKey, origin: DOMRect): Point | null {
  // The live shell hides the authored relay strip. Its visible lane-head model
  // carries the same semantic key; never let a hidden duplicate mask that chip.
  const element = Array.from(
    root.querySelectorAll<HTMLElement>(`[data-anchor-key="${CSS.escape(key)}"]`),
  ).find(
    (candidate) =>
      candidate.getClientRects().length && getComputedStyle(candidate).visibility === "visible",
  );
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2,
    y = rect.top + rect.height / 2;
  const viewport = element
    .closest(
      key.startsWith("tree:")
        ? "[data-testid='process-tree']"
        : key.startsWith("chat:")
          ? "[data-testid='timeline-pane']"
          : key.startsWith("family:")
            ? ".model-catalog__families"
            : ".strip4, .lh",
    )
    ?.getBoundingClientRect();
  if (viewport) {
    if (
      key.startsWith("chat:")
        ? rect.top < viewport.top ||
          rect.bottom > viewport.bottom ||
          rect.left < viewport.left ||
          rect.right > viewport.right
        : x < viewport.left || x > viewport.right || y < viewport.top || y > viewport.bottom
    )
      return null;
  }
  const scroll = element.closest(".process-tree-scroll")?.getBoundingClientRect();
  if (scroll && (x < scroll.left || x > scroll.right || y < scroll.top || y > scroll.bottom))
    return null;
  if (x < origin.left || x > origin.right || y < origin.top || y > origin.bottom) return null;
  return { x: x - origin.left, y: y - origin.top };
}
