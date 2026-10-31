import { useCallback, useState, type ReactNode } from "react";
import type { ProcessStep } from "./build-process-blocks";
import { TimelineItem } from "../timeline-item";
import { MessageMarkdown } from "../message-markdown";
import type { OpenTurnChange } from "../turn-changes-card";
import type { WorkspaceFileLine } from "../workspace-file-line";
import { t, tPlural } from "../../../../contracts/i18n";
import { ChevronRightIcon } from "../../../ui/icons";
import { ProcessToolStep } from "./process-tool-step";

function useExpandedSet(initial: readonly string[] = []) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(initial));
  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return { expanded, toggle };
}

export function ProcessStageBlock({
  blockId,
  scrollTargetId,
  title,
  steps,
  status,
  durationLabel,
  highlighted,
  expandedToolCallIds,
  onToggleToolCall,
  onViewFileInDiff,
}: {
  readonly blockId: string;
  readonly scrollTargetId: string;
  readonly title: string;
  readonly steps: readonly ProcessStep[];
  readonly status: "running" | "done" | "error";
  readonly durationLabel?: string;
  readonly highlighted?: boolean;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onToggleToolCall?: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
}) {
  const { expanded, toggle } = useExpandedSet();
  const open = expanded.has(blockId);
  const meta =
    status === "running"
      ? t("process.stage.running")
      : tPlural(steps.length, "process.stage.metaOne", "process.stage.metaMany", {
          duration: durationLabel ?? "—",
        });

  return (
    <div
      className={`process-stage ${open ? "process-stage--open" : ""} ${highlighted ? "process-stage--hl" : ""}`}
      data-process-id={blockId}
      data-scroll-target={scrollTargetId}
    >
      <button
        type="button"
        className="process-stage__head"
        aria-expanded={open}
        onClick={() => toggle(blockId)}
      >
        <span className="process-stage__chevron" aria-hidden="true">
          <ChevronRightIcon />
        </span>
        <span
          className={`process-stage__status process-stage__status--${status}`}
          aria-hidden="true"
        />
        <span className="process-stage__title">{title}</span>
        <span className="process-stage__meta">{meta}</span>
      </button>
      {open ? (
        <div className="process-stage__body">
          <div className="process-stage__steps">
            {steps.map((step) => (
              <ProcessStepRow
                key={step.id}
                step={step}
                expandedToolCallIds={expandedToolCallIds}
                onToggleToolCall={onToggleToolCall}
                onViewFileInDiff={onViewFileInDiff}
                expandToolsInline
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProcessSummaryCardBlock({
  blockId,
  role,
  text,
  steps,
  highlighted,
  expandedToolCallIds,
  onToggleToolCall,
}: {
  readonly blockId: string;
  readonly role: "branchSummary" | "compactionSummary";
  readonly text: string;
  readonly steps: readonly ProcessStep[];
  readonly highlighted?: boolean;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onToggleToolCall?: (callId: string) => void;
}) {
  const { expanded, toggle } = useExpandedSet();
  const title =
    role === "branchSummary" ? t("timeline.branchSummary") : t("timeline.compactionSummary");
  const open = expanded.has(blockId);

  return (
    <div
      className={`process-stage process-stage--summary ${open ? "process-stage--open" : ""} ${highlighted ? "process-stage--hl" : ""}`}
      data-process-id={blockId}
    >
      <button
        type="button"
        className="process-stage__head"
        aria-expanded={open}
        onClick={() => toggle(blockId)}
      >
        <span className="process-stage__chevron" aria-hidden="true">
          <ChevronRightIcon />
        </span>
        <span className="process-stage__title">{title}</span>
        <span className="process-stage__meta">{t("process.stage.oneStep")}</span>
      </button>
      {open ? (
        <div className="process-stage__body">
          {steps.map((step) => (
            <ProcessStepRow
              key={step.id}
              step={step}
              expandedToolCallIds={expandedToolCallIds}
              onToggleToolCall={onToggleToolCall}
              detailOverride={text}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProcessStepRow({
  step,
  expandedToolCallIds,
  onToggleToolCall,
  onViewFileInDiff,
  detailOverride,
  expandToolsInline = false,
}: {
  readonly step: ProcessStep;
  readonly expandedToolCallIds: ReadonlySet<string>;
  readonly onToggleToolCall?: (callId: string) => void;
  readonly onViewFileInDiff?: (path: string) => void;
  readonly detailOverride?: string;
  readonly expandToolsInline?: boolean;
}) {
  const { expanded, toggle } = useExpandedSet();

  if (step.kind === "tool") {
    if (expandToolsInline) {
      return <ProcessToolStep item={step.item} defaultOpen={false} />;
    }
    return (
      <div className="process-step process-step--tool" data-process-id={step.id}>
        <TimelineItem
          item={step.item}
          expandedToolCallIds={expandedToolCallIds}
          onToggleToolCall={onToggleToolCall}
          onViewFileInDiff={onViewFileInDiff}
        />
      </div>
    );
  }

  if (step.kind === "thinking") {
    const open = expanded.has(step.id);
    const seconds = Math.max(1, Math.round(step.durationMs / 1000));
    return (
      <div className={`process-step process-step--thinking ${open ? "process-step--open" : ""}`}>
        <button type="button" className="process-step__head" onClick={() => toggle(step.id)}>
          <span className="process-stage__chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
          <span className="process-step__label">{t("process.step.thinkingLabel")}</span>
          <span className="process-step__hint">
            {t("process.step.thinkingDuration", { seconds })}
          </span>
        </button>
        {open ? (
          <div className="process-step__detail process-step__detail--prose">
            {t("process.step.thinkingDetail")}
          </div>
        ) : null}
      </div>
    );
  }

  const label =
    step.kind === "activity" ? step.item.label : step.kind === "summary" ? step.item.label : "";
  const detail =
    detailOverride ??
    (step.kind === "activity"
      ? (step.item.detail ?? step.item.metadata)
      : step.kind === "summary"
        ? step.item.metadata
        : undefined);
  const open = expanded.has(step.id);

  return (
    <div className={`process-step ${open ? "process-step--open" : ""}`} data-process-id={step.id}>
      <button
        type="button"
        className="process-step__head"
        aria-expanded={open}
        onClick={() => toggle(step.id)}
      >
        <span className="process-stage__chevron" aria-hidden="true">
          <ChevronRightIcon />
        </span>
        <span className="process-step__label">{label}</span>
        {detail && !open ? <span className="process-step__hint">{detail}</span> : null}
      </button>
      {open ? (
        <div className="process-step__detail">{detail ?? t("process.step.noDetail")}</div>
      ) : null}
    </div>
  );
}

export function ProcessUserBubble({
  text,
  highlighted,
  children,
}: {
  readonly text: string;
  readonly highlighted?: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className={`process-user ${highlighted ? "process-user--hl" : ""}`} data-process-id="user">
      {children}
      <div className="process-user__bubble">{text}</div>
    </div>
  );
}

export function ProcessHandoffCard({
  id,
  fromLabel,
  toLabel,
  detail,
  highlighted,
}: {
  readonly id: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly detail?: string;
  readonly highlighted?: boolean;
}) {
  return (
    <div
      className={`process-handoff ${highlighted ? "process-handoff--hl" : ""}`}
      data-process-id={id}
    >
      <div className="process-handoff__title">
        {t("lancer.handoff.title")} · {fromLabel} <span className="process-handoff__arrow">→</span>{" "}
        {toLabel}
      </div>
      {detail ? <div className="process-handoff__detail">{detail}</div> : null}
    </div>
  );
}

export function ProcessAssistantProse({
  id,
  text,
  highlighted,
  actions,
  laneLabel,
  modelLabel,
  onOpenWorkspaceFileLine,
  workspacePath,
}: {
  readonly id: string;
  readonly text: string;
  readonly highlighted?: boolean;
  readonly actions?: ReactNode;
  readonly laneLabel?: string;
  readonly modelLabel?: string;
  readonly onOpenWorkspaceFileLine?: (target: WorkspaceFileLine) => void;
  readonly workspacePath?: string;
}) {
  return (
    <div
      className={`process-assistant ${highlighted ? "process-assistant--hl" : ""}`}
      data-process-id={id}
    >
      {laneLabel && modelLabel ? (
        <div className="process-assistant__who">
          <span className="process-assistant__lane">{laneLabel}</span>
          <span className="process-assistant__model">{modelLabel}</span>
        </div>
      ) : null}
      <MessageMarkdown
        text={text}
        workspacePath={workspacePath}
        onOpenWorkspaceFileLine={onOpenWorkspaceFileLine}
      />
      {actions}
    </div>
  );
}

export function ProcessTurnChangesWrapper({
  turnId,
  highlighted,
  onOpenTurnChange,
  renderCard,
}: {
  readonly turnId: string;
  readonly highlighted?: boolean;
  readonly onOpenTurnChange?: OpenTurnChange;
  readonly renderCard: (turnId: string) => ReactNode;
}) {
  return (
    <div
      className={`process-turn-changes ${highlighted ? "process-turn-changes--hl" : ""}`}
      data-process-id={turnId}
    >
      {renderCard(turnId)}
    </div>
  );
}
