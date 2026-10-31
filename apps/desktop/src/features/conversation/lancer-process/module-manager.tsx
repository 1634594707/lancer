import { useEffect, useRef, useState } from "react";
import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import type { LancerAction } from "../../../../contracts/lancer-assistants";
import { DEFAULT_LANCER_MODULES, type LancerModule } from "../../../../contracts/lancer-modules";
import { moduleStageTitles } from "../../../../contracts/lancer-workflows";
import { buildModelOptions } from "../composer-commands";
import { WorkflowEditor } from "./workflow-editor";
import "./module-manager.css";

const blankModule = (): LancerModule => ({
  id: `module-${crypto.randomUUID()}`,
  label: "",
  color: "#8B5CF6",
  description: "",
});
export function ModuleManager({
  modules = DEFAULT_LANCER_MODULES,
  initialId,
  onAction,
  onClose,
}: {
  readonly modules?: readonly LancerModule[];
  readonly initialId: string;
  readonly onAction: (action: LancerAction) => Promise<void>;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<LancerModule>(
    () => modules.find((m) => m.id === initialId) ?? blankModule(),
  );
  const [editingWorkflow, setEditingWorkflow] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeSnapshot>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const existing = modules.find((m) => m.id === draft.id);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    window.piApp
      ?.getState()
      .then((state) => {
        if (active) setRuntime(state.runtimeByWorkspace[state.selectedWorkspaceId]);
      })
      .catch((e: unknown) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const save = async (action: LancerAction) => {
    setBusy(true);
    setError("");
    try {
      await onAction(action);
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="lancer-dialog module-manager"
      aria-labelledby="module-manager-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ kind: "save-module", module: { ...draft, deleted: false } }).catch((e: unknown) =>
            setError(String(e)),
          );
        }}
      >
        <header>
          <h2 id="module-manager-title">管理模块</h2>
          <button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="module-manager__selection">
          <label>
            选择模块
            <select
              aria-label="选择模块"
              disabled={busy}
              value={existing ? draft.id : "new"}
              onChange={(e) => {
                setDraft(modules.find((m) => m.id === e.target.value) ?? blankModule());
                setConfirmDelete(false);
                setError("");
              }}
            >
              <option value="new">新增模块</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                  {m.deleted ? "（已删除）" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft(blankModule());
              setConfirmDelete(false);
              setError("");
            }}
          >
            新增模块
          </button>
        </div>
        <label>
          模块名称
          <input
            autoFocus
            required
            maxLength={40}
            value={draft.label}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        </label>
        <label>
          模块颜色
          <input
            type="color"
            value={draft.color}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </label>
        <label>
          模块说明
          <textarea
            aria-label="模块说明"
            maxLength={1000}
            value={draft.description}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <section className="module-manager__workflow">
          <b>默认流程</b>
          <p>
            {(draft.workflow?.steps.map((s) => s.title) ?? moduleStageTitles(draft.id)).join(" → ")}
          </p>
          <button type="button" disabled={busy} onClick={() => setEditingWorkflow(true)}>
            配置阶段、模型与 Skill
          </button>
          <p>设置每个阶段要解决的问题和交付物。新会话沿用此模板；已保存的会话流程独立保留。</p>
        </section>
        {error ? <p role="alert">{error}</p> : null}
        {confirmDelete ? (
          <div role="alert">
            <p>
              删除「{draft.label}
              」？历史会话会移入常态会话，内容和交付物保留。之后可以在这里恢复模块。
            </p>
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
              取消删除
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                save({ kind: "delete-module", id: draft.id }).catch((e: unknown) =>
                  setError(String(e)),
                );
              }}
            >
              确认删除模块
            </button>
          </div>
        ) : null}
        <footer>
          {existing && !existing.deleted ? (
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)}>
              删除模块
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy || !draft.label.trim()}>
            {existing?.deleted ? "恢复模块" : "保存模块"}
          </button>
        </footer>
      </form>
      {editingWorkflow ? (
        <WorkflowEditor
          plan={
            draft.workflow ?? { steps: moduleStageTitles(draft.id).map((title) => ({ title })) }
          }
          options={buildModelOptions(runtime)}
          skills={runtime?.skills ?? []}
          onClose={() => setEditingWorkflow(false)}
          onSave={(workflow) => {
            setDraft({ ...draft, workflow });
            setEditingWorkflow(false);
            return Promise.resolve();
          }}
        />
      ) : null}
    </dialog>
  );
}
