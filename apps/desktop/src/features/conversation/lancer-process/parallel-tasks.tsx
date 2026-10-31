import { useEffect, useRef, useState } from "react";
import type { LiveProcessInput } from "./live-model";
import { conversationRoot } from "../../../../contracts/lancer-assistants";

export function ParallelTasks({
  input,
  onSelectThread,
}: {
  readonly input: LiveProcessInput;
  readonly onSelectThread: (target: { workspaceId: string; sessionId: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  if (!input.workspaceId || input.selectedSessionId === "new-thread") return null;
  const target = { workspaceId: input.workspaceId, sessionId: input.selectedSessionId };
  const root = conversationRoot(target, input.children);
  const parent = input.children?.find(
    (c) => c.childSessionId === target.sessionId && c.childWorkspaceId === target.workspaceId,
  );
  const children =
    input.children?.filter(
      (c) => c.parentSessionId === target.sessionId && c.parentWorkspaceId === target.workspaceId,
    ) ?? [];
  return (
    <>
      <div className="parallel-toolbar">
        {parent ? (
          <button
            type="button"
            onClick={() =>
              onSelectThread({
                workspaceId: parent.parentWorkspaceId,
                sessionId: parent.parentSessionId,
              })
            }
          >
            返回上级会话
          </button>
        ) : null}
        <button type="button" data-testid="launch-parallel-tasks" onClick={() => setOpen(true)}>
          并行任务 +
        </button>
        <span>{children.filter((c) => c.status === "running").length} 条分支运行中</span>
        <select
          aria-label="会话所属助手"
          value={input.assistantId}
          onChange={(e) =>
            window.piApp &&
            void window.piApp
              .lancerAction({ kind: "assign", target: root, assistantId: e.target.value })
              .catch((e) => setError(String(e)))
          }
        >
          {input.assistants?.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {children.length ? (
        <div className="parallel-branches">
          {children.map((c) => (
            <span key={c.id}>
              <button
                type="button"
                title={c.goal}
                onClick={() =>
                  onSelectThread({ workspaceId: c.childWorkspaceId, sessionId: c.childSessionId })
                }
              >
                {c.supervisionLoop?.gate === "stop"
                  ? "已停止"
                  : {
                      queued: "排队",
                      running: "运行中",
                      waiting: "等待你",
                      complete: "完成",
                      failed: "失败",
                    }[c.status]}{" "}
                · {c.title}
              </button>
              {c.status === "running" || c.status === "queued" ? (
                <button
                  type="button"
                  aria-label={`停止分支：${c.title}`}
                  onClick={() =>
                    window.piApp &&
                    void window.piApp
                      .setChildSupervisionLoop({ childThreadId: c.id, gate: "stop" })
                      .catch((e) => setError(String(e)))
                  }
                >
                  停止
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {open ? <ParallelTaskDialog target={target} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ParallelTaskDialog({
  target,
  onClose,
}: {
  readonly target: { workspaceId: string; sessionId: string };
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [prompts, setPrompts] = useState(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="lancer-dialog"
      aria-labelledby="parallel-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void (async () => {
            setBusy(true);
            setError("");
            const results = await Promise.allSettled(
              prompts.map(async (prompt, index) => {
                if (!prompt.trim()) return;
                const state = await window.piApp!.lancerAction({
                  kind: "launch-branch",
                  target,
                  prompt,
                });
                if (state.lastError) throw new Error(`任务 ${index + 1}：${state.lastError}`);
                setPrompts((values) => values.map((value, i) => (i === index ? "" : value)));
              }),
            );
            const failures = results.filter(
              (r): r is PromiseRejectedResult => r.status === "rejected",
            );
            setBusy(false);
            if (failures.length) setError(failures.map((r) => String(r.reason)).join("\n"));
            else onClose();
          })().catch((error) => {
            setBusy(false);
            setError(String(error));
          });
        }}
      >
        <header>
          <h2 id="parallel-title">开启并行分支</h2>
          <button type="button" disabled={busy} aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <p>每个任务独立运行，完成后回传当前会话。运行时可以继续交流。</p>
        {prompts.map((prompt, index) => (
          <label key={index}>
            任务 {index + 1}
            <textarea
              autoFocus={index === 0}
              disabled={busy}
              value={prompt}
              maxLength={32000}
              onChange={(e) =>
                setPrompts((values) =>
                  values.map((value, i) => (i === index ? e.target.value : value)),
                )
              }
            />
          </label>
        ))}
        <button type="button" disabled={busy} onClick={() => setPrompts((v) => [...v, ""])}>
          再加一个任务
        </button>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <span>共享工作目录，分别保存运行记录</span>
          <button type="submit" disabled={busy || !prompts.some((p) => p.trim())}>
            {busy ? "启动中…" : "并行开始"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
