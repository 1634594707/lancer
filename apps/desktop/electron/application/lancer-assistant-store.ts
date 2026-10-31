import { DEFAULT_LANCER_MODULES, decodeLancerModule } from "../../contracts/lancer-modules";
import { randomUUID } from "node:crypto";
import { decodeLancerWorkflow } from "../../contracts/lancer-workflows";
import { join } from "node:path";
import { readJsonWithBackup, writeFileAtomicQueued } from "../persistence/atomic-file-write";
import {
  DEFAULT_LANCER_ASSISTANTS,
  validateAssistantAvatar,
  type LancerAction,
  type LancerAssistant,
  type LancerAssistantsState,
} from "../../contracts/lancer-assistants";

function decode(value: unknown): LancerAssistantsState {
  const s = value as LancerAssistantsState;
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.profiles) ||
    !s.owners ||
    typeof s.owners !== "object"
  )
    throw new Error("Invalid saved assistants; original file retained");
  const ids = new Set<string>();
  for (const p of s.profiles as readonly LancerAssistant[]) {
    if (
      !p.id ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 40
    )
      throw new Error("Invalid saved assistant");
    validateAssistantAvatar(p.avatar);
    ids.add(p.id);
  }
  if (!ids.has(s.defaultId) || Object.values(s.owners).some((id) => !ids.has(id)))
    throw new Error("Invalid assistant ownership");
  if (s.workflows) {
    if (typeof s.workflows !== "object" || Array.isArray(s.workflows))
      throw new Error("Invalid workflows");
    for (const workflow of Object.values(s.workflows)) decodeLancerWorkflow(workflow);
  }
  if (s.modules !== undefined) {
    if (!Array.isArray(s.modules) || s.modules.length > 100) throw new Error("Invalid modules");
    const ids = new Set<string>();
    for (const module of s.modules) {
      const decoded = decodeLancerModule(module);
      if (ids.has(decoded.id)) throw new Error("Duplicate module");
      ids.add(decoded.id);
    }
  }
  return s;
}

/** Durable assistant identities, independent of a conversation's model. Serial writes
 * keep concurrent window actions from losing a profile or ownership transfer. */
export class LancerAssistantStore {
  private state: LancerAssistantsState = structuredClone(DEFAULT_LANCER_ASSISTANTS);
  private queue: Promise<void> = Promise.resolve();
  private readonly path: string;
  constructor(userDataDir: string) {
    this.path = join(userDataDir, "assistants.json");
  }
  async load(): Promise<LancerAssistantsState> {
    const result = await readJsonWithBackup(this.path);
    if (result.corrupted && !result.recovered)
      throw new Error("Saved assistants could not be read; original file retained");
    if (result.value !== undefined) this.state = decode(result.value);
    return this.snapshot();
  }
  snapshot(): LancerAssistantsState {
    return structuredClone(this.state);
  }
  async inheritWorkflow(
    target: { workspaceId: string; sessionId: string },
    moduleId?: string,
  ): Promise<LancerAssistantsState> {
    const workflow = (this.state.modules ?? DEFAULT_LANCER_MODULES).find(
      (m) => m.id === moduleId && !m.deleted,
    )?.workflow;
    if (workflow) return this.change({ kind: "save-workflow", target, workflow });
    return this.snapshot();
  }
  change(
    action: Extract<
      LancerAction,
      {
        kind:
          | "save-assistant"
          | "delete-assistant"
          | "assign"
          | "save-workflow"
          | "save-module"
          | "delete-module";
      }
    >,
  ): Promise<LancerAssistantsState> {
    const work = this.queue.then(async () => {
      const next = structuredClone(this.state);
      let profiles = [...next.profiles];
      const owners = { ...next.owners };
      let defaultId = next.defaultId;
      let modules = [...(next.modules ?? DEFAULT_LANCER_MODULES)];
      const workflows = { ...next.workflows };
      if (action.kind === "save-module") {
        const module = decodeLancerModule(action.module);
        if (modules.some((m) => !m.deleted && m.id !== module.id && m.label === module.label))
          throw new Error("已有同名模块。");
        modules = modules.some((m) => m.id === module.id)
          ? modules.map((m) => (m.id === module.id ? module : m))
          : [...modules, module];
      } else if (action.kind === "delete-module") {
        if (!modules.some((m) => m.id === action.id)) throw new Error("模块已不存在。");
        modules = modules.map((m) => (m.id === action.id ? { ...m, deleted: true } : m));
      } else if (action.kind === "save-workflow") {
        workflows[`${action.target.workspaceId}:${action.target.sessionId}`] = decodeLancerWorkflow(
          action.workflow,
        );
      } else if (action.kind === "save-assistant") {
        if (action.id && !profiles.some((p) => p.id === action.id))
          throw new Error("助手已不存在。");
        const profile = { id: action.id ?? randomUUID(), name: action.name, avatar: action.avatar };
        profiles = action.id
          ? profiles.map((p) => (p.id === profile.id ? profile : p))
          : [...profiles, profile];
      } else if (action.kind === "delete-assistant") {
        if (action.id === action.transferTo || !profiles.some((p) => p.id === action.transferTo))
          throw new Error("请选择接收会话的助手。");
        profiles = profiles.filter((p) => p.id !== action.id);
        for (const key of Object.keys(owners))
          if (owners[key] === action.id) owners[key] = action.transferTo;
        if (defaultId === action.id) defaultId = action.transferTo;
      } else {
        if (!profiles.some((p) => p.id === action.assistantId)) throw new Error("助手已不存在。");
        owners[`${action.target.workspaceId}:${action.target.sessionId}`] = action.assistantId;
      }
      const saved = decode({ version: 1, profiles, owners, defaultId, workflows, modules });
      await writeFileAtomicQueued(this.path, JSON.stringify(saved, null, 2) + "\n", decode);
      this.state = saved;
    });
    this.queue = work.catch(() => undefined);
    return work.then(() => this.snapshot());
  }
}
