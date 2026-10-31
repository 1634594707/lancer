import type { SessionTreeNodeKind, SessionTreeNodeSnapshot } from "@lancer/session-driver/types";
import type { DisplayTimelineItem } from "../../../../contracts/timeline-types";
import { t, tPlural } from "../../../../contracts/i18n";
import { LANCER_PROTOTYPE_UI } from "../../../../contracts/lancer-ui";
import {
  LANCER_SESSION_ZONES,
  lancerZoneById,
  conversationZoneId,
} from "../../../../contracts/lancer-zones";
import { buildProcessBlocks, type ProcessBlock } from "../process-timeline/build-process-blocks";

import type { TrajectoryEvent } from "./trajectory-events";

export type TrajectoryNodeKind = SessionTreeNodeKind | "tool_group" | "handoff" | "turn_changes";

export interface TrajectoryMetaChip {
  readonly id: string;
  readonly label: string;
}

export interface TrajectoryNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: TrajectoryNodeKind;
  readonly title: string;
  readonly preview?: string;
  readonly timestamp: string;
  /** Git-graph column (0 = main lane); not session-tree depth. */
  readonly depth: number;
  readonly scrollTargetId?: string;
  readonly laneId: string;
  readonly isActivePath: boolean;
  readonly state: TrajectoryNodeState;
  readonly isFork?: boolean;
  readonly handoffTargetLabel?: string;
  readonly eventType?: TrajectoryEvent;
}

export type TrajectoryNodeState = "neutral" | "user" | "meta" | "summary" | "tool";

export interface TrajectoryLane {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly isCurrent: boolean;
}

export interface TrajectoryBuildResult {
  readonly nodes: readonly TrajectoryNode[];
  readonly metaChips: readonly TrajectoryMetaChip[];
}

const LANE_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#DB2777", "#F59E0B"];

/** Rows omitted from the git-graph list (surfaced as header chips or hidden). */
export const TRAJECTORY_HIDDEN_KINDS: ReadonlySet<SessionTreeNodeKind> = new Set([
  "label",
  "custom",
  "usage",
  "context_edit",
  "session_info",
  "thinking_level_change",
  "model_change",
]);

export function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length] ?? "#3B82F6";
}

function hasVisiblePreview(preview: string | undefined): boolean {
  return typeof preview === "string" && preview.trim().length > 0;
}

function isToolNode(node: SessionTreeNodeSnapshot): boolean {
  return (
    node.kind === "message" &&
    ((node.role === "toolResult" && hasVisiblePreview(node.preview)) ||
      (node.role === "assistant" && node.preview?.startsWith("[") === true))
  );
}

function shouldListNode(node: SessionTreeNodeSnapshot): boolean {
  if (TRAJECTORY_HIDDEN_KINDS.has(node.kind)) {
    return false;
  }
  if (node.kind === "message" && node.role === "toolResult") {
    return hasVisiblePreview(node.preview);
  }
  if (node.kind === "message" && node.role === "assistant" && !hasVisiblePreview(node.preview)) {
    return false;
  }
  return true;
}

function trajectoryState(
  node: SessionTreeNodeSnapshot,
  kind: TrajectoryNodeKind,
): TrajectoryNodeState {
  if (kind === "tool_group") return "tool";
  if (node.kind === "compaction" || node.kind === "branch_summary") {
    return "summary";
  }
  if (node.kind === "message" && node.role === "user") {
    return "user";
  }
  if (isToolNode(node)) {
    return "tool";
  }
  return "neutral";
}

function truncateTrajectoryLabel(text: string, max: number): string {
  // Labels only need a short prefix. Don't normalize megabytes of a growing
  // answer for every tree node update.
  let normalized = "";
  let space = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (/\s/.test(char)) {
      space = normalized.length > 0;
      continue;
    }
    normalized += (space ? " " : "") + char;
    space = false;
    if (normalized.length > max) return `${normalized.slice(0, max - 1)}…`;
  }
  return normalized;
}

function formatToolPreviewLine(preview: string): string {
  const trimmed = preview.trim();
  if (!trimmed.startsWith("[")) return trimmed;
  const inner = trimmed.replace(/^\[/, "").replace(/\]$/, "").trim();
  const colon = inner.indexOf(":");
  if (colon === -1) return inner;
  const name = inner.slice(0, colon).trim().toLowerCase();
  const detail = inner.slice(colon + 1).trim();
  switch (name) {
    case "read":
      return detail ? `Read ${detail}` : "Read file";
    case "edit":
      return detail ? `Edit ${detail}` : "Edit file";
    case "write":
      return detail ? `Write ${detail}` : "Write file";
    case "bash":
      return detail ? `bash ${detail}` : "bash";
    default:
      return detail ? `${name} ${detail}` : name;
  }
}

