import type {
  DisplayTimelineItem,
  TimelineActivity,
  TimelineSummary,
  TimelineToolCall,
  TranscriptMessage,
} from "../../../../contracts/timeline-types";
import { t, tPlural } from "../../../../contracts/i18n";

export type ProcessStep =
  | { readonly kind: "thinking"; readonly id: string; readonly durationMs: number }
  | { readonly kind: "tool"; readonly id: string; readonly item: TimelineToolCall }
  | { readonly kind: "activity"; readonly id: string; readonly item: TimelineActivity }
  | { readonly kind: "summary"; readonly id: string; readonly item: TimelineSummary };

export type ProcessBlock =
  | {
      readonly kind: "user";
      readonly id: string;
      readonly text: string;
      readonly attachments?: Extract<TranscriptMessage, { kind: "message" }>["attachments"];
    }
  | {
      readonly kind: "assistant-prose";
      readonly createdAt?: string;
      readonly id: string;
      readonly text: string;
      readonly sourceMessageIndex?: number;
    }
  | {
      readonly kind: "summary-card";
      readonly id: string;
      readonly role: "branchSummary" | "compactionSummary";
      readonly text: string;
      readonly steps: readonly ProcessStep[];
    }
  | {
      readonly kind: "stage";
      readonly id: string;
      readonly title: string;
      readonly steps: readonly ProcessStep[];
      readonly status: "running" | "done" | "error";
      readonly durationLabel?: string;
      readonly scrollTargetId: string;
    }
  | {
      readonly kind: "turn-changes";
      readonly id: string;
      readonly turnId: string;
    }
  | {
      readonly kind: "handoff";
      readonly id: string;
      readonly fromLabel: string;
      readonly toLabel: string;
      readonly detail?: string;
    };

/** The viewport measures the rendered stage, not each tool hidden inside it. */
export function processBlockAnchorId(block: ProcessBlock): string {
  return block.kind === "stage" ? block.scrollTargetId : block.id;
}

export function processViewportRows(
  blocks: readonly ProcessBlock[],
): readonly DisplayTimelineItem[] {
  return blocks.map((block) => ({
    kind: "activity",
    id: processBlockAnchorId(block),
    createdAt: "",
    label: "text" in block ? block.text : "title" in block ? block.title : block.kind,
    metadata: block.kind === "stage" ? `${block.status}:${block.steps.length}` : undefined,
  }));
}

function stageStatusFromSteps(steps: readonly ProcessStep[]): "running" | "done" | "error" {
  const tools = steps.filter(
    (step): step is Extract<ProcessStep, { kind: "tool" }> => step.kind === "tool",
  );
  if (tools.some((step) => step.item.status === "running")) return "running";
  if (tools.some((step) => step.item.status === "error")) return "error";
  return "done";
}

function stageTitleFromSteps(steps: readonly ProcessStep[]): string {
  const tools = steps.filter(
    (step): step is Extract<ProcessStep, { kind: "tool" }> => step.kind === "tool",
  );
  if (tools.length === 1) return tools[0]!.item.label;
  if (tools.length > 1) {
    const primary = tools[0]!.item.label;
    return `${primary} · +${tools.length - 1}`;
  }
  const thinkingOnly = steps.filter((step) => step.kind === "thinking");
  if (thinkingOnly.length === steps.length && thinkingOnly.length > 0) {
    return t("process.step.thinkingLabel");
  }
  const activity = steps.find((step) => step.kind === "activity");
  if (activity && activity.kind === "activity") return activity.item.label;
  const summary = steps.find((step) => step.kind === "summary");
  if (summary && summary.kind === "summary") return summary.item.label;
  return tPlural(steps.length, "process.stage.stepOne", "process.stage.stepMany");
}

function durationLabelFromSteps(steps: readonly ProcessStep[]): string | undefined {
  const thinking = steps.find((step) => step.kind === "thinking");
  if (!thinking || thinking.kind !== "thinking") return undefined;
  const seconds = Math.max(1, Math.round(thinking.durationMs / 1000));
  return `${seconds}s`;
}

