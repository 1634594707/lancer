import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  LANCER_SESSION_ZONES,
  type LancerSessionZone,
  formatSessionTitleForZone,
} from "../../../../contracts/lancer-zones";

export function ConversationEditor({
  zones = LANCER_SESSION_ZONES,
  title,
  zone,
  onSave,
  onClose,
  formRef,
}: {
  readonly zones?: readonly LancerSessionZone[];
  readonly title: string;
  readonly zone: string;
  readonly onSave: (title: string) => Promise<void>;
  readonly onClose: () => void;
  readonly formRef?: RefObject<HTMLFormElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(title),
    [group, setGroup] = useState(zones.some((item) => item.id === zone) ? zone : "chat"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    ref.current?.showModal();
    nameInput.current?.focus({ preventScroll: true });
    nameInput.current?.select();
  }, []);
  // Keep the modal outside the sidebar so keyboard rename remains focusable
  // while the sidebar is collapsed or its visibility is being restored.
  return createPortal(
    <dialog
      ref={ref}
      className="lancer-dialog"
      aria-labelledby="conversation-editor-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSave(formatSessionTitleForZone(group, name.trim()))
            .then(onClose)
            .catch((e) => {
              setError(String(e));
              setBusy(false);
            });
        }}
      >
        <header>
          <h2 id="conversation-editor-title">管理会话</h2>
          <button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <label>
          会话名称
          <input
            ref={nameInput}
            required
            maxLength={120}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          会话类型
          <select
            aria-label="会话类型"
            value={group}
            disabled={busy}
            onChange={(e) => setGroup(e.target.value)}
          >
            {zones.map((g) => (
              <option value={g.id} key={g.id}>
                {g.id === "chat" ? g.label : `模块 · ${g.label}`}
              </option>
            ))}
          </select>
        </label>
        <p>常态会话用于自由交流；模块会话带有独立的模型交接流程。</p>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy || !name.trim()}>
            保存会话
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}
