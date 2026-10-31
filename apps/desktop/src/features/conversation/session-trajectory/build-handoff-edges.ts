import type { OrchestrationChildThread } from "../../../../contracts/desktop-state";
import { stripLancerZonePrefix } from "../../../../contracts/lancer-zones";
import type { TrajectoryHandoffEdge } from "./multi-lane-trajectory-panel";
import type { TrajectoryLane, TrajectoryNode } from "./trajectory-model";

/** Never invent handoffs merely because unrelated sessions share a workspace. */
export function buildHandoffEdges(
  lanes: readonly TrajectoryLane[],
  children: readonly OrchestrationChildThread[] | undefined,
  laneNodes: ReadonlyMap<string, readonly TrajectoryNode[]>,
): readonly TrajectoryHandoffEdge[] {
  const edges: TrajectoryHandoffEdge[] = [];
  for (const fromLane of lanes) {
    for (const node of laneNodes.get(fromLane.id) ?? []) {
      const target = node.handoffTargetLabel?.toLowerCase();
      if (!target) continue;
      const candidates = lanes.filter((lane) => {
        const label = stripLancerZonePrefix(lane.label).toLowerCase();
        return lane.id !== fromLane.id && (label === target || label.startsWith(`${target} ·`));
      });
      // Ambiguous model names are not enough evidence to connect two sessions.
      if (candidates.length !== 1) continue;
      const toLane = candidates[0]!;
      const toNode = (laneNodes.get(toLane.id) ?? []).find((entry) => !entry.isFork);
      if (!toNode) continue;
      edges.push({
        id: `handoff:${node.id}:${toLane.id}`,
        fromLaneId: fromLane.id,
        toLaneId: toLane.id,
        fromNodeId: node.id,
        toNodeId: toNode.id,
        label: node.handoffTargetLabel,
      });
    }
  }
  for (const child of children ?? []) {
    const fromLane = lanes.find((lane) => lane.sessionId === child.parentSessionId);
    const toLane = lanes.find((lane) => lane.sessionId === child.childSessionId);
    if (
      !fromLane ||
      !toLane ||
      edges.some((edge) => edge.fromLaneId === fromLane.id && edge.toLaneId === toLane.id)
    )
      continue;
    const fromNode = (laneNodes.get(fromLane.id) ?? []).filter((node) => !node.isFork).at(-1);
    const toNode = (laneNodes.get(toLane.id) ?? []).find((node) => !node.isFork);
    if (!fromNode || !toNode) continue;
    edges.push({
      id: `handoff:${child.id}`,
      fromLaneId: fromLane.id,
      toLaneId: toLane.id,
      fromNodeId: fromNode.id,
      toNodeId: toNode.id,
      label: child.title,
    });
  }
  return edges;
}
