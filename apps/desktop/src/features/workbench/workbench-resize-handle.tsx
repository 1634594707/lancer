import { t } from "../../../contracts/i18n";
import { PaneResizeHandle, type PaneWidthBounds } from "../../ui/pane-resize-handle";

function workbenchBounds(_panel: HTMLElement, main: HTMLElement): PaneWidthBounds {
  // The process shell adds a wrapper around the workbench. Measuring that
  // wrapper feeds the panel's own width back into its maximum on every move.
  const container = main.closest<HTMLElement>(".lancer-process .body") ?? main;
  const max = Math.max(
    320,
    Math.floor(Math.min(1200, container.clientWidth * (window.innerWidth <= 980 ? 1 : 0.65))),
  );
  return { min: 320, max };
}

export function WorkbenchResizeHandle({
  onResize,
}: {
  readonly onResize: (width: number) => void;
}) {
  return (
    <PaneResizeHandle
      className="workbench__resize-handle"
      label={t("workbench.panelWidth")}
      controls="task-workbench"
      edge="left"
      bounds={workbenchBounds}
      onResize={onResize}
    />
  );
}
