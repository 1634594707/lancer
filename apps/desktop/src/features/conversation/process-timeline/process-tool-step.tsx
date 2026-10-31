import { useState } from "react";
import type { TimelineToolCall } from "../../../../contracts/timeline-types";
import { t } from "../../../../contracts/i18n";
import { ChevronRightIcon, DiffIcon } from "../../../ui/icons";
import "./process-evidence.css";
import {
  buildProcessToolExcerpt,
  buildProcessToolSummary,
  formatToolRawJson,
  processToolCommand,
  toolPathFromInput,
} from "./process-tool-format";

export function ProcessToolStep({
  item,
  defaultOpen = true,
  onViewFileInDiff,
}: {
  readonly item: TimelineToolCall;
  readonly defaultOpen?: boolean;
  readonly onViewFileInDiff?: (path: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showRaw, setShowRaw] = useState(false);
  const summary = buildProcessToolSummary(item);
  const filePath = /write|edit|patch|apply/i.test(item.toolName)
    ? toolPathFromInput(item.input)
    : "";
  const excerpt = buildProcessToolExcerpt(item);
  const command = processToolCommand(item);
  const hasBody = excerpt.length > 0 || item.input !== undefined || item.output !== undefined;

  return (
    <div
      className={`process-tool-step process-tool-step--${item.status} ${open ? "process-tool-step--open" : ""}`}
      data-process-id={item.id}
    >
      <div className="process-tool-step__header-row">
        <button
          type="button"
          className="process-tool-step__head"
          aria-expanded={open}
          disabled={!hasBody}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="process-stage__chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
          <span className="process-tool-step__summary">{summary}</span>
          {item.metadata ? <span className="process-tool-step__meta">{item.metadata}</span> : null}
        </button>
        {filePath && onViewFileInDiff ? (
          <button
            type="button"
            className="icon-button process-tool-step__view-diff"
            data-testid="timeline-tool-view-in-diff"
            aria-label={t("timeline.viewInChanges", { path: filePath })}
            onClick={() => onViewFileInDiff(filePath)}
          >
            <DiffIcon />
          </button>
        ) : null}
      </div>
      {open && hasBody ? (
        <div className="process-tool-step__body">
          {command || excerpt ? (
            <div className="process-tool-step__terminal">
              {command ? <pre className="process-tool-step__command">$ {command}</pre> : null}
              {excerpt ? <pre className="process-tool-step__output">{excerpt}</pre> : null}
            </div>
          ) : null}
          {item.input !== undefined || item.output !== undefined ? (
            <div className="process-tool-step__raw-bar">
              <button
                type="button"
                className="process-tool-step__raw-toggle"
                aria-expanded={showRaw}
                onClick={() => setShowRaw((value) => !value)}
              >
                {t("process.step.rawToggle")}
              </button>
            </div>
          ) : null}
          {showRaw ? <pre className="process-tool-step__raw">{formatToolRawJson(item)}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
