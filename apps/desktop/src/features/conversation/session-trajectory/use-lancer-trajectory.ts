import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DisplayTimelineItem } from "../../../../contracts/timeline-types";
import type { OrchestrationChildThread } from "../../../../contracts/desktop-state";
import { LANCER_PROTOTYPE_UI } from "../../../../contracts/lancer-ui";

import type { ThreadListEntry } from "../../threads/thread-groups";
import type { TimelineViewport } from "../hooks/use-timeline-viewport";
import { buildProcessBlocks } from "../process-timeline/build-process-blocks";
import { useSessionTrajectory } from "./use-session-trajectory";
import type { TrajectoryNode } from "./trajectory-model";

type Target = { readonly workspaceId: string; readonly sessionId: string };

export function useLancerTrajectory(input: {
  readonly target: Target | null;
  readonly title: string;
  readonly threads: readonly ThreadListEntry[];
  readonly children?: readonly OrchestrationChildThread[];
  readonly rows: readonly DisplayTimelineItem[];
  readonly transcriptReady: boolean;
  readonly viewport: TimelineViewport;
  readonly onSelectThread: (target: Target) => void;
}) {
  const key = input.target ? `${input.target.workspaceId}:${input.target.sessionId}` : "";
  const siblings = useMemo(() => {
    if (!LANCER_PROTOTYPE_UI || !input.target) return [];
    return input.threads
      .filter(
        (entry) =>
          entry.session.id !== input.target?.sessionId ||
          entry.workspaceId !== input.target?.workspaceId,
      )
      .map((entry) => ({
        workspaceId: entry.workspaceId,
        sessionId: entry.session.id,
        title: entry.session.title,
      }));
  }, [input.target?.sessionId, input.target?.workspaceId, input.threads]);
  const trajectory = useSessionTrajectory({
    workspaceId: input.target?.workspaceId,
    sessionId: input.target?.sessionId,
    sessionTitle: input.title,
    orchestrationChildren: input.children,
    siblingSessionLanes: siblings,
    displayRows: input.rows,
  });
  const [highlight, setHighlight] = useState<{ key: string; id: string } | null>(null);
  const [pending, setPending] = useState<{ key: string; node: TrajectoryNode } | null>(null);
  const selectNode = useCallback(
    (node: TrajectoryNode) => {
      const lane = trajectory.lanes.find((lane) => lane.id === node.laneId);
      if (!lane) return;
      const destination = `${lane.workspaceId}:${lane.sessionId}`;
      setPending({ key: destination, node });
      if (destination !== key) input.onSelectThread(lane);
    },
    [key, trajectory.lanes, input.onSelectThread],
  );

  useEffect(() => {
    if (!pending || pending.key !== key || !input.transcriptReady || trajectory.loading) return;
    // Tree tool anchors survive hydration; prose IDs can be remapped by their persisted preview.
    const node = trajectory.nodes.find(
      (node) =>
        node.id === pending.node.id ||
        (pending.node.scrollTargetId !== undefined &&
          node.scrollTargetId === pending.node.scrollTargetId) ||
        node.title === pending.node.title ||
        (pending.node.kind === "handoff" && node.kind === "handoff"),
    );
    if (!node) {
      setPending(null);
      return;
    }
    const id = node.scrollTargetId ?? node.id;
    setHighlight({ key, id });
    input.viewport.navigateToRow(id);
    setPending(null);
  }, [
    key,
    pending,
    input.transcriptReady,
    trajectory.loading,
    trajectory.nodes,
    input.viewport.navigateToRow,
  ]);

  const onChatClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!(event.target instanceof Element)) return;
      const stage = event.target.closest<HTMLElement>(".process-stage, .process-handoff");
      const id = stage?.dataset.scrollTarget ?? stage?.dataset.processId;
      if (id) {
        setHighlight({ key, id });
        input.viewport.navigateToRow(id);
      }
    },
    [key, input.viewport.navigateToRow],
  );

  const previousStages = useRef(new Map<string, string>());
  useEffect(() => {
    const stages = buildProcessBlocks(input.rows).filter((block) => block.kind === "stage");
    for (const stage of stages) {
      if (
        previousStages.current.get(`${key}:${stage.id}`) === "running" &&
        stage.status !== "running"
      ) {
        setHighlight({ key, id: stage.scrollTargetId });
      }
    }
    previousStages.current = new Map(stages.map((stage) => [`${key}:${stage.id}`, stage.status]));
  }, [key, input.rows]);

  return {
    trajectory,
    highlightedId: highlight?.key === key ? highlight.id : null,
    selectNode,
    onChatClick,
  };
}
