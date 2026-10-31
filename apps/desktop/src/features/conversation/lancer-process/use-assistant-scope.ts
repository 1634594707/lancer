import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  assistantOwner,
  conversationRoot,
  DEFAULT_LANCER_ASSISTANTS,
} from "../../../../contracts/lancer-assistants";
import type { DesktopAppState } from "../../../../contracts/desktop-state";
import type { ThreadListEntry } from "../../threads/thread-groups";
import { comparePinnedThreads } from "../../threads/thread-groups";
import type { SessionRef } from "@lancer/session-driver";

export function useAssistantScope(
  snapshot: DesktopAppState | null,
  allThreads: readonly ThreadListEntry[] | undefined,
  workbenchTarget: SessionRef | null,
  selectThread: (target: SessionRef) => void,
  setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>,
) {
  const assistants = snapshot?.assistants ?? DEFAULT_LANCER_ASSISTANTS;
  const rootConversation = workbenchTarget
    ? conversationRoot(workbenchTarget, snapshot?.orchestrationChildren)
    : null;
  const [chosenAssistant, setChosenAssistant] = useState<string | null>(null);
  const assistantId = assistants.profiles.some((p) => p.id === chosenAssistant)
    ? chosenAssistant!
    : rootConversation
      ? assistantOwner(assistants, rootConversation)
      : assistants.defaultId;
  useEffect(() => {
    if (rootConversation) setChosenAssistant(assistantOwner(assistants, rootConversation));
  }, [rootConversation?.workspaceId, rootConversation?.sessionId, assistants]);
  const assistantThreads = useMemo(
    () =>
      (allThreads ?? [])
        .filter(
          (entry) =>
            assistantOwner(
              assistants,
              conversationRoot(
                { workspaceId: entry.workspaceId, sessionId: entry.session.id },
                snapshot?.orchestrationChildren,
              ),
            ) === assistantId,
        )
        .sort(
          (left, right) =>
            Number(Boolean(right.session.pinnedAt)) - Number(Boolean(left.session.pinnedAt)) ||
            (left.session.pinnedAt && right.session.pinnedAt
              ? comparePinnedThreads(left, right, snapshot?.pinnedSessionOrder)
              : 0),
        ),
    [
      allThreads,
      assistants,
      assistantId,
      snapshot?.orchestrationChildren,
      snapshot?.pinnedSessionOrder,
    ],
  );
  const selectAssistant = (id: string) => {
    setChosenAssistant(id);
    const owned = (allThreads ?? []).find(
      (entry) =>
        assistantOwner(
          assistants,
          conversationRoot(
            { workspaceId: entry.workspaceId, sessionId: entry.session.id },
            snapshot?.orchestrationChildren,
          ),
        ) === id,
    );
    if (owned) selectThread({ workspaceId: owned.workspaceId, sessionId: owned.session.id });
    else if (snapshot?.selectedWorkspaceId && window.piApp)
      void window.piApp
        .lancerAction({
          kind: "create-conversation",
          workspaceId: snapshot.selectedWorkspaceId,
          assistantId: id,
          zone: "chat",
        })
        .then(setSnapshot)
        .catch((e) => console.error("Create assistant conversation failed", e));
  };
  const archivedSessions = (snapshot?.workspaces ?? []).flatMap((workspace) =>
    workspace.sessions
      .filter(
        (session) =>
          session.archivedAt &&
          assistantOwner(
            assistants,
            conversationRoot(
              { workspaceId: workspace.id, sessionId: session.id },
              snapshot?.orchestrationChildren,
            ),
          ) === assistantId,
      )
      .map((session) => ({
        id: `${workspace.id}:${session.id}`,
        sessionId: session.id,
        workspaceId: workspace.id,
        title: session.title,
      })),
  );
  return { assistants, assistantId, threads: assistantThreads, archivedSessions, selectAssistant };
}
