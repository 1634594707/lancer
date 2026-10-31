import { useState } from "react";
import { MessageMarkdown } from "../message-markdown";
import "./branch-return-card.css";

/** Keep the full return envelope for the model and history; show only the result and deliverables in the UI. */
export function BranchReturnCard({
  text,
  workspacePath,
  pending = false,
  onOpenDeliverable,
}: {
  text: string;
  workspacePath?: string;
  pending?: boolean;
  onOpenDeliverable?: (path: string) => Promise<void>;
}) {
  const [fileError, setFileError] = useState("");
  const normalized = text.includes("\n") ? text : text.replace(/\\n/g, "\n");
  const envelope = normalized.replace(/^\[return:[^\]]+\]\n/, "");
  const body = envelope.split("\n\n请向用户汇总")[0]!;
  const marker = "\n结果（分支报告，需核对）：\n";
  const split = body.indexOf(marker);
  const result = split >= 0 ? body.slice(split + marker.length).trim() : "";
  const task = split >= 0 ? body.slice(0, split) : body;
  const heading = /^并行分支「([\s\S]*?)」(失败|已完成)。\n/.exec(task);
  // Keep deliverable links separate from the short result; never print routing instructions.
  const links = [...new Set(result.match(/!?\[[^\]\n]+\]\([^\n]+?\)/g) ?? [])].map((link) =>
    link.replace(/^!/, ""),
  );
  const preview = result
    .replace(/!?\[[^\]\n]+\]\([^\n]+?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (
    <section className="branch-return-card" aria-label="分支回传">
      <header>
        <strong>
          {heading?.[2] === "失败" ? "任务未完成" : pending ? "结果已就绪，等待汇总" : "已完成"}
        </strong>
      </header>
      <p>
        {preview ? `${preview.slice(0, 100)}${preview.length > 100 ? "…" : ""}` : "结果已保存。"}
      </p>
      {links.length > 0 && (
        <div className="branch-return-card__files" aria-label="交付物">
          {links.map((link) => {
            const match = /^\[([^\]]+)\]\((.*)\)$/.exec(link);
            const label = match?.[1] ?? "交付物";
            const href = (match?.[2] ?? "").replace(/^<|>$/g, "");
            if (!onOpenDeliverable || /^(?:https?:|mailto:)/i.test(href)) {
              return <MessageMarkdown key={link} text={link} workspacePath={workspacePath} />;
            }
            let path = href;
            try {
              if (href.startsWith("file:")) path = decodeURIComponent(new URL(href).pathname);
            } catch {
              /* Report through the existing file boundary. */
            }
            return (
              <button
                key={link}
                type="button"
                className="message__file-link"
                onClick={() => {
                  setFileError("");
                  void onOpenDeliverable(path).catch(() =>
                    setFileError("无法定位文件，请检查交付路径。"),
                  );
                }}
              >
                {label}
              </button>
            );
          })}
          {fileError && <p role="alert">{fileError}</p>}
        </div>
      )}
      {preview.length > 100 && (
        <details>
          <summary>查看完整结果</summary>
          <MessageMarkdown text={result} workspacePath={workspacePath} />
        </details>
      )}
    </section>
  );
}
