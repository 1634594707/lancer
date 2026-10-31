import type { RuntimeExtensionRecord } from "@lancer/session-driver/runtime-types";
import type {
  ExtensionCommandCompatibilityRecord,
  WorkspaceRecord,
} from "../../../contracts/desktop-state";
import { t, tPlural, type MessageKey } from "../../../contracts/i18n";
import { ExtensionIcon } from "../../ui/icons";
import { SettingsGroup, SettingsRow } from "../settings/settings-utils";
import {
  extensionGroupLabel,
  isPiGuiBuiltinExtension,
  piGuiToolsLabel,
  sourceScopeGroupLabel,
} from "./extension-display";
import { displayPath, ResourceDetail } from "./resource-detail";
import { ResourceEmptyState, ResourceList, type ResourceListGroup } from "./resource-list";

function groupOrder(): readonly string[] {
  return [
    sourceScopeGroupLabel("project"),
    sourceScopeGroupLabel("user"),
    sourceScopeGroupLabel("temporary"),
    piGuiToolsLabel(),
  ];
}

interface ExtensionsTabProps {
  readonly workspace: WorkspaceRecord;
  readonly extensions: readonly RuntimeExtensionRecord[];
  readonly commandCompatibility: readonly ExtensionCommandCompatibilityRecord[];
  readonly searching: boolean;
  /** The extension whose detail page is open, looked up in the unfiltered list. */
  readonly selected?: RuntimeExtensionRecord;
  readonly onSelect: (path: string | undefined) => void;
  readonly onToggleExtension: (path: string, enabled: boolean) => void;
  readonly onOpenExtensionFolder: (path: string) => void;
}

export function ExtensionsTab({
  workspace,
  extensions,
  commandCompatibility,
  searching,
  selected,
  onSelect,
  onToggleExtension,
  onOpenExtensionFolder,
}: ExtensionsTabProps) {
  // The list stays mounted under an open detail so expanded groups, scroll and focus survive.
  const list =
    extensions.length === 0 ? (
      <ResourceEmptyState
        title={t(searching ? "extensions.ext.noMatchTitle" : "extensions.ext.emptyTitle")}
        body={t(searching ? "extensions.ext.noMatchBody" : "extensions.ext.emptyBody")}
      />
    ) : (
      <ResourceList
        expanded={searching}
        groups={groupExtensions(extensions, onToggleExtension)}
        icon={<ExtensionIcon />}
        testId="extensions-list"
        onOpen={onSelect}
      />
    );

  return (
    <>
      {selected ? (
        <ExtensionDetail
          commandCompatibility={commandCompatibility}
          selected={selected}
          workspace={workspace}
          onOpenExtensionFolder={onOpenExtensionFolder}
          onSelect={onSelect}
          onToggleExtension={onToggleExtension}
        />
      ) : null}
      <div hidden={Boolean(selected)}>{list}</div>
    </>
  );
}

function ExtensionDetail({
  selected,
  workspace,
  commandCompatibility,
  onSelect,
  onToggleExtension,
  onOpenExtensionFolder,
}: Omit<ExtensionsTabProps, "extensions" | "searching" | "selected"> & {
  readonly selected: RuntimeExtensionRecord;
}) {
  const hasFolder = isFolderExtension(selected);
  const compatibilityRecords = commandCompatibility
    .filter((record) => record.extensionPath === selected.path)
    .sort((left, right) => left.commandName.localeCompare(right.commandName));
  return (
    <ResourceDetail
      actions={
        hasFolder ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onOpenExtensionFolder(selected.path)}
          >
            {t("extensions.detail.openFolder")}
          </button>
        ) : null
      }
      backLabel={t("extensions.ext.back")}
      enabled={selected.enabled}
      icon={<ExtensionIcon />}
      subtitle={selected.sourceInfo.source}
      title={selected.displayName}
      onBack={() => onSelect(undefined)}
      onToggle={
        isToggleableExtension(selected)
          ? (enabled) => onToggleExtension(selected.path, enabled)
          : undefined
      }
    >
      {selected.description ? (
        <p className="resource-detail__description">{selected.description}</p>
      ) : null}
      <SettingsGroup>
        <SettingsRow
          title={t("extensions.ext.source")}
          description={t(
            selected.sourceInfo.origin === "package"
              ? "extensions.ext.sourcePackage"
              : "extensions.ext.sourceFile",
          )}
        >
          <span className="settings-row__value">{extensionGroupLabel(selected)}</span>
        </SettingsRow>
        {isPiGuiBuiltinExtension(selected) ? null : (
          <SettingsRow title={t("extensions.detail.location")}>
            <code className="resource-detail__code" title={selected.path}>
              {displayPath(selected.path, workspace.path)}
            </code>
          </SettingsRow>
        )}
      </SettingsGroup>
      <ExtensionContributionSection title={t("extensions.ext.tools")} items={selected.tools} />
      {selected.commands.length > 0 ? (
        <ExtensionCompatibilitySection
          commands={selected.commands}
          compatibilityRecords={compatibilityRecords}
        />
      ) : null}
      <ExtensionContributionSection title={t("extensions.ext.flags")} items={selected.flags} />
      <ExtensionContributionSection
        title={t("extensions.ext.shortcuts")}
        items={selected.shortcuts}
      />
      <ExtensionDiagnostics diagnostics={selected.diagnostics} />
    </ResourceDetail>
  );
}

