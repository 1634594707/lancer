/**
 * Doubao (download) and Codex (watch) are two sessions in the same workspace.
 * No file copy and no chat prompt — the gate file is the handoff.
 */
import type { DesktopAppState, WorkspaceSessionTarget } from "../../contracts/desktop-state";
import { formatSessionTitleForZone, conversationZoneId } from "../../contracts/lancer-zones";
import type { VideoLearnSessionRef, VideoLearnSnapshot } from "../../contracts/video-learn";

export const VIDEO_LEARN_DOWNLOAD = {
  provider: "volcengine",
  modelId: "doubao",
  label: "豆包",
  title: "豆包 · 下载",
  role: "download",
} as const;

export const VIDEO_LEARN_WATCH = {
  provider: "openai",
  modelId: "gpt-5",
  label: "Codex",
  title: "Codex · 学习",
  role: "watch",
} as const;

export const VIDEO_LEARN_RELAY = [VIDEO_LEARN_DOWNLOAD, VIDEO_LEARN_WATCH] as const;

export interface VideoLearnSessionHost {
  snapshot(): DesktopAppState;
  createSession(input: {
    readonly workspaceId: string;
    readonly title?: string;
  }): Promise<DesktopAppState>;
  setSessionModel(
    target: WorkspaceSessionTarget,
    provider: string,
    modelId: string,
  ): Promise<DesktopAppState>;
  selectSession(target: WorkspaceSessionTarget): Promise<DesktopAppState>;
}

export async function ensureVideoLearnSessions(
  host: VideoLearnSessionHost,
  workspaceId: string,
  preferWatch: boolean,
): Promise<{
  readonly state: DesktopAppState;
  readonly sessions: readonly VideoLearnSessionRef[];
  readonly sessionError: string | null;
}> {
  const sessions: VideoLearnSessionRef[] = [];
  let sessionError: string | null = null;
  let state = host.snapshot();
  for (const actor of VIDEO_LEARN_RELAY) {
    const title = formatSessionTitleForZone("video", actor.title);
    const existing = findSession(state, workspaceId, title, actor.provider, actor.modelId);
    if (existing) {
      sessions.push({ workspaceId, sessionId: existing.id, role: actor.role });
      continue;
    }
    state = await host.createSession({ workspaceId, title });
    const created = findSession(state, workspaceId, title, actor.provider, actor.modelId);
    if (!created) {
      sessionError = state.lastError ?? "SESSION_CREATE_FAILED";
      continue;
    }
    const target = { workspaceId, sessionId: created.id };
    state = await host.setSessionModel(target, actor.provider, actor.modelId);
    if (!findSession(state, workspaceId, title, actor.provider, actor.modelId)) {
      sessionError = state.lastError ?? "SESSION_CREATE_FAILED";
    }
    sessions.push({ workspaceId, sessionId: created.id, role: actor.role });
  }
  const selected =
    (preferWatch ? sessions.find((session) => session.role === "watch") : undefined) ??
    sessions.find((session) => session.role === "download");
  if (selected) {
    state = await host.selectSession({
      workspaceId: selected.workspaceId,
      sessionId: selected.sessionId,
    });
  }
  return { state, sessions, sessionError };
}

function findSession(
  state: DesktopAppState,
  workspaceId: string,
  title: string,
  provider: string,
  modelId: string,
) {
  const workspace = state.workspaces.find((entry) => entry.id === workspaceId);
  const sessions = workspace?.sessions.filter((session) => !session.archivedAt) ?? [];
  return (
    sessions.find((session) => session.title === title) ??
    sessions.find(
      (session) =>
        conversationZoneId(session.title) === "video" &&
        session.config?.provider === provider &&
        session.config?.modelId === modelId,
    )
  );
}

export function withSessions(
  snapshot: VideoLearnSnapshot,
  sessions: readonly VideoLearnSessionRef[],
  sessionError: string | null,
): VideoLearnSnapshot {
  return { ...snapshot, sessions, sessionError };
}
