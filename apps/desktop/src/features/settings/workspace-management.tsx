import type { Dispatch, SetStateAction } from "react";
import type { DesktopAppState } from "../../../contracts/desktop-state";
import type { PiDesktopApi } from "../../../contracts/ipc";
import { t } from "../../../contracts/i18n";
import { updateSnapshot } from "../../app/desktop-app-state";
import { useWorkspaceMenu } from "../threads/hooks/use-workspace-menu";
import { WorkspaceFolderContent } from "../threads/sidebar";
import { SettingsGroup } from "./settings-utils";

/** Workspace operations remain available without replacing the module sidebar. */
export function WorkspaceManagement({
  api,
  snapshot,
  setSnapshot,
}: {
  readonly api: PiDesktopApi;
  readonly snapshot: DesktopAppState;
  readonly setSnapshot: Dispatch<SetStateAction<DesktopAppState | null>>;
}) {
  const wsMenu = useWorkspaceMenu({ api, setSnapshot, updateSnapshot });
  const linked = new Map(
    Object.values(snapshot.worktreesByWorkspace)
      .flat()
      .filter((worktree) => worktree.linkedWorkspaceId)
      .map((worktree) => [worktree.linkedWorkspaceId!, worktree]),
  );
  return (
    <SettingsGroup title={t("app.settings.workspace")}>
      <div data-testid="workspace-management">
        {snapshot.workspaces.map((workspace) => (
          <section className="workspace-group" data-workspace-id={workspace.id} key={workspace.id}>
            <WorkspaceFolderContent
              workspace={workspace}
              canDrag={false}
              selectedWorkspace={snapshot.workspaces.find(
                (item) => item.id === snapshot.selectedWorkspaceId,
              )}
              linkedWorktreeByWorkspaceId={linked}
              wsMenu={wsMenu}
              api={api}
            />
          </section>
        ))}
      </div>
    </SettingsGroup>
  );
}
