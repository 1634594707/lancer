import { useMemo, type CSSProperties } from "react";
import { t, tPlural } from "../../../../contracts/i18n";
import type { TrajectoryLane, TrajectoryMetaChip, TrajectoryNode } from "./trajectory-model";

function glyphForNode(node: TrajectoryNode): string {
  if (node.state === "tool" || node.kind === "tool_group") return "⚙";
  switch (node.kind) {
    case "message":
      return node.state === "user" ? "◉" : "●";
    case "compaction":
    case "branch_summary":
      return "↺";
    case "model_change":
      return "◇";
    default:
      return "•";
  }
}

export function SessionTrajectoryPanel({
  lanes,
  nodes,
  metaChips = [],
  loading,
  error,
  highlightedNodeId,
  onSelectNode,
}: {
  readonly lanes: readonly TrajectoryLane[];
  readonly nodes: readonly TrajectoryNode[];
  readonly metaChips?: readonly TrajectoryMetaChip[];
  readonly loading: boolean;
  readonly error?: string;
  readonly highlightedNodeId?: string | null;
  readonly onSelectNode: (node: TrajectoryNode) => void;
}) {
  const laneHeaders = useMemo(() => lanes, [lanes]);
  const currentLane = lanes.find((lane) => lane.isCurrent);

  return (
    <aside className="session-trajectory" data-testid="session-trajectory-panel">
      <header className="session-trajectory__header">
        <span className="session-trajectory__title">{t("trajectory.title")}</span>
        {lanes.length > 1 ? (
          <span className="session-trajectory__meta">
            {tPlural(lanes.length, "trajectory.laneCountOne", "trajectory.laneCountMany")}
          </span>
        ) : null}
      </header>
      {metaChips.length > 0 ? (
        <div className="session-trajectory__chips" data-testid="session-trajectory-chips">
          {metaChips.map((chip) => (
            <span key={chip.id} className="session-trajectory__chip">
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {laneHeaders.length > 1 ? (
        <div className="session-trajectory__lanes" role="tablist">
          {laneHeaders.map((lane) => (
            <div
              key={lane.id}
              className={`session-trajectory__lane-head ${lane.isCurrent ? "session-trajectory__lane-head--active" : ""}`}
              style={{ "--lane-color": lane.color } as CSSProperties}
              title={lane.isCurrent ? undefined : t("trajectory.laneExtensionHint")}
            >
              <i aria-hidden="true" />
              <span>{lane.label}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className="session-trajectory__body">
        {loading ? (
          <p className="session-trajectory__status">{t("trajectory.loading")}</p>
        ) : error ? (
          <p className="session-trajectory__status session-trajectory__status--error">{error}</p>
        ) : nodes.length === 0 ? (
          <p className="session-trajectory__status">{t("trajectory.empty")}</p>
        ) : (
          <ol
            className="session-trajectory__track"
            style={{ "--lane-color": currentLane?.color } as CSSProperties}
          >
            {nodes.map((node) => {
              const highlighted =
                highlightedNodeId === node.id || highlightedNodeId === node.scrollTargetId;
              return (
                <li
                  key={node.id}
                  data-lane-id={node.laneId}
                  data-node-id={node.id}
                  data-scroll-target={node.scrollTargetId}
                  className={`session-trajectory__node session-trajectory__node--${node.state} ${node.isFork ? "session-trajectory__node--fork" : ""} ${node.isActivePath ? "session-trajectory__node--path" : ""} ${highlighted ? "session-trajectory__node--hl" : ""}`}
                  style={{ "--graph-column": node.depth } as CSSProperties}
                >
                  <button
                    type="button"
                    className="session-trajectory__node-button"
                    data-testid={node.kind === "tool_group" ? "trajectory-tool-stage" : undefined}
                    onClick={() => onSelectNode(node)}
                    title={node.preview ?? node.title}
                  >
                    <span className="session-trajectory__glyph" aria-hidden="true">
                      {glyphForNode(node)}
                    </span>
                    <span className="session-trajectory__node-text">
                      <span className="session-trajectory__node-title">{node.title}</span>
                      {node.preview && node.kind !== "tool_group" ? (
                        <span className="session-trajectory__node-preview">{node.preview}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <footer className="session-trajectory__legend">
        <span>{t("trajectory.legendHint")}</span>
      </footer>
    </aside>
  );
}
