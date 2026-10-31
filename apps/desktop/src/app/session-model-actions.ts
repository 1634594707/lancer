import type { Dispatch, SetStateAction } from "react";
import type { SessionRef } from "@lancer/session-driver/types";
import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import type { PiDesktopApi } from "../../contracts/ipc";
import type { DesktopAppState } from "../../contracts/desktop-state";
import { updateSnapshot } from "./desktop-app-state";

export function sessionModelActions(
  api: PiDesktopApi,
  target: SessionRef | undefined,
  setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
  leaveApp: () => Promise<boolean>,
) {
  return {
    handleSetSessionModel: (provider: string, modelId: string) => {
      if (!target) return;
      void leaveApp()
        .then((left) =>
          left
            ? updateSnapshot(setSnapshot, () =>
                api.setSessionModel(target.workspaceId, target.sessionId, provider, modelId),
              )
            : undefined,
        )
        .catch((error: unknown) => console.error("[renderer] setSessionModel failed", error));
    },
    handleSetSessionThinking: (level: string) => {
      if (!target) return;
      void updateSnapshot(setSnapshot, () =>
        api.setSessionThinkingLevel(
          target.workspaceId,
          target.sessionId,
          level as NonNullable<RuntimeSnapshot["settings"]["defaultThinkingLevel"]>,
        ),
      ).catch((error: unknown) => console.error("[renderer] setSessionThinking failed", error));
    },
  };
}

/** Prevent a persisted App conversation from sending to Pi before its mode is loaded. */
export function guardComposerAction<T extends readonly unknown[]>(
  ready: boolean,
  action: (...args: T) => void,
) {
  return (...args: T) => {
    if (ready) action(...args);
  };
}
