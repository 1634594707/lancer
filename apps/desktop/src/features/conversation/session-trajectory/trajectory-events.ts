import type { TrajectoryNode } from "./trajectory-model";

/** Shared by the legend and event rendering; labels follow the light demo. */
export const TRAJECTORY_EVENTS = [
  { key: "submit", label: "提交/保存", pattern: /^提交\/保存/ },
  { key: "handoff", label: "交接 · 无损", pattern: /^(?:Handoff|交接|接收交接)/i },
  { key: "checkpoint", label: "检查点", pattern: /^检查点/ },
  { key: "test", label: "测试 ✓", pattern: /^测试.*(?:通过|成功)/ },
  { key: "test-fail", label: "测试 ✕", pattern: /^测试.*失败/ },
  { key: "review", label: "审查通过", pattern: /^审查/ },
  { key: "fork", label: "分叉", pattern: /^分叉/ },
  { key: "merge", label: "合并", pattern: /^合并/ },
  { key: "artifact", label: "产物", pattern: /^(?:产物|已保存)/ },
  { key: "tool", label: "工具调用", pattern: /^工具调用/ },
  { key: "model", label: "模型切换", pattern: /^模型切换/ },
  { key: "compact", label: "上下文压缩", pattern: /^(?:上下文压缩|Compaction)/ },
  { key: "wait", label: "等待你", pattern: /^等待你/ },
  { key: "xref", label: "跨线引用", pattern: /^(?:跨线引用|引用)/ },
  { key: "error", label: "错误", pattern: /^(?:错误|渲染失败)/ },
  { key: "retry", label: "重试", pattern: /^重试/ },
] as const;

export type TrajectoryEvent = (typeof TRAJECTORY_EVENTS)[number]["key"];

export function trajectoryEvent(node: TrajectoryNode): TrajectoryEvent {
  if (node.eventType) return node.eventType;
  if (node.kind === "handoff") return "handoff";
  if (node.kind === "compaction") return "compact";
  if (node.kind === "branch_summary") return "fork";
  const explicit = TRAJECTORY_EVENTS.find((event) => event.pattern.test(node.title));
  if (explicit) return explicit.key;
  if (node.kind === "tool_group" || node.state === "tool") return "tool";
  if (node.state === "user" || node.state === "summary") return "checkpoint";
  return "submit";
}

export function trajectoryCaption(node: TrajectoryNode): string {
  return `${TRAJECTORY_EVENTS.find((event) => event.key === trajectoryEvent(node))!.label} · ${node.id.slice(-6)}`;
}
