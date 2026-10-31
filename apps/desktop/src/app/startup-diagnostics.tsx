import type { DesktopAppState } from "../../contracts/desktop-state";
import { t } from "../../contracts/i18n";

export function StartupDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: DesktopAppState["startupDiagnostics"];
}) {
  if (!diagnostics.length) return null;
  return (
    <div className="startup-diagnostics" role="status" data-testid="startup-diagnostics">
      <strong>{t("app.startupDiagnostics.title")}</strong>
      <span>
        {diagnostics
          .map((diagnostic) => {
            const name = diagnostic.workspacePath?.split(/[\\/]/).filter(Boolean).at(-1);
            return name
              ? t("app.startupDiagnostics.workspaceUnavailable", { name })
              : diagnostic.message;
          })
          .join(" ")}
      </span>
    </div>
  );
}
