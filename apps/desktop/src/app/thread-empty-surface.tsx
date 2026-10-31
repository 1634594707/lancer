import type { WorkspaceRecord } from "../../contracts/desktop-state";
import { t } from "../../contracts/i18n";

export function ThreadEmptySurface({
  workspace,
  onNewThread,
}: {
  readonly workspace?: WorkspaceRecord;
  readonly onNewThread: () => void;
}) {
  return (
    <section className="canvas canvas--empty">
      <div className="empty-panel">
        <div className="session-header__eyebrow">{t("app.empty.eyebrow")}</div>
        <h1>{workspace?.name ?? t("app.empty.openFolderTitle")}</h1>
        <p>{workspace ? t("app.empty.createThreadForFolder") : t("app.empty.addProjectFolders")}</p>
        {workspace ? (
          <div className="empty-panel__actions">
            <button className="button button--primary" type="button" onClick={onNewThread}>
              {t("app.empty.newThread")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
