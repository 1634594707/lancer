import type { ProcessEvent } from "../../src/features/conversation/lancer-process/process-types";

export interface CurveAuditInput {
  readonly events: readonly ProcessEvent[];
  readonly time: number;
  readonly emissions: boolean;
  readonly selectionId?: string | null;
  readonly traceSelection?: boolean;
  /** Synchronous negative controls, never used by normal sampling. */
  readonly fault?: "offset" | "pair" | "missing";
}
export interface CurveHit {
  readonly id: string;
  readonly eventId: string;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly sourceError: number;
  readonly targetError: number;
  readonly correctPair: boolean;
  readonly sourcePoint: { x: number; y: number };
  readonly targetPoint: { x: number; y: number };
  readonly sourceAnchor: { x: number; y: number };
  readonly targetAnchor: { x: number; y: number };
  readonly landingError: number | null;
  readonly paintedPaths: number;
}
export interface CurveAuditFrame {
  readonly time: number;
  readonly expected: number;
  readonly hits: readonly CurveHit[];
  readonly failures: readonly string[];
}

/** Runs in the renderer, but imports NO route planner or renderer endpoint telemetry.
 * The oracle restates prototype chatSrc / xref / retry / handoff / merge semantics.
 * It checks the actual painted path geometry via getPointAtLength and screen CTM. */
