import type { ComponentProps } from "react";
import { MultiLaneTrajectoryPanel } from "./multi-lane-trajectory-panel";
import { SessionTrajectoryPanel } from "./session-trajectory-panel";
import type { useSessionTrajectory } from "./use-session-trajectory";

export function TrajectoryPanel({
  trajectory,
  highlightedNodeId,
  onSelectNode,
}: {
  readonly trajectory: ReturnType<typeof useSessionTrajectory>;
  readonly highlightedNodeId: string | null;
  readonly onSelectNode: ComponentProps<typeof SessionTrajectoryPanel>["onSelectNode"];
}) {
  return trajectory.multiLane ? (
    <MultiLaneTrajectoryPanel
      {...trajectory}
      highlightedNodeId={highlightedNodeId}
      onSelectNode={onSelectNode}
    />
  ) : (
    <SessionTrajectoryPanel
      {...trajectory}
      highlightedNodeId={highlightedNodeId}
      onSelectNode={onSelectNode}
    />
  );
}
