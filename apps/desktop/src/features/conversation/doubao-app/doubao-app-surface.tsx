import { RunningBorder } from "../lancer-process/running-border";
import { CodeAnimationSurface } from "./code-animation-surface";
import { DoubaoVideoProcess } from "./doubao-video-process";
import { useEffect, useRef, useState } from "react";
import { ShellAssistantAvatar } from "../lancer-process/assistant-avatar";
import { DoubaoMessageBody } from "./doubao-message-body";
import { ChevronRightIcon, FileIcon } from "../../../ui/icons";
import type { DoubaoAppController } from "./use-doubao-app";
import "./doubao-app.css";

// Presentation only: keep the original messages intact and available in the disclosure.
function isExecutionRecord(text: string) {
  return /\b(?:MULTILINE_VIDEO_[A-Z]+_OK|FRESH_DOWNLOAD_OK|LONG_STATUS_DONE_\d+_[A-Z]+)\b/.test(
    text,
  );
}

export function DoubaoAppTranscript({
  bridge,
  assistant,
}: {
  readonly bridge: DoubaoAppController;
  readonly assistant?: { id: string; name: string; avatar: string };
}) {
  const { state } = bridge;
  const messages = state?.messages ?? [];
  const records = messages.filter(
    (message) => message.role === "assistant" && isExecutionRecord(message.text),
  );
  const conversation = messages.filter(
    (message) => message.role !== "assistant" || !isExecutionRecord(message.text),
  );
  const bottom = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    if (following.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, messages.at(-1)?.text, state?.busy]);
  return (
    <section
      className="doubao-app-transcript"
      data-testid="doubao-app-transcript"
      onScroll={(event) => {
        const el = event.currentTarget;
        following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <header className="doubao-app-binding">
        <span className="doubao-app-provider">豆包</span>
        <strong>当前会话</strong>
        <details className="doubao-app-connection">
          <summary>会话连接</summary>
          <p>{state?.binding?.title || "关联豆包当前会话"}</p>
          {state?.binding ? <small>固定会话 {state.binding.conversationId}</small> : null}
          <div className="doubao-app-actions">
            <button
              type="button"
              onClick={bridge.select}
              disabled={bridge.pending || !state?.binding}
            >
              打开绑定会话
            </button>
            <button
              type="button"
              onClick={bridge.refresh}
              disabled={bridge.pending || !state?.binding}
            >
              刷新回复
            </button>
          </div>
          {records.length ? (
            <details className="doubao-app-records">
              <summary>
                执行记录 <span>{records.length} 条</span>
              </summary>
              {records.map((message, index) => (
                <article className="doubao-app-message" key={index}>
                  <strong>{message.role === "user" ? "你" : "豆包"}</strong>
                  <p>{message.text}</p>
                </article>
              ))}
            </details>
          ) : null}
          {bridge.animation?.scene ? (
            <details className="doubao-app-source">
              <summary>查看代码</summary>
              <p>{bridge.animation.summary}</p>
              <pre>{bridge.animation.sourceCode}</pre>
            </details>
          ) : null}
          {state?.archivedMessages?.length ? (
            <details className="doubao-app-records doubao-app-archive">
              <summary>
                旧同步记录 <span>{state.archivedMessages.length} 条</span>
              </summary>
              <p>旧版记录完整保留，可能有重复或顺序偏差。下方对话已按豆包当前记录重新同步。</p>
              {state.archivedMessages.map((message, index) => (
                <article className="doubao-app-message" key={index}>
                  <strong>{message.role === "user" ? "你" : "豆包"}</strong>
                  <p>{message.text}</p>
                </article>
              ))}
            </details>
          ) : null}
        </details>
        {!state?.binding ? (
          <button type="button" onClick={bridge.bind} disabled={bridge.pending}>
            关联当前豆包会话
          </button>
        ) : null}
      </header>
      <div className="doubao-app-body cc">
        {bridge.error ? (
          <div className="doubao-app-error" role="alert">
            <p>
              {state?.errorCode ? `${state.errorCode} · ` : ""}
              {bridge.error}
            </p>
            {state?.errorCode?.includes("ACCESSIBILITY") || state?.errorCode === "E_PERMISSION" ? (
              <button type="button" onClick={bridge.openAccessibility}>
                打开辅助功能设置
              </button>
            ) : null}
          </div>
        ) : null}
        {!messages.length && !state?.videos.length ? (
          <p className="doubao-app-empty">发送消息或粘贴视频链接，开始与豆包协作。</p>
        ) : null}
        {conversation.map((message, index) => (
          <article
            className={`doubao-app-message doubao-app-message--${message.role} ${message.role === "user" ? "um process-user" : "am process-assistant"}`}
            key={index}
          >
            {message.role === "assistant" ? (
              <div className="who">
                <ShellAssistantAvatar
                  identity={assistant?.id ?? "lancer"}
                  avatar={assistant?.avatar}
                />
                <b>{assistant?.name ?? "Lancer"}</b>
                <span className="doubao-message-model">豆包</span>
              </div>
            ) : null}
            <div className="tx">
              <DoubaoMessageBody text={message.text} role={message.role} />
            </div>
          </article>
        ))}
        {state?.videos.length ? (
          <section className="doubao-app-videos" aria-label="收到的视频">
            {state.videos.map((video) => (
              <div className="doubao-app-artifact" key={video.id}>
                <details>
                  <summary>
                    <ChevronRightIcon />
                    <FileIcon />
                    <span className="doubao-app-artifact-name" title={video.name}>
                      交付物 · {video.name}
                    </span>
                    <span className="doubao-app-artifact-meta">
                      {(video.bytes / 1_000_000).toFixed(2)} MB ·{" "}
                      {(video.durationMs / 1000).toFixed(1)} 秒
                    </span>
                  </summary>
                  <div className="doubao-app-actions">
                    <button
                      type="button"
                      disabled={bridge.learningPending || bridge.learning?.busy}
                      onClick={() => {
                        void bridge.learnVideo(video.id).catch(() => undefined);
                      }}
                    >
                      学片并交接
                    </button>
                  </div>
                  <p>{video.path}</p>
                  <code>SHA256 {video.sha256}</code>
                </details>
                <button
                  type="button"
                  aria-label={`打开 ${video.name}`}
                  onClick={() => bridge.openVideo(video.id)}
                >
                  打开
                </button>
              </div>
            ))}
          </section>
        ) : null}
        {bridge.sourceLearning ? (
          <DoubaoVideoProcess snapshot={bridge.sourceLearning} frames={bridge.animation?.frames} />
        ) : null}
        {bridge.animation ? (
          <details className="doubao-app-animation">
            <summary>
              视频复刻
              <span>
                {bridge.animation.status === "running"
                  ? "处理中…"
                  : bridge.animation.exportPath
                    ? "MP4 已导出"
                    : "选择片段与编辑动画"}
              </span>
            </summary>
            <CodeAnimationSurface bridge={bridge} />
          </details>
        ) : null}
        {state?.busy ? (
          <div role="status" className="process-stage__head doubao-app-pending" data-running="true">
            <RunningBorder />
            <span className="pending-glyph" aria-hidden="true" />
            <span>豆包正在处理…</span>
            <span className="doubao-app-pending-meta">回复会自动更新</span>
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
    </section>
  );
}

export function DoubaoAppComposer({ bridge }: { readonly bridge: DoubaoAppController }) {
  const [download, setDownload] = useState(false);
  const disabled = bridge.pending || bridge.state?.busy || !bridge.state?.binding;
  return (
    <footer className="composer doubao-app-composer">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void bridge.send(download).catch(() => undefined);
        }}
      >
        <label className="sr-only" htmlFor="doubao-app-input">
          发给豆包 App 的消息
        </label>
        <textarea
          id="doubao-app-input"
          data-testid="doubao-app-composer"
          value={bridge.draft}
          placeholder="发消息给固定的豆包会话，或粘贴视频链接…"
          onChange={(event) => bridge.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!disabled && bridge.draft.trim()) event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div className="doubao-app-actions">
          <button
            type="button"
            className="model-selector__badge"
            onClick={() => {
              void bridge.leave().catch(() => undefined);
            }}
            disabled={bridge.pending}
          >
            豆包 App · 切回模型
          </button>
          <label>
            <input
              type="checkbox"
              checked={download}
              onChange={(event) => setDownload(event.target.checked)}
              disabled={disabled}
            />
            下载视频到当前项目并自动学片
          </label>
          <button
            type="submit"
            className="doubao-send"
            aria-label={bridge.state?.busy ? "执行中" : "发送"}
            data-testid="doubao-app-send"
            disabled={disabled || !bridge.draft.trim()}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5m-6 6 6-6 6 6" />
            </svg>
          </button>
        </div>
      </form>
    </footer>
  );
}
