import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionTreeSnapshot } from "@lancer/session-driver/types";
import type { DisplayTimelineItem } from "../../../../contracts/timeline-types";
import type { OrchestrationChildThread } from "../../../../contracts/desktop-state";
import { LANCER_PROTOTYPE_UI } from "../../../../contracts/lancer-ui";
import { restoreSessionTree } from "../../../../contracts/session-tree-transport";
import { buildHandoffEdges } from "./build-handoff-edges";
import {
  buildDefaultLanes,
  buildTrajectoryFromSessionTree,
  type TrajectoryLane,
  type TrajectoryMetaChip,
  type TrajectoryNode,
} from "./trajectory-model";

export function useSessionTrajectory(input: {
  readonly workspaceId?: string;
  readonly sessionId?: string;
  readonly sessionTitle?: string;
  readonly orchestrationChildren?: readonly OrchestrationChildThread[];
  readonly siblingSessionLanes?: readonly {
    readonly sessionId: string;
    readonly title: string;
    readonly workspaceId?: string;
  }[];
  readonly displayRows?: readonly DisplayTimelineItem[];
}): {
  readonly lanes: readonly TrajectoryLane[];
  readonly nodes: readonly TrajectoryNode[];
  readonly laneNodes: ReadonlyMap<string, readonly TrajectoryNode[]>;
  readonly handoffs: ReturnType<typeof buildHandoffEdges>;
  readonly metaChips: readonly TrajectoryMetaChip[];
  readonly loading: boolean;
  readonly error?: string;
  readonly errorsBySessionId: Readonly<Record<string, string>>;
  readonly reload: () => void;
  readonly multiLane: boolean;
} {
  const [treesBySessionId, setTreesBySessionId] = useState<
    Readonly<Record<string, SessionTreeSnapshot>>
  >({});
  const [loading, setLoading] = useState(false);
  const [errorsBySessionId, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [request, setRequest] = useState<{
    revision: number;
    sessionId: string;
    targetsKey: string;
    changedKeys?: readonly string[];
  }>({ revision: 0, sessionId: "", targetsKey: "" });

  const childSessions = useMemo(() => {
    if (!input.sessionId) return [];
    return (input.orchestrationChildren ?? [])
      .filter(
        (child) =>
          child.parentSessionId === input.sessionId &&
          child.parentWorkspaceId === input.workspaceId,
      )
      .map((child) => ({ sessionId: child.childSessionId, title: child.title }));
  }, [input.orchestrationChildren, input.sessionId, input.workspaceId]);

  const lanes = useMemo(
    () =>
      input.workspaceId && input.sessionId
        ? buildDefaultLanes({
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            sessionTitle: input.sessionTitle ?? "",
            childSessionIds: childSessions,
            siblingSessionIds: input.siblingSessionLanes,
          })
        : [],
    [
      childSessions,
      input.sessionId,
      input.sessionTitle,
      input.siblingSessionLanes,
      input.workspaceId,
    ],
  );

  const targetsToLoad = useMemo(
    () => lanes.map((lane) => ({ workspaceId: lane.workspaceId, sessionId: lane.sessionId })),
    [lanes],
  );
  const targetsKey = targetsToLoad
    .map((target) => `${target.workspaceId}:${target.sessionId}`)
    .join("|");

  const dirtyTargets = useRef(new Set<string>());
  const currentTargetsKey = useRef(targetsKey);
  currentTargetsKey.current = targetsKey;

  useEffect(() => {
    if (!input.workspaceId || targetsToLoad.length === 0) {
      setTreesBySessionId({});
      setErrors({});
      return;
    }
    for (const key of request.changedKeys ?? []) dirtyTargets.current.add(key);
    const targets =
      request.changedKeys && request.targetsKey === targetsKey
        ? targetsToLoad.filter((t) => dirtyTargets.current.has(`${t.workspaceId}:${t.sessionId}`))
        : request.sessionId && request.targetsKey === targetsKey
          ? targetsToLoad.filter((t) => t.sessionId === request.sessionId)
          : targetsToLoad;
    let cancelled = false;
    setLoading(targetsToLoad.some((target) => !treesBySessionId[target.sessionId]));

    const api = window.piApp;
    if (!api) {
      setLoading(false);
      setErrors(
        Object.fromEntries(targetsToLoad.map((t) => [t.sessionId, "Desktop bridge unavailable"])),
      );
      return;
    }
    void Promise.allSettled(
      targets.map(async (target) => {
        const snapshot = restoreSessionTree(await api.getSessionTree(target));
        return [target.sessionId, snapshot] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Record<string, SessionTreeSnapshot> = {};
        const failures: Record<string, string> = {};
        for (const { sessionId } of targetsToLoad) {
          if (treesBySessionId[sessionId]) next[sessionId] = treesBySessionId[sessionId];
          if (errorsBySessionId[sessionId]) failures[sessionId] = errorsBySessionId[sessionId];
        }
        entries.forEach((entry, i) => {
          const id = targets[i]!.sessionId;
          if (entry.status === "fulfilled") {
            next[id] = entry.value[1];
            delete failures[id];
          } else {
            failures[id] = String(entry.reason);
            if (treesBySessionId[id]) next[id] = treesBySessionId[id];
          }
        });
        for (const target of targets)
          dirtyTargets.current.delete(`${target.workspaceId}:${target.sessionId}`);
        setTreesBySessionId(next);
        setErrors(failures);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrors(Object.fromEntries(targetsToLoad.map((t) => [t.sessionId, String(err)])));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [input.workspaceId, request, targetsKey]);

  // Drafts, focus and UI preferences also broadcast state. Only changed session
  // revisions need fresh trees; reopening every historical JSONL on each token
  // competes with live reply delivery in the main process.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = new Map<string, string>();
    const pending = new Set<string>();
    const off = window.piApp?.onStateChanged((state) => {
      const next = new Map<string, string>();
      for (const workspace of state.workspaces) {
        for (const session of workspace.sessions) {
          const key = `${workspace.id}:${session.id}`;
          const revision = `${session.updatedAt}:${session.status}`;
          next.set(key, revision);
          if (previous.get(key) !== revision) pending.add(key);
        }
      }
      previous = next;
      if (!pending.size || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        const changedKeys = [...pending];
        pending.clear();
        setRequest((v) => ({
          revision: v.revision + 1,
          sessionId: "",
          targetsKey: currentTargetsKey.current,
          changedKeys,
        }));
      }, 500);
    });
    return () => {
      off?.();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const currentLane = lanes.find((lane) => lane.isCurrent);
  const laneNodes = useMemo(() => {
    const map = new Map<string, readonly TrajectoryNode[]>();
    for (const lane of lanes) {
      const tree = treesBySessionId[lane.sessionId];
      if (!tree) {
        map.set(lane.id, []);
        continue;
      }
      const rows = lane.isCurrent ? (input.displayRows ?? []) : [];
      const build = buildTrajectoryFromSessionTree(tree, lane, rows);
      map.set(lane.id, build.nodes);
    }
    return map;
  }, [input.displayRows, lanes, treesBySessionId]);

  const metaChips = useMemo(() => {
    if (!currentLane) return [];
    const tree = treesBySessionId[currentLane.sessionId];
    if (!tree) return [];
    return buildTrajectoryFromSessionTree(tree, currentLane, input.displayRows ?? []).metaChips;
  }, [currentLane, input.displayRows, treesBySessionId]);

  const nodes = currentLane ? (laneNodes.get(currentLane.id) ?? []) : [];

  const handoffs = useMemo(
    () =>
      LANCER_PROTOTYPE_UI ? buildHandoffEdges(lanes, input.orchestrationChildren, laneNodes) : [],
    [input.orchestrationChildren, laneNodes, lanes],
  );

  const multiLane = LANCER_PROTOTYPE_UI && lanes.length >= 2;

  return {
    lanes,
    nodes,
    laneNodes,
    handoffs,
    metaChips,
    loading,
    error: input.sessionId ? errorsBySessionId[input.sessionId] : undefined,
    errorsBySessionId,
    reload: () =>
      setRequest((v) => ({
        revision: v.revision + 1,
        sessionId: input.sessionId ?? "",
        targetsKey,
      })),
    multiLane,
  };
}
