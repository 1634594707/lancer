import type { OrchestrationChildThread } from "../../../../contracts/desktop-state";
import type { ProcessEvent } from "./process-types";

export function conversationColor(id: string): string {
  let hash = 2166136261;
  for (const c of id) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `hsl(${(hash >>> 0) % 360} 68% 47%)`;
}

/** Forks and joins come from saved orchestration records, never from animation
 * state. Reloading the app reconstructs exactly the same event identities. */
export function parallelTreeEvents(
  input: readonly ProcessEvent[],
  children: readonly OrchestrationChildThread[],
  laneIds: ReadonlySet<string>,
): ProcessEvent[] {
  let events = [...input];
  const stamp = (e: ProcessEvent) =>
    Date.parse(e.evidenceTimestamp ?? e.nativeNode?.timestamp ?? "") || 0;
  const branches = children.filter(
    (child) =>
      laneIds.has(`lane:${child.parentSessionId}`) && laneIds.has(`lane:${child.childSessionId}`),
  );
  for (const child of branches) {
    const lane = `lane:${child.parentSessionId}`,
      childLane = `lane:${child.childSessionId}`;
    const forkId = `branch:${child.id}:fork`;
    events.push({
      id: forkId,
      index: events.length,
      time: 0,
      lane,
      kind: "fork",
      actor: "selected-model",
      label: child.title,
      summary: child.goal,
      evidenceTimestamp: child.createdAt,
    });
    const first = events.find((event) => event.lane === childLane);
    if (first)
      events = events.map((event) =>
        event.id === first.id ? { ...event, reference: forkId } : event,
      );
    else
      events.push({
        id: `branch:${child.id}:start`,
        index: events.length,
        time: 0,
        lane: childLane,
        kind: "checkpoint",
        actor: "selected-model",
        label: child.title,
        summary: child.goal,
        reference: forkId,
        evidenceTimestamp: child.createdAt,
        running: child.status === "running",
      });
  }
  // Build all forks before joins, then process receipts in time order so a
  // parent's return can reference a grandchild's already merged result.
  const receipts = branches
    .flatMap((child) =>
      child.evidence
        .filter((e) => e.toolName === "lancer-branch-return" && e.status === "accepted")
        .map((receipt) => ({ child, receipt })),
    )
    .sort((a, b) => Date.parse(a.receipt.createdAt) - Date.parse(b.receipt.createdAt));
  for (const { child, receipt } of receipts) {
    const childEvents = events
      .filter((event) => event.lane === `lane:${child.childSessionId}`)
      .sort((a, b) => stamp(a) - stamp(b) || a.index - b.index);
    const last =
      childEvents.filter((event) => stamp(event) <= Date.parse(receipt.createdAt)).at(-1) ??
      childEvents[0]!;
    events.push({
      id: receipt.id,
      index: events.length,
      time: 0,
      lane: `lane:${child.parentSessionId}`,
      kind: "merge",
      actor: "selected-model",
      label: receipt.title,
      summary: last.summary,
      reference: last.id,
      evidenceTimestamp: receipt.createdAt,
    });
  }
  events.sort((a, b) => stamp(a) - stamp(b) || a.index - b.index);
  const counts = new Map<string, number>();
  events = events.map((event) => {
    const row = counts.get(event.lane) ?? 0;
    counts.set(event.lane, row + 1);
    return { ...event, row };
  });
  // Longest-path layout respects both each lane's order and every cross-lane
  // dependency. A nested merge cannot leave its ancestor join above the result.
  const nodes = new Map(events.map((event) => [event.id, event]));
  const next = new Map<string, Set<string>>();
  const incoming = new Map(events.map((event) => [event.id, 0]));
  const previous = new Map<string, string>();
  for (const event of events) {
    for (const source of new Set([previous.get(event.lane), event.reference])) {
      if (!source || source === event.id || !nodes.has(source)) continue;
      const targets = next.get(source) ?? new Set<string>();
      if (!targets.has(event.id)) {
        targets.add(event.id);
        incoming.set(event.id, incoming.get(event.id)! + 1);
      }
      next.set(source, targets);
    }
    previous.set(event.lane, event.id);
  }
  const queue = events.filter((event) => incoming.get(event.id) === 0).map((event) => event.id);
  const rows = new Map(events.map((event) => [event.id, 0]));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    for (const target of next.get(id) ?? []) {
      rows.set(target, Math.max(rows.get(target)!, rows.get(id)! + 1));
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  events = events.map((event) => ({
    ...event,
    row: incoming.get(event.id) === 0 ? rows.get(event.id)! : event.row,
  }));
  const end = Math.max(1, ...events.map((e) => e.row ?? 0));
  return events
    .map((event) => ({ ...event, time: 0.5 + ((event.row ?? 0) / end) * 25 }))
    .sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || a.index - b.index);
}
