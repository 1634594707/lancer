import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { AppView, WorkspaceRecord, WorktreeRecord } from "../../contracts/desktop-state";
import { getSidePanelToggleShortcutLabel, type PiDesktopApi } from "../../contracts/ipc";
import { SidePanelIcon } from "../ui/icons";
import { t } from "../../contracts/i18n";

interface TopbarProps {
  readonly activeView: AppView;
  readonly sessionTitle?: string;
  readonly center?: ReactNode;
  readonly children?: ReactNode;
  readonly rootWorkspace: WorkspaceRecord | undefined;
  readonly selectedWorkspace: WorkspaceRecord | undefined;
  readonly selectedWorktree: WorktreeRecord | undefined;
  readonly api: PiDesktopApi;
  readonly panelAvailable: boolean;
  readonly panelVisible: boolean;
  readonly onTogglePanel: () => void;
}

export function Topbar({
  activeView,
  sessionTitle,
  center,
  children,
  rootWorkspace,
  selectedWorkspace,
  selectedWorktree,
  api,
  panelAvailable,
  panelVisible,
  onTogglePanel,
}: TopbarProps) {
  const handleDoubleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.closest(".topbar__actions")) return;
    void api.toggleWindowMaximize().catch((error: unknown) => {
      console.error("[renderer] toggleWindowMaximize failed", error);
    });
  };
  const checkoutLabel =
    selectedWorkspace?.kind === "worktree"
      ? (selectedWorktree?.name ?? selectedWorkspace.branchName ?? selectedWorkspace.name)
      : selectedWorkspace?.branchName;

  return (
    <header className="topbar" data-testid="topbar" onDoubleClick={handleDoubleClick}>
      <div className="topbar__title">
        <span
          className="topbar__workspace"
          title={checkoutLabel ? `${rootWorkspace?.name ?? ""} · ${checkoutLabel}` : undefined}
        >
          {rootWorkspace ? rootWorkspace.name : t("topbar.openFolder")}
        </span>
        {sessionTitle ? (
          <>
            <span className="topbar__separator">/</span>
            <h1 className="chat-header__title" data-testid="thread-title" title={sessionTitle}>
              {sessionTitle}
            </h1>
          </>
        ) : activeView === "threads" && checkoutLabel ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">{checkoutLabel}</span>
          </>
        ) : activeView === "new-thread" && rootWorkspace ? (
          <>
            <span className="topbar__separator">/</span>
            <span className="topbar__session">{t("topbar.newThread")}</span>
          </>
        ) : null}
      </div>
      {center ? <div className="topbar__center">{center}</div> : null}
      <div className="topbar__actions">
        {children}
        {!panelVisible ? (
          <div className="shortcut-tooltip-wrap topbar__tooltip-wrap">
            <button
              type="button"
              aria-label={t("topbar.togglePanel")}
              aria-pressed={panelVisible}
              aria-controls="task-workbench"
              data-testid="toggle-side-panel"
              className={`icon-button topbar__icon${panelVisible ? " icon-button--active" : ""}`}
              disabled={!panelAvailable}
              onClick={onTogglePanel}
            >
              <SidePanelIcon />
            </button>
            <span className="shortcut-tooltip topbar__tooltip" role="tooltip">
              <span>{panelVisible ? t("topbar.hidePanel") : t("topbar.showPanel")}</span>
              <kbd>{getSidePanelToggleShortcutLabel(api.platform)}</kbd>
            </span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