function stageTitleFromToolNodes(nodes: readonly SessionTreeNodeSnapshot[]): string {
  const labels = nodes
    .map((node) => (node.preview ? formatToolPreviewLine(node.preview) : ""))
    .filter((label) => label.length > 0);
  if (labels.length === 1) return truncateTrajectoryLabel(labels[0]!, 52);
  if (labels.length > 1) {
    return truncateTrajectoryLabel(`${labels[0]!} · +${labels.length - 1}`, 52);
  }
  return tPlural(nodes.length, "process.stage.stepOne", "process.stage.stepMany");
}

function scrollTargetForToolNodes(nodes: readonly SessionTreeNodeSnapshot[]): string | undefined {
  for (const node of nodes) {
    if (node.role === "toolResult" && node.toolCallId) return node.toolCallId;
    const toolResult = node.children.find(
      (child) => child.kind === "message" && child.role === "toolResult" && child.toolCallId,
    );
    if (toolResult?.toolCallId) {
      return toolResult.toolCallId;
    }
  }
  return nodes[0]?.id;
}

function titleForNode(node: SessionTreeNodeSnapshot): string {
  const preview = node.preview?.trim();
  if (node.kind === "message" && preview) {
    if (node.role === "user" || node.role === "assistant") {
      if (node.role === "assistant" && preview.startsWith("[")) {
        return truncateTrajectoryLabel(formatToolPreviewLine(preview), 52);
      }
      return truncateTrajectoryLabel(preview, 56);
    }
    if (node.role === "branchSummary" || node.role === "compactionSummary") {
      return truncateTrajectoryLabel(preview, 52);
    }
  }
  if (node.kind === "compaction" && preview) {
    return truncateTrajectoryLabel(`Compaction · ${preview}`, 52);
  }
  if (node.kind === "branch_summary" && preview) {
    return truncateTrajectoryLabel(`Branch · ${preview}`, 52);
  }
  return node.title;
}

function collectMetaChips(roots: readonly SessionTreeNodeSnapshot[]): TrajectoryMetaChip[] {
  const chips: TrajectoryMetaChip[] = [];
  const visit = (nodes: readonly SessionTreeNodeSnapshot[]) => {
    for (const node of nodes) {
      if (node.kind === "model_change" && node.preview) {
        chips.push({ id: node.id, label: `Model ${node.preview}` });
      }
      if (node.kind === "thinking_level_change" && node.preview) {
        chips.push({ id: node.id, label: `Thinking ${node.preview}` });
      }
      visit(node.children);
    }
  };
  visit(roots);
  return chips;
}

function collectPathToLeaf(
  nodes: readonly SessionTreeNodeSnapshot[],
  leafId: string | null,
  path: SessionTreeNodeSnapshot[],
): boolean {
  if (!leafId) return false;
  for (const node of nodes) {
    path.push(node);
    if (node.id === leafId) {
      return true;
    }
    if (collectPathToLeaf(node.children, leafId, path)) {
      return true;
    }
    path.pop();
  }
  return false;
}

function collectActivePathIds(
  nodes: readonly SessionTreeNodeSnapshot[],
  leafId: string | null,
  path: Set<string>,
): boolean {
  if (!leafId) return false;
  for (const node of nodes) {
    if (node.id === leafId) {
      path.add(node.id);
      return true;
    }
    if (collectActivePathIds(node.children, leafId, path)) {
      path.add(node.id);
      return true;
    }
  }
  return false;
}

function emitConversationNodes(
  sequence: readonly SessionTreeNodeSnapshot[],
  column: number,
  lane: TrajectoryLane,
  activePath: ReadonlySet<string>,
  isFork: boolean,
  out: TrajectoryNode[],
): void {
  let toolBuffer: SessionTreeNodeSnapshot[] = [];

  const flushTools = () => {
    if (toolBuffer.length === 0) return;
    const anchor = toolBuffer[0]!;
    const scrollTargetId = scrollTargetForToolNodes(toolBuffer);
    out.push({
      id: `tool-group:${anchor.id}`,
      parentId: anchor.parentId,
      kind: "tool_group",
      title: stageTitleFromToolNodes(toolBuffer),
      preview: toolBuffer
        .map((node) => node.preview)
        .filter(Boolean)
        .join(" "),
      timestamp: anchor.timestamp,
      depth: column,
      scrollTargetId,
      laneId: lane.id,
      isActivePath: toolBuffer.some((node) => activePath.has(node.id)),
      state: "tool",
      isFork,
    });
    toolBuffer = [];
  };

  for (const node of sequence) {
    if (!shouldListNode(node)) {
      continue;
    }
    if (isToolNode(node)) {
      toolBuffer.push(node);
      continue;
    }
    flushTools();
    const handoff = /^Handoff\s*[·•]\s*([^→]+)→\s*([^\n]+)/i.exec(node.preview ?? "");
    out.push({
      id: node.id,
      ...(handoff ? { handoffTargetLabel: handoff[2]!.trim() } : {}),
      parentId: node.parentId,
      kind: handoff ? "handoff" : node.kind,
      title: titleForNode(node),
      preview: node.preview,
      timestamp: node.timestamp,
      depth: column,
      scrollTargetId: node.id,
      laneId: lane.id,
      isActivePath: activePath.has(node.id),
      state: trajectoryState(node, node.kind),
      isFork,
    });
  }
  flushTools();
}

