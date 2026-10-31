import { DEFAULT_LANCER_MODULES } from "../../../../contracts/lancer-modules";
import { useState } from "react";
import { WorkflowEditor } from "./workflow-editor";
import { conversationZoneId, lancerZoneById } from "../../../../contracts/lancer-zones";
import { moduleStageTitles, type LancerWorkflow } from "../../../../contracts/lancer-workflows";
import { buildModelOptions } from "../composer-commands";
import { ModelBrandIcon } from "../../../ui/model-brand-icon";
import { SettingsIcon } from "../../../ui/icons";
import type { LiveProcessInput } from "./live-model";
import "./workflow-styles.css";

export function ModuleWorkflow({ input }: { readonly input: LiveProcessInput }) {
  const session = input.threads.find((t) => t.session.id === input.selectedSessionId)?.session;
  const zone = conversationZoneId(session?.title ?? "", input.assistants?.modules);
  if (zone === "chat" || !session || !input.workspaceId) return null;
  return (
    <Workflow
      key={`${input.workspaceId}:${session.id}`}
      input={input}
      zone={zone}
      running={session.status === "running"}
    />
  );
}
function Workflow({
  input,
  zone,
  running,
}: {
  readonly input: LiveProcessInput;
  readonly zone: string;
  readonly running: boolean;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const target = { workspaceId: input.workspaceId!, sessionId: input.selectedSessionId };
  const options = buildModelOptions(input.runtime);
  const saved = input.assistants?.workflows?.[`${target.workspaceId}:${target.sessionId}`];
  const module = (input.assistants?.modules ?? DEFAULT_LANCER_MODULES).find((m) => m.id === zone);
  const plan: LancerWorkflow = saved ??
    module?.workflow ?? {
      steps: moduleStageTitles(zone).map((title, i) => {
        const preferred = [/grok|gemini|sol/i, /sol|sonnet/i, /astra|opus/i, /terra|codex|gpt/i][i];
        const option =
          options.find((o) => preferred?.test(o.modelId)) ??
          options.find((o) => o.providerId === input.provider && o.modelId === input.modelId) ??
          options[0];
        return {
          title,
          model: option ? { provider: option.providerId, modelId: option.modelId } : undefined,
        };
      }),
    };
  const apply = async (action: Parameters<NonNullable<typeof window.piApp>["lancerAction"]>[0]) => {
    const state = await window.piApp!.lancerAction(action);
    if (state.lastError) throw new Error(state.lastError);
  };
  const handoff = async (step: number, prepare = false) => {
    setBusy(true);
    setError("");
    try {
      if (!saved) await apply({ kind: "save-workflow", target, workflow: plan });
      await apply({ kind: prepare ? "prepare-workflow" : "handoff-workflow", target, step });
    } catch (error) {
      setError(String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="module-workflow" data-testid="module-workflow">
      <span className="module-workflow__module" title={input.title}>
        {module?.label ?? lancerZoneById(zone).label}
      </span>
      <div className="module-workflow__steps" aria-label="模型交接流程">
        {plan.steps.map((step, i) => {
          const active =
            plan.activeStep === i &&
            step.model?.provider === input.provider &&
            step.model?.modelId === input.modelId;
          const ready = options.some(
            (o) => o.providerId === step.model?.provider && o.modelId === step.model.modelId,
          );
          return (
            <span key={i} className="module-workflow__step">
              {i ? (
                <span className="module-workflow__arrow" aria-hidden="true">
                  →
                </span>
              ) : null}
              <button
                type="button"
                aria-label={`交接阶段 ${i + 1}：${step.title}`}
                aria-pressed={active}
                disabled={running || busy}
                title={`${step.title} · ${step.model?.modelId ?? "未配置模型"}${ready ? " · 点击交接，保留会话上下文" : " · 点击配置"}`}
                onClick={() => (ready ? void handoff(i) : setEditing(true))}
              >
                <ModelBrandIcon provider={step.model?.provider} modelId={step.model?.modelId} />
                <span>
                  {step.title}
                  <small>
                    {active ? "当前 · " : ""}
                    {step.model?.modelId ?? "选择模型"}
                  </small>
                </span>
              </button>
            </span>
          );
        })}
      </div>
      <button
        type="button"
        className="module-workflow__prepare"
        disabled={running || busy || plan.activeStep === undefined}
        title="将模型、技能、目标和交付要求载入输入框，检查后发送"
        onClick={() => {
          handoff(plan.activeStep!, true).catch((error: unknown) => setError(String(error)));
        }}
      >
        载入任务
      </button>
      <button
        type="button"
        className="module-workflow__settings"
        aria-label="设置模型交接流程"
        disabled={running || busy}
        onClick={() => setEditing(true)}
      >
        <SettingsIcon />
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {editing ? (
        <WorkflowEditor
          plan={plan}
          options={options}
          skills={input.runtime?.skills ?? []}
          onClose={() => setEditing(false)}
          onSave={async (workflow) => {
            await apply({ kind: "save-workflow", target, workflow });
            setEditing(false);
          }}
        />
      ) : null}
    </div>
  );
}