function flushStageBuffer(
  buffer: ProcessStep[],
  blocks: ProcessBlock[],
  pendingThinkingMs: number | null,
): void {
  if (pendingThinkingMs != null && pendingThinkingMs >= 1000) {
    buffer.unshift({
      kind: "thinking",
      id: `thinking:${blocks.length}:${buffer.length}`,
      durationMs: pendingThinkingMs,
    });
  }
  if (buffer.length === 0) return;
  const status = stageStatusFromSteps(buffer);
  const scrollTargetId =
    buffer.find((step) => step.kind === "tool")?.id ??
    buffer.find((step) => step.kind === "activity")?.id ??
    buffer[0]!.id;
  blocks.push({
    kind: "stage",
    id: `stage:${scrollTargetId}`,
    title: stageTitleFromSteps(buffer),
    steps: [...buffer],
    status,
    durationLabel: durationLabelFromSteps(buffer),
    scrollTargetId,
  });
  buffer.length = 0;
}

/**
 * Groups flat transcript rows into prose + collapsible process stages for the Lancer chat surface.
 */
function parseHandoffProse(text: string): { from: string; to: string; detail?: string } | null {
  const match = /^Handoff\s*[·•]\s*([^→]+)→\s*([^\n]+)(?:\n([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  return {
    from: match[1]!.trim(),
    to: match[2]!.trim(),
    detail: match[3]?.trim(),
  };
}

export function buildProcessBlocks(items: readonly DisplayTimelineItem[]): readonly ProcessBlock[] {
  const blocks: ProcessBlock[] = [];
  const buffer: ProcessStep[] = [];
  let pendingThinkingMs: number | null = null;
  let messageIndex = 0;

  const pushStep = (step: ProcessStep) => {
    buffer.push(step);
  };

  for (const item of items) {
    if (item.kind === "message") {
      if (item.role === "user") {
        flushStageBuffer(buffer, blocks, pendingThinkingMs);
        pendingThinkingMs = null;
        blocks.push({
          kind: "user",
          id: item.id,
          text: item.text,
          ...(item.attachments?.length ? { attachments: item.attachments } : {}),
        });
        messageIndex += 1;
        continue;
      }

      if (item.role === "assistant") {
        flushStageBuffer(buffer, blocks, pendingThinkingMs);
        pendingThinkingMs = null;
        const handoff = parseHandoffProse(item.text);
        if (handoff) {
          blocks.push({
            kind: "handoff",
            id: `handoff:${item.id}`,
            fromLabel: handoff.from,
            toLabel: handoff.to,
            detail: handoff.detail,
          });
          messageIndex += 1;
          continue;
        }
        blocks.push({
          kind: "assistant-prose",
          createdAt: item.createdAt,
          id: item.id,
          text: item.text,
          sourceMessageIndex: messageIndex,
        });
        messageIndex += 1;
        continue;
      }

      if (item.role === "branchSummary" || item.role === "compactionSummary") {
        flushStageBuffer(buffer, blocks, pendingThinkingMs);
        pendingThinkingMs = null;
        blocks.push({
          kind: "summary-card",
          id: item.id,
          role: item.role,
          text: item.text,
          steps: [
            {
              kind: "summary",
              id: `summary-step:${item.id}`,
              item: {
                kind: "summary",
                id: item.id,
                createdAt: item.createdAt,
                label: item.text,
                presentation: "inline",
              },
            },
          ],
        });
        continue;
      }
    }

    if (item.kind === "turn-changes") {
      flushStageBuffer(buffer, blocks, pendingThinkingMs);
      pendingThinkingMs = null;
      blocks.push({ kind: "turn-changes", id: item.id, turnId: item.turn.checkpointId });
      continue;
    }

    if (item.kind === "turn-marker") {
      pendingThinkingMs = item.durationMs;
      continue;
    }

    if (item.kind === "tool") {
      pushStep({ kind: "tool", id: item.id, item });
      continue;
    }

    if (item.kind === "activity") {
      pushStep({ kind: "activity", id: item.id, item });
      continue;
    }

    if (item.kind === "summary") {
      pushStep({ kind: "summary", id: item.id, item });
    }
  }

  flushStageBuffer(buffer, blocks, pendingThinkingMs);
  return blocks;
}

export function processBlockScrollId(block: ProcessBlock): string {
  switch (block.kind) {
    case "stage":
      return block.scrollTargetId;
    case "summary-card":
      return block.id;
    case "turn-changes":
      return block.id;
    default:
      return block.id;
  }
}

export function flattenProcessBlocksForVirtualization(
  blocks: readonly ProcessBlock[],
): readonly { readonly id: string; readonly block: ProcessBlock }[] {
  return blocks.map((block) => ({ id: block.id, block }));
}
