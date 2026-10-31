import type { ProcessBlock } from "./build-process-blocks";
import {
  ProcessAssistantProse,
  ProcessHandoffCard,
  ProcessStageBlock,
  ProcessSummaryCardBlock,
  ProcessTurnChangesWrapper,
  ProcessUserBubble,
} from "./process-step-rows";
import { TimelineItem } from "../timeline-item";
import type { OpenTurnChange } from "../turn-changes-card";
import type { TurnChangeSummary } from "../../../../contracts/review";
import type { ScheduledTaskOrigin } from "../../../../contracts/scheduled-tasks";
import type { WorkspaceFileLine } from "../workspace-file-line";
import { t } from "../../../../contracts/i18n";
import { ImageAttachmentThumb } from "../image-attachment-thumb";

export function ProcessTimelineBlock({
  block,
  highlightedId,
  expandedToolCallIds,
  onToggleToolCall,
  onViewFileInDiff,
  onOpenTurnChange,
  onForkFromMessage,
  scheduledOrigin,
  workspacePath,
  onOpenWorkspaceFileLine,
  turnByCheckpointId,
  assistantLaneLabel,
  assistantModelLabel,
}: {
  readonly block: ProcessBlock;
  readonly highlightedId?: string | null;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onToggleToolCall: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
  readonly onOpenTurnChange?: OpenTurnChange;
  readonly onForkFromMessage?: (messageIndex: number, preview?: string) => void;
  readonly scheduledOrigin?: ScheduledTaskOrigin;
  readonly workspacePath?: string;
  readonly onOpenWorkspaceFileLine?: (target: WorkspaceFileLine) => void;
  readonly turnByCheckpointId: ReadonlyMap<string, TurnChangeSummary>;
  readonly assistantLaneLabel?: string;
  readonly assistantModelLabel?: string;
}) {
  const highlighted = highlightedId === block.id;

  switch (block.kind) {
    case "user":
      return (
        <div data-process-id={block.id}>
          <ProcessUserBubble text={block.text} highlighted={highlighted}>
            {scheduledOrigin ? (
              <div className="timeline-item__scheduled-origin" data-testid="sent-by-scheduled-task">
                {t("timeline.sentByScheduledTask")}
              </div>
            ) : null}
            {block.attachments?.length ? (
              <div className="timeline-item__attachments">
                {block.attachments.map((attachment, index) =>
                  attachment.kind === "image" ? (
                    <ImageAttachmentThumb
                      className="timeline-item__attachment timeline-item__attachment--image"
                      key={`${block.id}:${index}`}
                      name={
                        attachment.name ?? t("timeline.attachmentFallback", { index: index + 1 })
                      }
                      src={`data:${attachment.mimeType};base64,${attachment.data}`}
                    />
                  ) : (
                    <div
                      className="timeline-item__attachment timeline-item__attachment--file"
                      key={`${block.id}:${index}`}
                      title={attachment.fsPath}
                    >
                      <span className="timeline-item__attachment-name">{attachment.name}</span>
                    </div>
                  ),
                )}
              </div>
            ) : null}
          </ProcessUserBubble>
        </div>
      );
    case "handoff":
      return (
        <ProcessHandoffCard
          id={block.id}
          fromLabel={block.fromLabel}
          toLabel={block.toLabel}
          detail={block.detail}
          highlighted={highlighted}
        />
      );
    case "assistant-prose":
      return (
        <ProcessAssistantProse
          id={block.id}
          text={block.text}
          highlighted={highlighted}
          laneLabel={assistantLaneLabel}
          modelLabel={assistantModelLabel}
          workspacePath={workspacePath}
          onOpenWorkspaceFileLine={onOpenWorkspaceFileLine}
          actions={
            block.sourceMessageIndex !== undefined && onForkFromMessage ? (
              <div className="timeline-item__actions">
                <button
                  type="button"
                  className="timeline-item__action"
                  data-testid="fork-from-message"
                  onClick={() => onForkFromMessage(block.sourceMessageIndex!, block.text)}
                >
                  {t("timeline.fork")}
                </button>
              </div>
            ) : null
          }
        />
      );
    case "stage":
      return (
        <ProcessStageBlock
          blockId={block.id}
          scrollTargetId={block.scrollTargetId}
          title={block.title}
          steps={block.steps}
          status={block.status}
          durationLabel={block.durationLabel}
          highlighted={
            highlighted ||
            highlightedId === block.scrollTargetId ||
            highlightedId === block.id ||
            (block.scrollTargetId ? highlightedId === `stage:${block.scrollTargetId}` : false)
          }
          expandedToolCallIds={expandedToolCallIds}
          onToggleToolCall={onToggleToolCall}
          onViewFileInDiff={onViewFileInDiff}
        />
      );
    case "summary-card":
      return (
        <ProcessSummaryCardBlock
          blockId={block.id}
          role={block.role}
          text={block.text}
          steps={block.steps}
          highlighted={highlighted}
          expandedToolCallIds={expandedToolCallIds}
          onToggleToolCall={onToggleToolCall}
        />
      );
    case "turn-changes": {
      const turn = turnByCheckpointId.get(block.turnId);
      if (!turn) return null;
      return (
        <ProcessTurnChangesWrapper
          turnId={block.turnId}
          highlighted={highlighted}
          onOpenTurnChange={onOpenTurnChange}
          renderCard={() => (
            <TimelineItem
              item={{ kind: "turn-changes", id: block.id, turn }}
              onOpenTurnChange={onOpenTurnChange}
            />
          )}
        />
      );
    }
    default:
      return null;
  }
}
