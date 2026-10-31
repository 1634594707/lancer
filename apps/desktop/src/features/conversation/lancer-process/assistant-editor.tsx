import { useEffect, useRef, useState } from "react";
import type {
  LancerAction,
  LancerAssistant,
  LancerAssistantsState,
} from "../../../../contracts/lancer-assistants";
import { assistantPortrait } from "./assistant-avatar";

export function AssistantEditor({
  state,
  mode = "edit",
  profile,
  onAction,
  onClose,
}: {
  readonly state: LancerAssistantsState;
  readonly mode?: "edit" | "rename" | "delete";
  readonly profile?: LancerAssistant;
  readonly onAction: (action: LancerAction) => Promise<void>;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(profile?.name ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? "a0");
  const [transfer, setTransfer] = useState(
    state.profiles.find((p) => p.id !== profile?.id)?.id ?? "",
  );
  const [deleting, setDeleting] = useState(mode === "delete");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const save = async (action: LancerAction) => {
    setBusy(true);
    setError("");
    try {
      await onAction(action);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="lancer-dialog"
      aria-labelledby="assistant-editor-title"
      onCancel={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save({ kind: "save-assistant", id: profile?.id, name: name.trim(), avatar }).catch(
            (e) => setError(String(e)),
          );
        }}
      >
        <header>
          <h2 id="assistant-editor-title">
            {mode === "rename"
              ? "重命名 AI 助手"
              : mode === "delete"
                ? "删除 AI 助手"
                : profile
                  ? "编辑 AI 助手"
                  : "添加 AI 助手"}
          </h2>
          <button type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        {mode !== "delete" ? (
          <label>
            名称
            <input
              autoFocus
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        ) : null}
        {mode === "edit" ? (
          <fieldset>
            <legend>头像</legend>
            <div className="assistant-portraits">
              {["a0", "a1", "a2"].map((key) => (
                <button
                  type="button"
                  key={key}
                  aria-label={`头像 ${key.slice(1)}`}
                  aria-pressed={avatar === key}
                  onClick={() => setAvatar(key)}
                >
                  <img src={assistantPortrait(key)} alt="" />
                </button>
              ))}
              <img
                className="assistant-custom-preview"
                src={assistantPortrait(avatar)}
                alt="当前头像"
              />
            </div>
            <label className="assistant-upload">
              选择自己的图片
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500_000) {
                    setError("图片需小于 500 KB。");
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    setAvatar(String(reader.result));
                    setError("");
                  };
                  reader.onerror = () => setError("图片读取失败，请重新选择。");
                  reader.readAsDataURL(file);
                }}
              />
            </label>
          </fieldset>
        ) : null}
        {deleting ? (
          <div className="assistant-delete">
            <p>会话、运行中的分支与 GitTree 将完整转交给：</p>
            <select
              aria-label="接收会话的助手"
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
            >
              {state.profiles
                .filter((p) => p.id !== profile?.id)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={busy || !transfer}
              onClick={() =>
                void save({
                  kind: "delete-assistant",
                  id: profile!.id,
                  transferTo: transfer,
                }).catch((e) => setError(String(e)))
              }
            >
              转交并删除助手
            </button>
          </div>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          {mode === "edit" && profile && state.profiles.length > 1 ? (
            <button type="button" disabled={busy} onClick={() => setDeleting((v) => !v)}>
              删除助手
            </button>
          ) : (
            <span />
          )}
          {mode !== "delete" ? (
            <button type="submit" disabled={busy || !name.trim()}>
              {busy ? "保存中…" : "保存"}
            </button>
          ) : null}
        </footer>
      </form>
    </dialog>
  );
}
