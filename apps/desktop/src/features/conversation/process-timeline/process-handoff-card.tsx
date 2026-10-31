import { ModelBrandIcon } from "../../../ui/model-brand-icon";
import { MessageMarkdown } from "../message-markdown";
import "./process-evidence.css";

/** Recorded handoff data, without inferred token or validation claims. */
export function ProcessHandoffCard({
  from,
  to,
  summary,
  files = [],
  status,
}: {
  readonly from: string;
  readonly to: string;
  readonly summary?: string;
  readonly files?: readonly string[];
  readonly status?: string;
}) {
  return (
    <section className="process-handoff-card" aria-label={`交接包 · ${from} → ${to}`}>
      <header>
        <ModelBrandIcon modelId={from} />
        <span aria-hidden="true">→</span>
        <ModelBrandIcon modelId={to} />
        <strong>
          交接包 · {from} → {to}
        </strong>
        {status ? <small>{status}</small> : null}
      </header>
      {files.length ? (
        <div className="process-handoff-card__row">
          <span>文件</span>
          <div>
            {files.map((file) => (
              <code key={file}>{file}</code>
            ))}
          </div>
        </div>
      ) : null}
      {summary ? (
        <div className="process-handoff-card__row">
          <span>摘要</span>
          {summary.length > 300 ? (
            <details>
              <summary>查看交接内容</summary>
              <MessageMarkdown text={summary} />
            </details>
          ) : (
            <MessageMarkdown text={summary} />
          )}
        </div>
      ) : null}
    </section>
  );
}
