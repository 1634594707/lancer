import { useEffect, useRef, useState } from "react";
import type { RuntimeSkillRecord } from "@lancer/session-driver/runtime-types";
import type { LancerWorkflow } from "../../../../contracts/lancer-workflows";
import { buildModelOptions } from "../composer-commands";

export function WorkflowEditor({
  plan,
  options,
  skills,
  onClose,
  onSave,
}: {
  readonly plan: LancerWorkflow;
  readonly options: ReturnType<typeof buildModelOptions>;
  readonly skills: readonly RuntimeSkillRecord[];
  readonly onClose: () => void;
  readonly onSave: (plan: LancerWorkflow) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [steps, setSteps] = useState([...plan.steps]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="lancer-dialog workflow-editor"
      aria-labelledby="workflow-editor-title"
      onCancel={(e) => {
        e.stopPropagation();
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void onSave({ steps }).catch((e) => {
            setError(String(e));
            setBusy(false);
          });
        }}
      >
        <header>
          <h2 id="workflow-editor-title">配置模块流程</h2>
          <button type="button" disabled={busy} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <p>为每个阶段选择模型、技能、目标和交付要求。保存后可将阶段任务载入输入框，检查后发送。</p>
        {steps.map((step, index) => (
          <fieldset className="workflow-editor__stage" key={index}>
            <legend>阶段 {index + 1}</legend>
            <div className="workflow-editor__row">
              <label>
                阶段名称
                <input
                  aria-label={`阶段 ${index + 1} 名称`}
                  required
                  maxLength={40}
                  value={step.title}
                  disabled={busy}
                  onChange={(e) =>
                    setSteps((v) =>
                      v.map((s, i) => (i === index ? { ...s, title: e.target.value } : s)),
                    )
                  }
                />
              </label>
              <label>
                负责模型
                <select
                  aria-label={`阶段 ${index + 1} 模型`}
                  value={step.model ? `${step.model.provider}/${step.model.modelId}` : ""}
                  disabled={busy}
                  onChange={(e) => {
                    const option = options.find(
                      (o) => `${o.providerId}/${o.modelId}` === e.target.value,
                    );
                    setSteps((v) =>
                      v.map((s, i) =>
                        i === index
                          ? {
                              ...s,
                              model: option
                                ? { provider: option.providerId, modelId: option.modelId }
                                : undefined,
                            }
                          : s,
                      ),
                    );
                  }}
                >
                  <option value="">待配置</option>
                  {step.model &&
                  !options.some(
                    (o) =>
                      o.providerId === step.model?.provider && o.modelId === step.model.modelId,
                  ) ? (
                    <option value={`${step.model.provider}/${step.model.modelId}`}>
                      {step.model.modelId}（当前不可用）
                    </option>
                  ) : null}
                  {options.map((o) => (
                    <option
                      key={`${o.providerId}/${o.modelId}`}
                      value={`${o.providerId}/${o.modelId}`}
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`删除阶段 ${index + 1}`}
                disabled={busy || steps.length === 1}
                onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}
              >
                移除
              </button>
            </div>
            <div className="workflow-editor__brief">
              <label>
                要解决的问题
                <textarea
                  aria-label={`阶段 ${index + 1} 目标`}
                  maxLength={4000}
                  rows={2}
                  value={step.goal ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setSteps((v) =>
                      v.map((s, i) => (i === index ? { ...s, goal: e.target.value } : s)),
                    )
                  }
                />
              </label>
              <label>
                交付物与验收要求
                <textarea
                  aria-label={`阶段 ${index + 1} 交付物`}
                  maxLength={4000}
                  rows={2}
                  value={step.deliverables ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setSteps((v) =>
                      v.map((s, i) => (i === index ? { ...s, deliverables: e.target.value } : s)),
                    )
                  }
                />
              </label>
            </div>
            <details className="workflow-editor__skills">
              <summary>
                搭配技能 · {step.skills?.length ? step.skills.join("、") : "未选择"}
              </summary>
              <div role="group" aria-label={`阶段 ${index + 1} 技能`}>
                {skills.length === 0 ? <p>当前工作区没有可用技能，可先在设置中添加。</p> : null}
                {[
                  ...skills,
                  ...(step.skills ?? [])
                    .filter((name) => !skills.some((s) => s.name === name))
                    .map((name) => ({ name, enabled: false, description: "当前不可用" })),
                ].map((skill) => (
                  <label key={skill.name} title={skill.description}>
                    <input
                      type="checkbox"
                      checked={step.skills?.includes(skill.name) ?? false}
                      disabled={busy || (!skill.enabled && !step.skills?.includes(skill.name))}
                      onChange={(e) =>
                        setSteps((v) =>
                          v.map((s, i) =>
                            i !== index
                              ? s
                              : {
                                  ...s,
                                  skills: e.target.checked
                                    ? [...(s.skills ?? []), skill.name]
                                    : s.skills?.filter((n) => n !== skill.name),
                                },
                          ),
                        )
                      }
                    />
                    {skill.name}
                    {!skill.enabled ? "（不可用）" : ""}
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={busy || steps.length === 8}
          onClick={() => setSteps((s) => [...s, { title: "新阶段" }])}
        >
          添加阶段
        </button>
        {error ? <p role="alert">{error}</p> : null}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" disabled={busy}>
            {busy ? "保存中…" : "保存流程"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
