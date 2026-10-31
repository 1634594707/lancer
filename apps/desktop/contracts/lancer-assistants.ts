import { decodeLancerModule, type LancerModule } from "./lancer-modules";
import type { SessionRef } from "@lancer/session-driver";
import { decodeLancerWorkflow, type LancerWorkflow } from "./lancer-workflows";

export interface LancerAssistant {
  readonly id: string;
  readonly name: string;
  /** A bundled portrait key or a locally chosen raster image. Never a remote URL. */
  readonly avatar: string;
}

export interface LancerAssistantsState {
  readonly version: 1;
  readonly modules?: readonly LancerModule[];
  readonly profiles: readonly LancerAssistant[];
  readonly owners: Readonly<Record<string, string>>;
  readonly defaultId: string;
  readonly workflows?: Readonly<Record<string, LancerWorkflow>>;
}

export type LancerAction =
  | { readonly kind: "save-module"; readonly module: LancerModule }
  | { readonly kind: "delete-module"; readonly id: string }
  | {
      readonly kind: "save-workflow";
      readonly target: SessionRef;
      readonly workflow: LancerWorkflow;
    }
  | {
      readonly kind: "handoff-workflow";
      readonly target: SessionRef;
      readonly step: number;
    }
  | { readonly kind: "prepare-workflow"; readonly target: SessionRef; readonly step: number }
  | {
      readonly kind: "save-assistant";
      readonly id?: string;
      readonly name: string;
      readonly avatar: string;
    }
  | { readonly kind: "delete-assistant"; readonly id: string; readonly transferTo: string }
  | { readonly kind: "assign"; readonly target: SessionRef; readonly assistantId: string }
  | {
      readonly kind: "create-conversation";
      readonly workspaceId: string;
      readonly assistantId: string;
      readonly zone: string;
    }
  | { readonly kind: "launch-branch"; readonly target: SessionRef; readonly prompt: string };

export const DEFAULT_LANCER_ASSISTANTS: LancerAssistantsState = {
  version: 1,
  profiles: [
    { id: "lancer", name: "Lancer", avatar: "a0" },
    { id: "research", name: "研究助手", avatar: "a1" },
    { id: "creative", name: "创作助手", avatar: "a2" },
  ],
  owners: {},
  defaultId: "lancer",
};

export function assistantOwner(state: LancerAssistantsState, target: SessionRef): string {
  return state.owners[`${target.workspaceId}:${target.sessionId}`] ?? state.defaultId;
}

export function validateAssistantAvatar(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 700_000 ||
    !/^(?:a[0-2]|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(value)
  ) {
    throw new Error("请选择预设头像或小于 500 KB 的 PNG、JPEG、WebP 图片。");
  }
  return value;
}

export function decodeLancerAction(value: unknown): LancerAction {
  if (!value || typeof value !== "object") throw new Error("Invalid assistant action");
  const v = value as Record<string, unknown>;
  const str = (key: string, max = 512) => {
    const s = v[key];
    if (typeof s !== "string" || !s.trim() || s.length > max) throw new Error(`Invalid ${key}`);
    return s.trim();
  };
  const target = () => {
    const t = v.target as SessionRef | undefined;
    if (
      !t ||
      typeof t.workspaceId !== "string" ||
      !t.workspaceId ||
      typeof t.sessionId !== "string" ||
      !t.sessionId ||
      t.workspaceId.length > 512 ||
      t.sessionId.length > 512
    )
      throw new Error("Invalid conversation target");
    return { workspaceId: t.workspaceId, sessionId: t.sessionId };
  };
  switch (v.kind) {
    case "save-module":
      return { kind: v.kind, module: decodeLancerModule(v.module) };
    case "delete-module":
      return { kind: v.kind, id: str("id", 60) };
    case "save-workflow":
      return { kind: v.kind, target: target(), workflow: decodeLancerWorkflow(v.workflow) };
    case "handoff-workflow":
    case "prepare-workflow":
      if (!Number.isInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 7)
        throw new Error("Invalid stage");
      return { kind: v.kind, target: target(), step: Number(v.step) };
    case "save-assistant":
      return {
        kind: v.kind,
        id: v.id === undefined ? undefined : str("id"),
        name: str("name", 40),
        avatar: validateAssistantAvatar(v.avatar),
      };
    case "delete-assistant":
      return { kind: v.kind, id: str("id"), transferTo: str("transferTo") };
    case "assign":
      return { kind: v.kind, target: target(), assistantId: str("assistantId") };
    case "create-conversation":
      return {
        kind: v.kind,
        workspaceId: str("workspaceId"),
        assistantId: str("assistantId"),
        zone: str("zone", 40),
      };
    case "launch-branch":
      return { kind: v.kind, target: target(), prompt: str("prompt", 32_000) };
    default:
      throw new Error("Unknown assistant action");
  }
}

export function conversationRoot(
  target: SessionRef,
  children: readonly import("./desktop-state").OrchestrationChildThread[] = [],
): SessionRef {
  let current = { workspaceId: target.workspaceId, sessionId: target.sessionId };
  const seen = new Set<string>();
  while (!seen.has(`${current.workspaceId}:${current.sessionId}`)) {
    seen.add(`${current.workspaceId}:${current.sessionId}`);
    const parent = children.find(
      (c) => c.childWorkspaceId === current.workspaceId && c.childSessionId === current.sessionId,
    );
    if (!parent) break;
    current = { workspaceId: parent.parentWorkspaceId, sessionId: parent.parentSessionId };
  }
  return current;
}
