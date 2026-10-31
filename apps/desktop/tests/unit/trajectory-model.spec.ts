import { expect, test } from "@playwright/test";
import {
  buildTrajectoryFromSessionTree,
  TRAJECTORY_HIDDEN_KINDS,
} from "../../src/features/conversation/session-trajectory/trajectory-model";
import type { SessionTreeNodeSnapshot } from "@lancer/session-driver/types";

const lane = {
  id: "lane:test",
  label: "Test",
  color: "#3B82F6",
  sessionId: "s1",
  workspaceId: "w1",
  isCurrent: true,
};

test("nested sibling branches keep every leaf and connect through hidden metadata to visible parents", () => {
  const n = (
    id: string,
    parentId: string | null,
    children: SessionTreeNodeSnapshot[] = [],
    kind: SessionTreeNodeSnapshot["kind"] = "message",
  ): SessionTreeNodeSnapshot => ({
    id,
    parentId,
    kind,
    role: "user",
    title: id,
    preview: id,
    timestamp: "",
    children,
  });
  const roots = [
    n("root", null, [
      n("main", "root"),
      n(
        "hidden",
        "root",
        [n("branch", "hidden", [n("branch-a", "branch"), n("branch-b", "branch")])],
        "model_change",
      ),
      n("sibling", "root"),
    ]),
  ];
  const { nodes } = buildTrajectoryFromSessionTree({ roots, leafId: "main" }, lane);
  expect(nodes.map((n) => n.id).sort()).toEqual(
    ["root", "main", "branch", "branch-a", "branch-b", "sibling"].sort(),
  );
  expect(nodes.find((n) => n.id === "branch")).toMatchObject({
    parentId: "root",
    eventType: "fork",
  });
  expect(nodes.find((n) => n.id === "branch-a")?.parentId).toBe("branch");
  expect(nodes.find((n) => n.id === "branch-b")?.parentId).toBe("branch");
  expect(nodes.find((n) => n.id === "sibling")?.parentId).toBe("root");
  expect(nodes.find((n) => n.id === "branch-a")?.depth).not.toBe(
    nodes.find((n) => n.id === "branch-b")?.depth,
  );
});

test("buildTrajectoryFromSessionTree hides session metadata and surfaces model as chip", () => {
  const roots: SessionTreeNodeSnapshot[] = [
    {
      id: "model",
      parentId: null,
      kind: "model_change",
      timestamp: "2026-01-01T00:00:00.000Z",
      title: "Model",
      preview: "openai:gpt-5",
      children: [
        {
          id: "user-1",
          parentId: "model",
          kind: "message",
          role: "user",
          timestamp: "2026-01-01T00:00:02.000Z",
          title: "User",
          preview: "Hello trajectory",
          children: [],
        },
      ],
    },
    {
      id: "info",
      parentId: null,
      kind: "session_info",
      timestamp: "2026-01-01T00:00:01.000Z",
      title: "Title",
      preview: "Hidden",
      children: [],
    },
    {
      id: "compact",
      parentId: null,
      kind: "compaction",
      timestamp: "2026-01-01T00:00:03.000Z",
      title: "Compaction",
      preview: "48k token summary",
      children: [],
    },
  ];

  const { nodes, metaChips } = buildTrajectoryFromSessionTree({ roots, leafId: "user-1" }, lane);
  const kinds = new Set(nodes.map((node) => node.kind));
  expect(kinds.has("session_info")).toBe(false);
  expect(kinds.has("model_change")).toBe(false);
  expect(TRAJECTORY_HIDDEN_KINDS.has("session_info")).toBe(true);
  expect(metaChips.some((chip) => chip.label.includes("gpt-5"))).toBe(true);
  expect(nodes.find((node) => node.id === "user-1")?.title).toContain("Hello");
  expect(nodes.find((node) => node.id === "user-1")?.depth).toBe(0);
});

test("tree-only sibling lanes retain tool-result events without assistant prose previews", () => {
  const roots: SessionTreeNodeSnapshot[] = [
    {
      id: "call",
      parentId: null,
      kind: "message",
      role: "assistant",
      timestamp: "",
      title: "Assistant",
      children: [
        {
          id: "result",
          parentId: "call",
          kind: "message",
          role: "toolResult",
          toolCallId: "write-artifact",
          preview: "Write digest.md",
          timestamp: "",
          title: "Tool",
          children: [],
        },
      ],
    },
  ];
  const { nodes } = buildTrajectoryFromSessionTree({ roots, leafId: "result" }, lane);
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({
    kind: "tool_group",
    title: "Write digest.md",
    scrollTargetId: "write-artifact",
  });
});