function groupExtensions(
  extensions: readonly RuntimeExtensionRecord[],
  onToggleExtension: (path: string, enabled: boolean) => void,
): readonly ResourceListGroup[] {
  return groupOrder()
    .map((label) => ({
      label,
      items: extensions
        .filter((extension) => extensionGroupLabel(extension) === label)
        .map((extension) => ({
          id: extension.path,
          title: extension.displayName,
          description: describeExtension(extension),
          enabled: extension.enabled,
          onToggle: isToggleableExtension(extension)
            ? (enabled: boolean) => onToggleExtension(extension.path, enabled)
            : undefined,
        })),
    }))
    .filter((group) => group.items.length > 0);
}

/** One line for the list: the extension's own description, else what it contributes. */
function describeExtension(extension: RuntimeExtensionRecord): string {
  if (extension.description) return extension.description;
  const parts = [
    countLabel(
      extension.tools.length,
      "extensions.ext.toolCountOne",
      "extensions.ext.toolCountOther",
    ),
    countLabel(
      extension.commands.length,
      "extensions.ext.commandCountOne",
      "extensions.ext.commandCountOther",
    ),
    countLabel(
      extension.diagnostics.length,
      "extensions.ext.issueCountOne",
      "extensions.ext.issueCountOther",
    ),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : extension.sourceInfo.source;
}

function countLabel(count: number, singularKey: MessageKey, pluralKey: MessageKey): string {
  return count === 0 ? "" : tPlural(count, singularKey, pluralKey);
}

function isFolderExtension(extension: RuntimeExtensionRecord): boolean {
  return extension.sourceInfo.scope === "project" || extension.sourceInfo.scope === "user";
}

function isToggleableExtension(extension: RuntimeExtensionRecord): boolean {
  return isFolderExtension(extension) || isPiGuiBuiltinExtension(extension);
}

function ExtensionContributionSection({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) return null;
  return (
    <SettingsGroup title={title}>
      <div className="resource-detail__tokens">
        {items.map((item) => (
          <code className="resource-detail__token" key={item}>
            {item}
          </code>
        ))}
      </div>
    </SettingsGroup>
  );
}

function ExtensionDiagnostics({
  diagnostics,
}: {
  readonly diagnostics: RuntimeExtensionRecord["diagnostics"];
}) {
  if (diagnostics.length === 0) return null;
  return (
    <SettingsGroup title={t("extensions.ext.diagnostics")}>
      {diagnostics.map((diagnostic, index) => (
        <div
          className={`activity-item activity-item--${diagnostic.type === "error" ? "error" : "info"}`}
          key={`${diagnostic.message}:${index}`}
        >
          <div className="activity-item__text">{diagnostic.message}</div>
          {diagnostic.path ? <div className="activity-item__meta">{diagnostic.path}</div> : null}
        </div>
      ))}
    </SettingsGroup>
  );
}

function ExtensionCompatibilitySection({
  commands,
  compatibilityRecords,
}: {
  readonly commands: readonly string[];
  readonly compatibilityRecords: readonly ExtensionCommandCompatibilityRecord[];
}) {
  const supported = compatibilityRecords.filter((record) => record.status === "supported");
  const terminalOnly = compatibilityRecords.filter((record) => record.status === "terminal-only");
  const unknown = commands.filter((commandName) =>
    compatibilityRecords.every(
      (record) =>
        record.commandName !== commandName && !record.commandName.startsWith(`${commandName}:`),
    ),
  );

  return (
    <SettingsGroup
      title={t("extensions.ext.commands")}
      description={t("extensions.ext.commandsDescription")}
    >
      <div className="resource-detail__tokens">
        {supported.map((record) => (
          <code className="resource-detail__token" key={`supported:${record.commandName}`}>
            {t("extensions.ext.commandSupported", { command: record.commandName })}
          </code>
        ))}
        {terminalOnly.map((record) => (
          <code
            className="resource-detail__token resource-detail__token--warning"
            key={`terminal:${record.commandName}`}
          >
            {t("extensions.ext.commandTerminalOnly", { command: record.commandName })}
          </code>
        ))}
        {unknown.map((commandName) => (
          <code className="resource-detail__token" key={`unknown:${commandName}`}>
            {t("extensions.ext.commandUnknown", { command: commandName })}
          </code>
        ))}
      </div>
    </SettingsGroup>
  );
}
