import type { SessionTreeNodeSnapshot, SessionTreeSnapshot } from "@lancer/session-driver/types";

/** Keep ancestry out of the object nesting that crosses Electron's contextBridge. */
export interface SessionTreeTransport {
  readonly roots: readonly string[];
  readonly leafId: string | null;
  readonly nodes: readonly (Omit<SessionTreeNodeSnapshot, "children"> & {
    readonly children: readonly string[];
  })[];
}

export function flattenSessionTree(tree: SessionTreeSnapshot): SessionTreeTransport {
  const nodes: SessionTreeTransport["nodes"][number][] = [];
  const pending = [...tree.roots].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    nodes.push({ ...node, children: node.children.map((child) => child.id) });
    for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]!);
  }
  return { roots: tree.roots.map((node) => node.id), leafId: tree.leafId, nodes };
}

/** Rebuild only after crossing into the renderer, preserving branch and root order. */
export function restoreSessionTree(tree: SessionTreeTransport): SessionTreeSnapshot {
  const nodes = new Map(
    tree.nodes.map((node) => [node.id, { ...node, children: [] as SessionTreeNodeSnapshot[] }]),
  );
  const getNode = (id: string) => {
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing session tree node: ${id}`);
    return node;
  };
  for (const node of tree.nodes) {
    getNode(node.id).children.push(...node.children.map(getNode));
  }
  return { roots: tree.roots.map(getNode), leafId: tree.leafId };
}
