import type { RuntimeSkillRecord } from "@lancer/session-driver/runtime-types";
import type { WorkspaceRecord } from "../../../contracts/desktop-state";
import { t } from "../../../contracts/i18n";
import { titleCase } from "../../lib/string-utils";
import { SkillIcon } from "../../ui/icons";
import { SettingsGroup, SettingsRow } from "../settings/settings-utils";
import { sourceScopeGroupLabel } from "./extension-display";
import { displayPath, ResourceDetail } from "./resource-detail";
import { ResourceEmptyState, ResourceList, type ResourceListGroup } from "./resource-list";

function groupOrder(): readonly string[] {
  return [
    sourceScopeGroupLabel("project"),
    sourceScopeGroupLabel("user"),
    sourceScopeGroupLabel("temporary"),
  ];
}

interface SkillsTabProps {
  readonly workspace: WorkspaceRecord;
  readonly skills: readonly RuntimeSkillRecord[];
  readonly searching: boolean;
  /** The skill whose detail page is open, looked up in the unfiltered list. */
  readonly selected?: RuntimeSkillRecord;
  readonly onSelect: (filePath: string | undefined) => void;
  readonly onToggleSkill: (filePath: string, enabled: boolean) => void;
  readonly onOpenSkillFolder: (filePath: string) => void;
  readonly onTrySkill: (skill: RuntimeSkillRecord) => void;
}

export function SkillsTab({
  workspace,
  skills,
  searching,
  selected,
  onSelect,
  onToggleSkill,
  onOpenSkillFolder,
  onTrySkill,
}: SkillsTabProps) {
  // The list stays mounted under an open detail so expanded groups, scroll and focus survive.
  const list =
    skills.length === 0 ? (
      <ResourceEmptyState
        title={t(searching ? "extensions.skill.noMatchTitle" : "extensions.skill.emptyTitle")}
        body={t(searching ? "extensions.skill.noMatchBody" : "extensions.skill.emptyBody")}
      />
    ) : (
      <ResourceList
        expanded={searching}
        groups={groupSkills(skills, onToggleSkill)}
        icon={<SkillIcon />}
        testId="skills-list"
        onOpen={onSelect}
      />
    );

  return (
    <>
      {selected ? (
        <ResourceDetail
          actions={
            <>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onOpenSkillFolder(selected.filePath)}
              >
                {t("extensions.detail.openFolder")}
              </button>
              <button
                className="button button--primary"
                type="button"
                onClick={() => onTrySkill(selected)}
              >
                {t("extensions.skill.try")}
              </button>
            </>
          }
          backLabel={t("extensions.skill.back")}
          enabled={selected.enabled}
          icon={<SkillIcon />}
          subtitle={selected.slashCommand}
          title={titleCase(selected.name)}
          onBack={() => onSelect(undefined)}
          onToggle={(enabled) => onToggleSkill(selected.filePath, enabled)}
        >
          <p className="resource-detail__description">{selected.description}</p>
          <SettingsGroup>
            <SettingsRow
              title={t("extensions.skill.slashCommand")}
              description={t("extensions.skill.slashCommandDescription")}
            >
              <code className="resource-detail__code">{selected.slashCommand}</code>
            </SettingsRow>
            <SettingsRow
              title={t("extensions.skill.modelInvocation")}
              description={t(
                selected.disableModelInvocation
                  ? "extensions.skill.manualOnlyDescription"
                  : "extensions.skill.automaticDescription",
              )}
            >
              <span className="settings-row__value">
                {t(
                  selected.disableModelInvocation
                    ? "extensions.skill.manualOnly"
                    : "extensions.skill.automatic",
                )}
              </span>
            </SettingsRow>
            <SettingsRow
              title={t("extensions.detail.location")}
              description={sourceScopeGroupLabel(selected.scope)}
            >
              <code className="resource-detail__code" title={selected.filePath}>
                {displayPath(selected.filePath, workspace.path)}
              </code>
            </SettingsRow>
          </SettingsGroup>
        </ResourceDetail>
      ) : null}
      <div hidden={Boolean(selected)}>{list}</div>
    </>
  );
}

function groupSkills(
  skills: readonly RuntimeSkillRecord[],
  onToggleSkill: (filePath: string, enabled: boolean) => void,
): readonly ResourceListGroup[] {
  return groupOrder()
    .map((label) => ({
      label,
      items: skills
        .filter((skill) => sourceScopeGroupLabel(skill.scope) === label)
        .map((skill) => ({
          id: skill.filePath,
          title: titleCase(skill.name),
          description: skill.description,
          enabled: skill.enabled,
          onToggle: (enabled: boolean) => onToggleSkill(skill.filePath, enabled),
        })),
    }))
    .filter((group) => group.items.length > 0);
}
