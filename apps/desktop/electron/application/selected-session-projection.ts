import { sessionKey } from "@lancer/session-driver";
import type { DesktopAppState, QueuedComposerMessage } from "../../contracts/desktop-state";
import type { QueuedComposerEditState } from "../conversation/session-state-map";
import { cloneComposerAttachments } from "./app-store-utils";

/** The per-session mirrors the selected-session projection reads. */
export interface SelectedSessionQueueSources {
  readonly queuedComposerMessagesBySession: ReadonlyMap<string, readonly QueuedComposerMessage[]>;
  readonly queuedComposerEditsBySession: ReadonlyMap<string, QueuedComposerEditState>;
}

/** Shared empty result: publishing runs per streamed token, so avoid churn. */
const NO_QUEUED_MESSAGES: readonly QueuedComposerMessage[] = [];

/**
 * Per-mirror-array projection cache. Replacing the queue replaces the array, so
 * a cache entry can never outlive the queue it was derived from. Without it,
 * every streamed token re-runs `filter`/`map` and clones attachments, handing
 * the renderer a new array each time and defeating its memoization.
 */
const projectedQueues = new WeakMap<
  readonly QueuedComposerMessage[],
  Map<string, readonly QueuedComposerMessage[]>
>();

/**
 * The queue the composer shows for the selected session.
 *
 * The session mirrors, not the published snapshot, are the source of truth: they
 * are updated by driver events. Reusing the previously projected array kept an
 * orphaned queue alive in every response built before the session-event FIFO
 * drained — the visible "Stop did not clear the queue" defect.
 */
export function projectQueuedComposerMessages(
  workspaceId: string,
  sessionId: string,
  sources: SelectedSessionQueueSources,
): readonly QueuedComposerMessage[] {
  if (!workspaceId || !sessionId) {
    return NO_QUEUED_MESSAGES;
  }

  const key = sessionKey({ workspaceId, sessionId });
  const queued = sources.queuedComposerMessagesBySession.get(key);
  if (!queued || queued.length === 0) {
    return NO_QUEUED_MESSAGES;
  }

  const cached = projectedQueues.get(queued)?.get(key);
  if (cached) {
    return cached;
  }

  // Steer messages are folded into the transcript, so the composer list only
  // shows follow-ups — matching what the driver is holding for the next turn.
  const projected = queued
    .filter((message) => message.mode === "followUp")
    .map((message) => ({
      ...message,
      attachments: cloneComposerAttachments(message.attachments),
    }));
  const bySelection =
    projectedQueues.get(queued) ?? new Map<string, readonly QueuedComposerMessage[]>();
  bySelection.set(key, projected);
  projectedQueues.set(queued, bySelection);
  return projected;
}

export function projectEditingQueuedMessageId(
  workspaceId: string,
  sessionId: string,
  sources: SelectedSessionQueueSources,
): string | undefined {
  if (!workspaceId || !sessionId) {
    return undefined;
  }

  return sources.queuedComposerEditsBySession.get(sessionKey({ workspaceId, sessionId }))
    ?.messageId;
}

/** Re-derive every queue field that belongs to the selected session. */
export function projectSelectedSessionFields(
  state: DesktopAppState,
  sources: SelectedSessionQueueSources,
): DesktopAppState {
  return {
    ...state,
    queuedComposerMessages: projectQueuedComposerMessages(
      state.selectedWorkspaceId,
      state.selectedSessionId,
      sources,
    ),
    editingQueuedMessageId: projectEditingQueuedMessageId(
      state.selectedWorkspaceId,
      state.selectedSessionId,
      sources,
    ),
  };
}
