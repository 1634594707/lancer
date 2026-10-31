import { sessionKey } from "@lancer/session-driver";
import type { SessionRef, SessionUsageSnapshot } from "@lancer/session-driver";
import type { OrchestrationChildThread } from "../../contracts/desktop-state";

type Child = Pick<
  OrchestrationChildThread,
  "parentWorkspaceId" | "parentSessionId" | "childWorkspaceId" | "childSessionId" | "status"
>;
export interface TaskLimits {
  readonly concurrent: number;
  readonly depth: number;
  readonly children: number;
  readonly tokens: number;
}
export function taskLimits(env: NodeJS.ProcessEnv = process.env): TaskLimits {
  const limit = (name: string, fallback: number, max: number) => {
    const value = env[name];
    if (value === undefined || value === "") return fallback;
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > max)
      throw new Error(`${name} 必须是 1–${max} 之间的整数。`);
    return n;
  };
  return {
    concurrent: limit("LANCER_MAX_CONCURRENT_BRANCHES", 8, 64),
    depth: limit("LANCER_MAX_BRANCH_DEPTH", 4, 16),
    children: limit("LANCER_MAX_TREE_BRANCHES", 32, 256),
    tokens: limit("LANCER_MAX_TREE_TOKENS", 500_000, 100_000_000),
  };
}
const refOf = (child: Child): SessionRef => ({
  workspaceId: child.childWorkspaceId,
  sessionId: child.childSessionId,
});

/** Session identity, not workspace identity: independent conversations have separate budgets. */
export function taskAncestry(children: readonly Child[], ref: SessionRef) {
  const parents = new Map(children.map((child) => [sessionKey(refOf(child)), child]));
  const seen = new Set<string>();
  let root = ref;
  let depth = 0;
  while (true) {
    const key = sessionKey(root);
    if (seen.has(key)) throw new Error("任务树存在循环，已停止派生任务。请检查分支关系。");
    seen.add(key);
    const parent = parents.get(key);
    if (!parent) return { root, depth };
    root = { workspaceId: parent.parentWorkspaceId, sessionId: parent.parentSessionId };
    depth++;
  }
}

export function assertTaskTokenBudget(
  children: readonly Child[],
  ref: SessionRef,
  usage: (ref: SessionRef) => SessionUsageSnapshot | undefined,
  limits = taskLimits(),
): void {
  const key = sessionKey(taskAncestry(children, ref).root);
  const refs = new Map<string, SessionRef>([[key, taskAncestry(children, ref).root]]);
  for (const child of children) {
    const childRef = refOf(child);
    if (sessionKey(taskAncestry(children, childRef).root) === key)
      refs.set(sessionKey(childRef), childRef);
  }
  // Counts reported by the provider, including cache. Unknown usage is never invented.
  let tokens = 0;
  for (const target of refs.values()) {
    const totals = usage(target)?.totals;
    if (totals) tokens += totals.input + totals.output + totals.cacheRead + totals.cacheWrite;
  }
  if (tokens >= limits.tokens)
    throw new Error(
      `当前任务树已达到 ${limits.tokens.toLocaleString("en-US")} Token 预算，已停止发起新请求。请整理交付物后新建会话，或调整 LANCER_MAX_TREE_TOKENS。`,
    );
}

/** Reserve before the first await so simultaneous spawn calls cannot overbook. */
export class TaskAdmission {
  private readonly pending = new Map<symbol, SessionRef>();
  reserve(children: readonly Child[], parent: SessionRef, limits = taskLimits()): () => void {
    const ancestry = taskAncestry(children, parent);
    if (ancestry.depth >= limits.depth)
      throw new Error(`已达到 ${limits.depth} 层分支上限，请在现有分支完成并汇总。`);
    const rootKey = sessionKey(ancestry.root);
    const sameTree = (ref: SessionRef) => sessionKey(taskAncestry(children, ref).root) === rootKey;
    const total = children.filter((child) => sameTree(refOf(child))).length;
    const reserved = [...this.pending.values()].filter(sameTree).length;
    if (total + reserved >= limits.children)
      throw new Error(`当前任务树已达到 ${limits.children} 个分支上限，请先汇总已有结果。`);
    const active = children.filter((child) =>
      ["queued", "running", "waiting"].includes(child.status),
    ).length;
    if (active + this.pending.size >= limits.concurrent)
      throw new Error(`已有 ${limits.concurrent} 个并行分支，请等待现有任务完成后再创建。`);
    const token = Symbol();
    this.pending.set(token, parent);
    return () => this.pending.delete(token);
  }
}