export function auditProcessCurves(input: CurveAuditInput): CurveAuditFrame {
  const root = document.querySelector<HTMLElement>("[data-testid='lancer-process-surface']");
  const expected = new Map<string, { eventId: string; source: string; target: string }>();
  const failures: string[] = [],
    hits: CurveHit[] = [];
  const anchor = (key: string, treeEdge = false) => {
    const matches = root?.querySelectorAll<HTMLElement>(`[data-anchor-key="${CSS.escape(key)}"]`);
    if (!matches?.length) return null;
    if (matches.length !== 1) failures.push(`duplicate anchor ${key}`);
    const element = matches[0]!;
    if (!element.getClientRects().length || getComputedStyle(element).visibility !== "visible")
      return null;
    const r = element.getBoundingClientRect();
    const point = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const pane = element
      .closest(
        key.startsWith("tree:")
          ? "[data-testid='process-tree']"
          : key.startsWith("chat:")
            ? "[data-testid='timeline-pane']"
            : ".strip4",
      )
      ?.getBoundingClientRect();
    const bounds = root!.getBoundingClientRect();
    if (
      !treeEdge &&
      (point.x < bounds.left ||
        point.x > bounds.right ||
        point.y < bounds.top ||
        point.y > bounds.bottom)
    )
      return null;
    if (
      !treeEdge &&
      pane &&
      (key.startsWith("chat:")
        ? r.top < pane.top || r.bottom > pane.bottom || r.left < pane.left || r.right > pane.right
        : point.x < pane.left ||
          point.x > pane.right ||
          point.y < pane.top ||
          point.y > pane.bottom)
    )
      return null;
    if (
      key.startsWith("chat:") &&
      element.closest<HTMLElement>("[data-ev]")?.dataset.ev !== key.slice(5)
    )
      failures.push(`chat identity mismatch ${key}`);
    if (key.startsWith("tree:")) {
      const id = key.slice(5);
      if ((element.dataset.eventId ?? element.dataset.ghostFor) !== id)
        failures.push(`tree identity mismatch ${key}`);
      const event = input.events.find((event) => event.id === id);
      // Ghost labels are hover/focus-only; identity stays on aria-label.
      const text = element.getAttribute("aria-label");
      if (!event || !text?.includes(event.label))
        failures.push(`tree label disagrees with event ${key}`);
      if (element.dataset.ghostFor) {
        const next = input.events.find(
          (e) => e.lane === event?.lane && e.time > input.time && e.kind !== "tool",
        );
        if (next?.id !== id) failures.push(`wrong future ghost ${key}`);
      }
    }
    if (key.startsWith("chat:")) {
      const event = input.events.find((event) => event.id === key.slice(5));
      if (
        !event ||
        !element.closest("[data-ev]")?.querySelector(".ti")?.textContent?.includes(event.label)
      )
        failures.push(`chat label disagrees with event ${key}`);
    }
    if (
      key.startsWith("chip:") &&
      `chip:${element.dataset.relayLane}:${element.dataset.relayActor}` !== key
    )
      failures.push(`relay identity mismatch ${key}`);
    return point;
  };
  const expectRoute = (
    id: string,
    eventId: string,
    source: string,
    target: string,
    treeEdge = false,
  ) => {
    if (anchor(source, treeEdge) && anchor(target, treeEdge))
      expected.set(id, { eventId, source, target });
  };
  if (!root) failures.push("process root missing");
  if (root && getComputedStyle(root).visibility !== "hidden")
    for (const e of input.events) {
      const tree = `tree:${e.id}`,
        chat = `chat:${e.id}`;
      const chip = (actor: string) => `chip:${e.lane}:${actor}`;
      if (input.selectionId === e.id && input.traceSelection !== false)
        expectRoute(`selection:${e.id}`, e.id, chat, tree);
      if (e.time <= input.time) {
        if (e.reference) expectRoute(`reference:${e.id}`, e.id, `tree:${e.reference}`, tree, true);
        if (e.retryTarget) expectRoute(`retry:${e.id}`, e.id, tree, `tree:${e.retryTarget}`, true);
      }
      const delta = e.time - input.time;
      if (
        !input.emissions ||
        matchMedia("(prefers-reduced-motion: reduce)").matches ||
        e.kind === "tool" ||
        e.kind === "start" ||
        delta <= 0 ||
        delta >= 1.2
      )
        continue;
      const progress = 1 - delta / 1.2;
      if (e.reference) expectRoute(`flight:${e.id}:reference`, e.id, `tree:${e.reference}`, tree);
      else if (e.kind !== "retry") {
        if (e.kind !== "merge" && anchor(chat))
          expectRoute(`flight:${e.id}:chat`, e.id, chat, tree);
        else if (e.kind === "handoff" && e.targetActor) {
          if (progress < 0.45)
            expectRoute(`flight:${e.id}:transfer`, e.id, chip(e.actor), chip(e.targetActor));
          else expectRoute(`flight:${e.id}:arrival`, e.id, chip(e.targetActor), tree);
        } else
          for (const actor of e.kind === "merge" ? [e.actor, e.targetActor ?? e.actor] : [e.actor])
            expectRoute(`flight:${e.id}:${actor}`, e.id, chip(actor), tree);
      }
    }
  // Mutate the actual painted path in this same JS turn, so RAF cannot repair it
  // between fault injection and observation. No production renderer test hook.
  if (input.fault) {
    const path = root?.querySelector<SVGPathElement>("path[data-curve-route]");
    if (path && input.fault === "missing") path.remove();
    else if (path && input.fault === "offset") path.setAttribute("transform", "translate(2.5 0)");
    else if (path && input.fault === "pair") {
      const other = [
        ...(root?.querySelectorAll<HTMLElement>("[data-anchor-key^='tree:']") ?? []),
      ].find((element) => element.dataset.anchorKey !== path.dataset.targetKey);
      if (other) {
        const r = other.getBoundingClientRect(),
          inverse = path.getScreenCTM()?.inverse();
        if (inverse) {
          const p = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(
            inverse,
          );
          const values = path
            .getAttribute("d")
            ?.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
            ?.map(Number);
          if (values?.length === 8)
            for (const stroke of path.parentElement!.querySelectorAll("path"))
              stroke.setAttribute(
                "d",
                `M${values[0]} ${values[1]} C${values[2]} ${values[3]} ${values[4]} ${values[5]} ${p.x} ${p.y}`,
              );
          path.dataset.targetKey = other.dataset.anchorKey;
        }
      }
    }
  }
  const seen = new Set<string>();
  for (const path of root?.querySelectorAll<SVGPathElement>("path[data-curve-route]") ?? []) {
    const id = path.dataset.curveId ?? "",
      pair = expected.get(id);
    const sourceKey = path.dataset.sourceKey ?? "",
      targetKey = path.dataset.targetKey ?? "";
    const correctPair = Boolean(
      pair &&
      pair.eventId === path.dataset.curveEvent &&
      pair.source === sourceKey &&
      pair.target === targetKey,
    );
    if (!correctPair) failures.push(`wrong pairing ${id}: ${sourceKey} -> ${targetKey}`);
    if (seen.has(id)) failures.push(`duplicate route ${id}`);
    seen.add(id);
    const treeEdge = path.dataset.curveKind === "reference" || path.dataset.curveKind === "retry";
    if (treeEdge && !path.closest("[data-testid='process-tree']"))
      failures.push(`tree edge outside scroll container ${id}`);
    const sourceAnchor = anchor(sourceKey, treeEdge),
      targetAnchor = anchor(targetKey, treeEdge),
      matrix = path.getScreenCTM();
    if (!sourceAnchor || !targetAnchor || !matrix) {
      failures.push(`unavailable/clipped endpoint ${id}`);
      continue;
    }
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) {
      failures.push(`invalid path geometry ${id}`);
      continue;
    }
    const a = path.getPointAtLength(0).matrixTransform(matrix),
      b = path.getPointAtLength(length).matrixTransform(matrix);
    let sourceError = Math.hypot(a.x - sourceAnchor.x, a.y - sourceAnchor.y),
      targetError = Math.hypot(b.x - targetAnchor.x, b.y - targetAnchor.y);
    // Every painted stroke layer (including both flight glows) must share the
    // semantic route's endpoints; do not validate just a proxy/guide path.
    const painted = path.parentElement!.querySelectorAll<SVGPathElement>("path");
    for (const stroke of painted) {
      const ctm = stroke.getScreenCTM();
      if (!ctm) {
        failures.push(`missing stroke CTM ${id}`);
        continue;
      }
      const from = stroke.getPointAtLength(0).matrixTransform(ctm);
      const to = stroke.getPointAtLength(stroke.getTotalLength()).matrixTransform(ctm);
      sourceError = Math.max(
        sourceError,
        Math.hypot(from.x - sourceAnchor.x, from.y - sourceAnchor.y),
      );
      targetError = Math.max(targetError, Math.hypot(to.x - targetAnchor.x, to.y - targetAnchor.y));
    }
    if (!Number.isFinite(sourceError + targetError) || sourceError > 1 || targetError > 1)
      failures.push(`endpoint >1px ${id}: ${sourceError}, ${targetError}`);
    let landingError: number | null = null;
    // The final in-flight frame is just before progress 1; the next frame
    // replaces the head with the landing ring. Check its actual pixel distance.
    if (Number(path.dataset.headProgress) >= 0.9999) {
      const head = root?.querySelector<SVGCircleElement>(`[data-flight-head="${CSS.escape(id)}"]`);
      if (!head) failures.push(`landing head missing ${id}`);
      else {
        const r = head.getBoundingClientRect();
        landingError = Math.hypot(
          r.left + r.width / 2 - targetAnchor.x,
          r.top + r.height / 2 - targetAnchor.y,
        );
        if (landingError > 1) failures.push(`landing head >1px ${id}: ${landingError}`);
      }
    }
    hits.push({
      id,
      eventId: path.dataset.curveEvent ?? "",
      sourceKey,
      targetKey,
      correctPair,
      sourceError,
      targetError,
      sourcePoint: { x: a.x, y: a.y },
      targetPoint: { x: b.x, y: b.y },
      sourceAnchor,
      targetAnchor,
      landingError,
      paintedPaths: painted.length,
    });
  }
  for (const id of expected.keys())
    if (!seen.has(id)) failures.push(`missing expected route ${id}`);
  return { time: input.time, expected: expected.size, hits, failures };
}
