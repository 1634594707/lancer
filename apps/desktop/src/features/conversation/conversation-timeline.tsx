import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import type { TranscriptMessage } from "../../../contracts/desktop-state";
import type { TurnChangeSummary } from "../../../contracts/review";
import { t } from "../../../contracts/i18n";
import type { ScheduledTaskOrigin } from "../../../contracts/scheduled-tasks";
import type { TimelineViewport } from "./hooks/use-timeline-viewport";
import { ThreadSearchBar } from "./thread-search";
import type { OpenTurnChange } from "./turn-changes-card";
import type { WorkspaceFileLine } from "./workspace-file-line";
import { SparkIcon } from "../../ui/icons";
import { processBlockAnchorId, type ProcessBlock } from "./process-timeline/build-process-blocks";
import { ProcessTimelineBlock } from "./process-timeline/process-timeline-blocks";

interface ThreadSearchModel {
  readonly isOpen: boolean;
  readonly query: string;
  readonly matchCount: number;
  readonly activeIndex: number;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly search: (query: string) => void;
  readonly goToMatch: (direction: 1 | -1) => void;
  readonly close: () => void;
}
interface ConversationTimelineProps {
  readonly transcript: readonly TranscriptMessage[];
  readonly isTranscriptLoading: boolean;
  readonly transcriptFailed?: { readonly retrying: boolean } | null;
  readonly onRetryTranscript?: () => void;
  readonly viewport: TimelineViewport;
  readonly threadSearch: ThreadSearchModel;
  readonly onViewFileInDiff?: (path: string) => void;
  readonly onOpenTurnChange?: OpenTurnChange;
  readonly onForkFromMessage?: (messageIndex: number, preview?: string) => void;
  readonly onOpenWorkspaceFileLine?: (target: WorkspaceFileLine) => void;
  readonly scheduledOrigins?: ReadonlyMap<string, ScheduledTaskOrigin>;
  readonly workspacePath?: string;
  readonly processBlocks: readonly ProcessBlock[];
  readonly turnChanges?: readonly TurnChangeSummary[];
  readonly highlightedItemId?: string | null;
  readonly assistantLaneLabel?: string;
  readonly assistantModelLabel?: string;
}
export function ConversationTimeline({
  transcript,
  isTranscriptLoading,
  transcriptFailed = null,
  onRetryTranscript,
  viewport,
  threadSearch,
  onViewFileInDiff,
  onOpenTurnChange,
  onForkFromMessage,
  onOpenWorkspaceFileLine,
  scheduledOrigins,
  workspacePath,
  processBlocks,
  turnChanges = [],
  highlightedItemId = null,
  assistantLaneLabel,
  assistantModelLabel,
}: ConversationTimelineProps) {
  const [expandedToolCallIds, setExpandedToolCallIds] = useState<Set<string>>(() => new Set());
  const toggleToolCall = useCallback(
    (id: string) =>
      setExpandedToolCallIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );
  useLayoutEffect(() => {
    const available = new Set(
      transcript.filter((item) => item.kind === "tool").map((item) => item.callId),
    );
    setExpandedToolCallIds((current) => {
      if ([...current].every((id) => available.has(id))) return current;
      return new Set([...current].filter((id) => available.has(id)));
    });
  }, [transcript]);
  const turnByCheckpointId = useMemo(() => {
    const map = new Map<string, TurnChangeSummary>();
    for (const turn of turnChanges) map.set(turn.checkpointId, turn);
    return map;
  }, [turnChanges]);
  return (
    <div className="timeline-surface">
      <div className="timeline-column">
        {threadSearch.isOpen ? (
          <ThreadSearchBar
            query={threadSearch.query}
            matchCount={threadSearch.matchCount}
            activeIndex={threadSearch.activeIndex}
            inputRef={threadSearch.inputRef}
            onSearch={threadSearch.search}
            onNext={() => threadSearch.goToMatch(1)}
            onPrev={() => threadSearch.goToMatch(-1)}
            onClose={threadSearch.close}
          />
        ) : null}
        <div
          className="timeline-pane timeline-pane--thread"
          data-testid="timeline-pane"
          ref={viewport.attachPane}
          tabIndex={0}
        >
          {transcriptFailed ? (
            <div className="timeline" data-testid="transcript">
              <TranscriptHydrateError
                retrying={transcriptFailed.retrying}
                onRetry={onRetryTranscript}
              />
            </div>
          ) : isTranscriptLoading ? (
            <div className="timeline" data-testid="transcript">
              <TranscriptSkeleton />
            </div>
          ) : transcript.length === 0 ? (
            <div className="timeline" data-testid="transcript">
              <TranscriptEmptyState />
            </div>
          ) : (
            <div className="timeline process-timeline" data-testid="transcript">
              {processBlocks.map((block) => (
                <MeasuredProcessBlock
                  key={block.id}
                  id={processBlockAnchorId(block)}
                  viewport={viewport}
                >
                  <ProcessTimelineBlock
                    block={block}
                    highlightedId={highlightedItemId}
                    expandedToolCallIds={expandedToolCallIds}
                    onToggleToolCall={toggleToolCall}
                    onViewFileInDiff={onViewFileInDiff}
                    onOpenTurnChange={onOpenTurnChange}
                    onForkFromMessage={onForkFromMessage}
                    onOpenWorkspaceFileLine={onOpenWorkspaceFileLine}
                    workspacePath={workspacePath}
                    scheduledOrigin={
                      block.kind === "user" ? scheduledOrigins?.get(block.id) : undefined
                    }
                    turnByCheckpointId={turnByCheckpointId}
                    assistantLaneLabel={assistantLaneLabel}
                    assistantModelLabel={assistantModelLabel}
                  />
                </MeasuredProcessBlock>
              ))}
            </div>
          )}
          {!transcriptFailed && viewport.showJumpToLatest ? (
            <button
              className="timeline-jump"
              data-testid="timeline-jump"
              type="button"
              onClick={viewport.jumpToLatest}
            >
              {t("timeline.newActivityBelow")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MeasuredProcessBlock({
  id,
  viewport,
  children,
}: {
  readonly id: string;
  readonly viewport: TimelineViewport;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { measureRow, layoutGeneration } = viewport;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => measureRow(id, element.getBoundingClientRect().height, layoutGeneration);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, measureRow, layoutGeneration]);
  return (
    <div ref={ref} data-message-id={id} className="process-timeline__block">
      {children}
    </div>
  );
}

function TranscriptSkeleton() {
  return (
    <div className="transcript-skeleton" data-testid="transcript-skeleton" aria-hidden="true">
      <div className="transcript-skeleton__row transcript-skeleton__row--user">
        <span className="skeleton-line" style={{ width: "42%" }} />
      </div>
      <div className="transcript-skeleton__row">
        <span className="skeleton-line" style={{ width: "88%" }} />
        <span className="skeleton-line" style={{ width: "94%" }} />
        <span className="skeleton-line" style={{ width: "66%" }} />
      </div>
      <div className="transcript-skeleton__row transcript-skeleton__row--tool">
        <span className="skeleton-line skeleton-line--tool" style={{ width: "38%" }} />
      </div>
      <div className="transcript-skeleton__row">
        <span className="skeleton-line" style={{ width: "80%" }} />
        <span className="skeleton-line" style={{ width: "72%" }} />
      </div>
      <span className="sr-only">{t("timeline.loadingTranscript")}</span>
    </div>
  );
}

export function TranscriptHydrateError({
  retrying,
  onRetry,
}: {
  readonly retrying: boolean;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="transcript-hydrate-error" data-testid="transcript-hydrate-error">
      <h2>{t("timeline.loadErrorTitle")}</h2>
      <p>{t("timeline.loadErrorBody")}</p>
      <div className="transcript-hydrate-error__actions">
        <button
          className="button button--primary"
          data-testid="hydrate-retry"
          type="button"
          disabled={retrying || !onRetry}
          onClick={onRetry}
        >
          {retrying ? t("timeline.retrying") : t("timeline.retry")}
        </button>
      </div>
    </div>
  );
}

function TranscriptEmptyState() {
  return (
    <div className="transcript-empty" data-testid="transcript-empty">
      <span className="transcript-empty__glyph" aria-hidden="true">
        <SparkIcon />
      </span>
      <p className="transcript-empty__title">{t("timeline.emptyTitle")}</p>
      <p className="transcript-empty__hint">{t("timeline.emptyHint")}</p>
    </div>
  );
}