function leafInSubtree(node: SessionTreeNodeSnapshot): string {
  let current: SessionTreeNodeSnapshot = node;
  while (current.children.length > 0) {
    const last = current.children[current.children.length - 1];
    if (!last) break;
    current = last;
  }
  return current.id;
}

function stageEvent(block: Extract<ProcessBlock, { kind: "stage" }>): TrajectoryEvent {
  const isTest = block.steps.some(
    (step) => step.kind === "tool" && /(?:\btest\b|typecheck)/i.test(step.item.label),
  );
  if (block.status === "error") return isTest ? "test-fail" : "error";
  if (block.status === "done" && isTest) return "test";
  return "tool";
}

function pushProcessBlockNode(
  block: ProcessBlock,
  column: number,
  lane: TrajectoryLane,
  out: TrajectoryNode[],
): void {
  switch (block.kind) {
    case "user":
      out.push({
        id: block.id,
        parentId: null,
        kind: "message",
        title: truncateTrajectoryLabel(block.text, 56),
        timestamp: "",
        depth: column,
        scrollTargetId: block.id,
        laneId: lane.id,
        isActivePath: true,
        state: "user",
      });
      return;
    case "handoff":
      out.push({
        id: block.id,
        parentId: null,
        kind: "handoff",
        title: `交接 → ${block.toLabel}`,
        handoffTargetLabel: block.toLabel,
        timestamp: "",
        depth: column,
        scrollTargetId: block.id,
        laneId: lane.id,
        isActivePath: true,
        state: "neutral",
      });
      return;
    case "assistant-prose":
      out.push({
        id: block.id,
        parentId: null,
        kind: "message",
        title: truncateTrajectoryLabel(block.text, 56),
        timestamp: "",
        depth: column,
        scrollTargetId: block.id,
        laneId: lane.id,
        isActivePath: true,
        state: "neutral",
      });
      return;
    case "stage":
      out.push({
        id: block.id,
        parentId: null,
        kind: "tool_group",
        title: truncateTrajectoryLabel(block.title, 52),
        eventType: stageEvent(block),
        timestamp: "",
        depth: column,
        scrollTargetId: block.scrollTargetId,
        laneId: lane.id,
        isActivePath: true,
        state: "tool",
      });
      return;
    case "summary-card":
      out.push({
        id: block.id,
        parentId: null,
        kind: "message",
        title: truncateTrajectoryLabel(block.text, 52),
        timestamp: "",
        depth: column,
        scrollTargetId: block.id,
        laneId: lane.id,
        isActivePath: true,
        state: "summary",
        eventType: block.role === "compactionSummary" ? "compact" : "fork",
      });
      return;
    case "turn-changes":
      out.push({
        id: block.id,
        parentId: null,
        kind: "turn_changes",
        title: "文件交付",
        timestamp: "",
        depth: column,
        scrollTargetId: block.id,
        laneId: lane.id,
        isActivePath: true,
        state: "neutral",
        eventType: "artifact",
      });
      return;
    default:
      return;
  }
}

function appendForkColumns(
  roots: readonly SessionTreeNodeSnapshot[],
  leafId: string | null,
  lane: TrajectoryLane,
  activePath: ReadonlySet<string>,
  out: TrajectoryNode[],
): void {
  const mainPath: SessionTreeNodeSnapshot[] = [];
  collectPathToLeaf(roots, leafId, mainPath);
  const pending = roots.filter((node) => node.id !== mainPath[0]?.id);
  const enqueueForks = (path: readonly SessionTreeNodeSnapshot[]) => {
    path.forEach((node, i) =>
      pending.push(...node.children.filter((child) => child.id !== path[i + 1]?.id)),
    );
  };
  enqueueForks(mainPath);
  let column = 1;
  while (pending.length) {
    const branch = pending.shift()!;
    const path: SessionTreeNodeSnapshot[] = [];
    collectPathToLeaf([branch], leafInSubtree(branch), path);
    const start = out.length;
    emitConversationNodes(path, column++, lane, activePath, true, out);
    if (out[start]) out[start] = { ...out[start]!, eventType: "fork" };
    enqueueForks(path);
  }
}

