import { expect, test } from "@playwright/test";
import type { SessionTreeNodeSnapshot } from "@lancer/session-driver/types";
import { flattenSessionTree, restoreSessionTree } from "../../contracts/session-tree-transport";

test("deep tree transport preserves every node, branch order and active leaf without nested ancestry", () => {
  const nodes: (Omit<SessionTreeNodeSnapshot, "children"> & {
    children: SessionTreeNodeSnapshot[];
  })[] = Array.from({ length: 10_000 }, (_, i) => ({
    id: `n${i}`,
    parentId: i ? `n${i - 1}` : null,
    kind: "message",
    role: "user",
    timestamp: "2026-10-28T00:00:00.000Z",
    title: `Message ${i}`,
    children: [],
  }));
  for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.children.push(nodes[i + 1]!);
  const branch: SessionTreeNodeSnapshot = {
    ...nodes[1]!,
    id: "branch",
    label: "Saved fork",
    preview: "Branch preview",
    toolCallId: "tool-id",
    children: [],
  };
  nodes[0]!.children.unshift(branch);
  const otherRoot = { ...branch, id: "other-root", parentId: null };
  const tree = { roots: [nodes[0]!, otherRoot], leafId: "n9999" };
  const transport = flattenSessionTree(tree);
  expect(transport.nodes).toHaveLength(10_002);
  expect(transport.nodes[0]!.children).toEqual(["branch", "n1"]);
  expect(() => JSON.stringify(transport)).not.toThrow();
  expect(flattenSessionTree(restoreSessionTree(transport))).toEqual(transport);
});
