import { expect, test } from "@playwright/test";
import { buildHandoffEdges } from "../../src/features/conversation/session-trajectory/build-handoff-edges";
import {
  buildTrajectoryFromSessionTree,
  type TrajectoryLane,
  type TrajectoryNode,
} from "../../src/features/conversation/session-trajectory/trajectory-model";
import type { OrchestrationChildThread } from "../../contracts/desktop-state";

const parent: TrajectoryLane = {
  id: "parent",
  sessionId: "s1",
  workspaceId: "w1",
  label: "Lancer",
  color: "#10b981",
  isCurrent: true,
};
const research: TrajectoryLane = {
  id: "research",
  sessionId: "s2",
  workspaceId: "w1",
  label: "lancer-zone:research|Grok Bot · digest.md",
  color: "#8b5cf6",
  isCurrent: false,
};
function node(id: string, lane: TrajectoryLane, target?: string): TrajectoryNode {
  return {
    id,
    laneId: lane.id,
    parentId: null,
    kind: target ? "handoff" : "message",
    title: id,
    timestamp: "",
    depth: 0,
    isActivePath: true,
    state: "neutral",
    handoffTargetLabel: target,
  };
}

test("unrelated sibling sessions never generate invented handoff curves", () => {
  const nodes = new Map([
    [parent.id, [node("last", parent)]],
    [research.id, [node("receipt", research)]],
  ]);
  expect(buildHandoffEdges([parent, research], [], nodes)).toEqual([]);
});

test("a named transcript handoff connects its event to the target lane's receipt, not the source tail", () => {
  const nodes = new Map([
    [parent.id, [node("handoff-event", parent, "Grok Bot"), node("later", parent)]],
    [research.id, [node("receipt", research), node("result", research)]],
  ]);
  const edges = buildHandoffEdges([parent, research], [], nodes);
  expect(edges).toHaveLength(1);
  expect(edges[0]).toMatchObject({
    fromLaneId: parent.id,
    fromNodeId: "handoff-event",
    toLaneId: research.id,
    toNodeId: "receipt",
  });
  expect(
    buildHandoffEdges([parent, research], [], new Map([[parent.id, nodes.get(parent.id)!]])),
  ).toEqual([]);
  const ambiguous = { ...research, id: "other", sessionId: "s3" };
  expect(buildHandoffEdges([parent, research, ambiguous], [], nodes)).toEqual([]);
});

test("orchestration edges use the actual parent even when another lane is selected", () => {
  const child: OrchestrationChildThread = {
    id: "child",
    parentWorkspaceId: "w1",
    parentSessionId: "s1",
    childWorkspaceId: "w1",
    childSessionId: "s2",
    title: "Research",
    goal: "Verify sources",
    status: "completed",
    latestTranscript: "",
    transcript: [],
    evidence: [],
    createdAt: "",
    updatedAt: "",
  };
  const nodes = new Map([
    [parent.id, [node("dispatch", parent)]],
    [research.id, [node("receipt", research)]],
  ]);
  const edges = buildHandoffEdges(
    [
      { ...parent, isCurrent: false },
      { ...research, isCurrent: true },
    ],
    [child],
    nodes,
  );
  expect(edges[0]).toMatchObject({ fromLaneId: parent.id, toLaneId: research.id });
});

test("a handoff display block is emitted once as an addressable trajectory node", () => {
  const rows = [
    {
      kind: "message" as const,
      id: "handoff-message",
      role: "assistant" as const,
      text: "Handoff · GPT-5 → Grok Bot\nnotes.md",
      createdAt: "",
    },
  ];
  const { nodes } = buildTrajectoryFromSessionTree({ roots: [], leafId: null }, parent, rows);
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({
    kind: "handoff",
    handoffTargetLabel: "Grok Bot",
    scrollTargetId: "handoff:handoff-message",
  });
});