function connectVisibleParents(
  roots: readonly SessionTreeNodeSnapshot[],
  nodes: readonly TrajectoryNode[],
): TrajectoryNode[] {
  const entries = new Map<string, SessionTreeNodeSnapshot>();
  const projected = new Map<string, TrajectoryNode>();
  const pending = [...roots];
  while (pending.length) {
    const node = pending.pop()!;
    entries.set(node.id, node);
    for (const child of node.children) pending.push(child);
  }
  for (const node of nodes) {
    projected.set(node.id, node);
    if (node.scrollTargetId) projected.set(node.scrollTargetId, node);
  }
  for (const entry of entries.values()) {
    const node = entry.toolCallId ? projected.get(entry.toolCallId) : undefined;
    if (node) projected.set(entry.id, node);
  }
  return nodes.map((node) => {
    let parent = entries.get(node.id)?.parentId ?? node.parentId;
    const seen = new Set<string>();
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      const visible = projected.get(parent);
      if (visible && visible.id !== node.id) return { ...node, parentId: visible.id };
      parent = entries.get(parent)?.parentId ?? null;
    }
    return { ...node, parentId: null };
  });
}

export function buildTrajectoryFromSessionTree(
  tree: { readonly roots: readonly SessionTreeNodeSnapshot[]; readonly leafId: string | null },
  lane: TrajectoryLane,
  displayRows: readonly DisplayTimelineItem[] = [],
): TrajectoryBuildResult {
  const metaChips = collectMetaChips(tree.roots);
  const activePath = new Set<string>();
  collectActivePathIds(tree.roots, tree.leafId, activePath);
  const nodes: TrajectoryNode[] = [];

  if (displayRows.length > 0) {
    for (const block of buildProcessBlocks(displayRows)) {
      pushProcessBlockNode(block, 0, lane, nodes);
    }
  } else {
    const path: SessionTreeNodeSnapshot[] = [];
    collectPathToLeaf(tree.roots, tree.leafId, path);
    const mainSequence: SessionTreeNodeSnapshot[] = [];
    for (const node of path) {
      if (shouldListNode(node) || isToolNode(node)) {
        mainSequence.push(node);
      }
    }
    emitConversationNodes(mainSequence, 0, lane, activePath, false, nodes);
  }

  appendForkColumns(tree.roots, tree.leafId, lane, activePath, nodes);
  return { nodes: connectVisibleParents(tree.roots, nodes), metaChips };
}

/**
 * Extension point: additional lanes come from orchestration child threads (parallel sessions).
 * Phase 1 renders the current session lane; pass more lanes here when multi-lane UI is enabled.
 */
export function buildDefaultLanes(input: {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly sessionTitle: string;
  readonly childSessionIds?: readonly { readonly sessionId: string; readonly title: string }[];
  readonly siblingSessionIds?: readonly {
    readonly sessionId: string;
    readonly title: string;
    readonly workspaceId?: string;
  }[];
}): readonly TrajectoryLane[] {
  const lanes: TrajectoryLane[] = [
    {
      id: `lane:${input.sessionId}`,
      label: input.sessionTitle || "Current",
      color: laneColor(0),
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      isCurrent: true,
    },
  ];
  const extras = [
    ...(input.childSessionIds ?? []),
    ...(input.siblingSessionIds ?? []).filter(
      (sibling) =>
        !(input.childSessionIds ?? []).some((child) => child.sessionId === sibling.sessionId),
    ),
  ];
  extras.forEach((child, index) => {
    lanes.push({
      id: `lane:${child.sessionId}`,
      label: child.title,
      color: laneColor(index + 1),
      sessionId: child.sessionId,
      workspaceId:
        "workspaceId" in child && typeof child.workspaceId === "string"
          ? child.workspaceId
          : input.workspaceId,
      isCurrent: false,
    });
  });
  if (LANCER_PROTOTYPE_UI) {
    const zoneIndex = (lane: TrajectoryLane) =>
      LANCER_SESSION_ZONES.findIndex((zone) => zone.id === conversationZoneId(lane.label));
    return lanes
      .map((lane) => ({ ...lane, color: lancerZoneById(conversationZoneId(lane.label)).color }))
      .sort((a, b) => zoneIndex(a) - zoneIndex(b));
  }
  return lanes;
}
