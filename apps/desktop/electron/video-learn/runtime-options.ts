import path from "node:path";
import { readJson } from "./io";
import type { VideoLearnOptions } from "./engine";
import type { SessionConfig, SessionRef } from "@lancer/session-driver";
import type { DesktopAppState } from "../../contracts/desktop-state";

/** Optional local tool locations; credentials remain in the existing agent configuration. */
export function videoLearnRuntimeOptions(
  userData: string,
  selection?: SessionConfig,
): VideoLearnOptions {
  const config = readJson(path.join(userData, "video-learn-tools.json"));
  const hasModelOverride = config?.providerId !== undefined || config?.modelId !== undefined;
  const modelValue = (key: string) => {
    const value = config?.[key];
    return typeof value === "string" ? value.trim() || undefined : undefined;
  };
  const location = (key: string) => {
    const value = config?.[key];
    return typeof value === "string" && path.isAbsolute(value) ? value : undefined;
  };
  return {
    agentDir: process.env.PI_CODING_AGENT_DIR,
    ffmpegPath: location("ffmpegPath"),
    ffprobePath: location("ffprobePath"),
    ytDlpPath: location("ytDlpPath"),
    providerId: hasModelOverride ? modelValue("providerId") : selection?.provider,
    modelId: hasModelOverride ? modelValue("modelId") : selection?.modelId,
    handoffModelId: modelValue("handoffModelId"),
  };
}

export function videoLearnSessionOptions(
  userData: string,
  state: DesktopAppState,
  target: SessionRef,
): VideoLearnOptions {
  const selection = state.workspaces
    .find((workspace) => workspace.id === target.workspaceId)
    ?.sessions.find((session) => session.id === target.sessionId)?.config;
  return videoLearnRuntimeOptions(userData, selection);
}
