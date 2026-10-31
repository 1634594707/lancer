import type {
  RuntimeExtensionRecord,
  RuntimeSourceScope,
} from "@lancer/session-driver/runtime-types";
import { t } from "../../../contracts/i18n";

export function extensionSourceSummary(extension: RuntimeExtensionRecord): string {
  return `${extensionScopeLabel(extension)} · ${extension.sourceInfo.origin}`;
}

export function piGuiToolsLabel(): string {
  return t("extensions.lancerTools");
}

/** Extensions Lancer itself adds to every session; switched on and off app-wide. */
export function isPiGuiBuiltinExtension(extension: RuntimeExtensionRecord): boolean {
  return extension.sourceInfo.source === "builtin" && extension.sourceInfo.origin === "top-level";
}

export function extensionScopeLabel(extension: RuntimeExtensionRecord): string {
  return isPiGuiBuiltinExtension(extension) ? piGuiToolsLabel() : extension.sourceInfo.scope;
}

/** Group heading for where a skill or extension was discovered. */
export function sourceScopeGroupLabel(scope: RuntimeSourceScope): string {
  switch (scope) {
    case "project":
      return t("extensions.scope.workspace");
    case "user":
      return t("extensions.scope.user");
    case "temporary":
      return t("extensions.scope.temporary");
  }
}

export function extensionGroupLabel(extension: RuntimeExtensionRecord): string {
  return isPiGuiBuiltinExtension(extension)
    ? piGuiToolsLabel()
    : sourceScopeGroupLabel(extension.sourceInfo.scope);
}
