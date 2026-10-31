import { useState, type ReactNode } from "react";
import type {
  RuntimeModelRecord,
  RuntimeSettingsSnapshot,
  RuntimeSnapshot,
} from "@lancer/session-driver/runtime-types";
import { t } from "../../../contracts/i18n";
import { SearchIcon } from "../../ui/icons";
import { SettingsSelect, SettingsSwitch } from "./settings-controls";
import {
  filterModels,
  labelForThinking,
  SettingsGroup,
  SettingsRow,
  THINKING_LEVELS,
} from "./settings-utils";

interface SettingsModelsSectionProps {
  readonly runtime?: RuntimeSnapshot;
  readonly onSetDefaultModel: (provider: string, modelId: string) => void;
  readonly onSetThinkingLevel: (
    thinkingLevel: RuntimeSettingsSnapshot["defaultThinkingLevel"],
  ) => void;
  readonly onSetScopedModelPatterns: (patterns: readonly string[]) => void;
  readonly onOpenProviders: () => void;
}

function modelPattern(model: RuntimeModelRecord): string {
  return `${model.providerId}/${model.modelId}`;
}

/** Cursor's Models page: defaults on top, then one searchable list with a switch per model. */
export function SettingsModelsSection({
  runtime,
  onSetDefaultModel,
  onSetThinkingLevel,
  onSetScopedModelPatterns,
  onOpenProviders,
}: SettingsModelsSectionProps) {
  const [query, setQuery] = useState("");
  const [showUnconnected, setShowUnconnected] = useState(false);
  const thinkingOptions = THINKING_LEVELS.map((level) => ({
    value: level,
    label: labelForThinking(level),
  }));

  const models = runtime?.models ?? [];
  const availableModels = models.filter((model) => model.available);
  const unconnectedModels = models.filter((model) => !model.available);

  // No saved patterns means pi enables every available model.
  const savedPatterns = runtime?.settings.enabledModelPatterns ?? [];
  const activePatterns =
    savedPatterns.length === 0 ? availableModels.map(modelPattern) : savedPatterns;
  const activeSet = new Set(activePatterns);
  const enabledModels = availableModels.filter((model) => activeSet.has(modelPattern(model)));

  const defaultProvider = runtime?.settings.defaultProvider;
  const defaultModelId = runtime?.settings.defaultModelId;
  const defaultValue =
    defaultProvider && defaultModelId ? `${defaultProvider}:${defaultModelId}` : undefined;
  const defaultIsEnabled = enabledModels.some(
    (model) => model.providerId === defaultProvider && model.modelId === defaultModelId,
  );

  const searching = query.trim().length > 0;
  const visibleAvailable = filterModels(availableModels, query);
  const visibleUnconnected = filterModels(unconnectedModels, query);

  const setEnabled = (pattern: string, enabled: boolean) => {
    const next = enabled
      ? [...activePatterns, pattern]
      : activePatterns.filter((entry) => entry !== pattern);
    if (next.length > 0) onSetScopedModelPatterns(next);
  };

  return (
    <>
      <SettingsGroup>
        <SettingsRow
          title={t("settings.models.defaultModel")}
          description={t("settings.models.defaultModelDescription")}
        >
          <SettingsSelect
            label={t("settings.models.defaultModel")}
            options={enabledModels.map((model) => ({
              value: `${model.providerId}:${model.modelId}`,
              label: `${model.providerName} · ${model.label}`,
            }))}
            value={defaultIsEnabled ? defaultValue : undefined}
            onChange={(value) => {
              const [provider = "", ...modelParts] = value.split(":");
              onSetDefaultModel(provider, modelParts.join(":"));
            }}
          />
        </SettingsRow>
        <SettingsRow
          title={t("settings.models.reasoning")}
          description={t("settings.models.reasoningDescription")}
        >
          <SettingsSelect
            label={t("settings.models.reasoning")}
            options={thinkingOptions}
            value={runtime?.settings.defaultThinkingLevel ?? undefined}
            onChange={onSetThinkingLevel}
          />
        </SettingsRow>
        {defaultValue && !defaultIsEnabled ? (
          <div className="settings-row">
            <span className="settings-warning">
              {t("settings.models.defaultUnavailableWarning", {
                model: `${defaultProvider}/${defaultModelId}`,
              })}
            </span>
          </div>
        ) : null}
      </SettingsGroup>

      <section className="settings-section">
        <div className="settings-section__header">
          <h3 className="settings-section__title">
            {t("settings.models.enabledModels")}{" "}
            <span className="resource-list__count">
              {t("settings.models.enabledCount", {
                enabled: enabledModels.length,
                total: availableModels.length,
              })}
            </span>
          </h3>
          <label className="resource-search">
            <SearchIcon />
            <input
              aria-label={t("settings.models.search")}
              placeholder={t("settings.models.search")}
              spellCheck={false}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </label>
        </div>
        <p className="settings-section__description">
          {t("settings.models.enabledOnlyDescription")}
        </p>
        <div className="settings-group" data-testid="settings-model-list">
          {visibleAvailable.length === 0 ? (
            <div className="settings-row">
              <span className="settings-row__description">
                {availableModels.length === 0
                  ? t("settings.models.noConnectedModels")
                  : t("settings.models.noMatch", { query: query.trim() })}
              </span>
            </div>
          ) : (
            visibleAvailable.map((model) => {
              const pattern = modelPattern(model);
              const enabled = activeSet.has(pattern);
              return (
                <ModelRow
                  isDefault={
                    model.providerId === defaultProvider && model.modelId === defaultModelId
                  }
                  key={pattern}
                  model={model}
                >
                  <SettingsSwitch
                    checked={enabled}
                    disabled={enabled && activePatterns.length <= 1}
                    label={t("settings.models.enableModel", { model: pattern })}
                    onChange={(next) => setEnabled(pattern, next)}
                  />
                </ModelRow>
              );
            })
          )}
        </div>
      </section>

      {unconnectedModels.length > 0 && (!searching || visibleUnconnected.length > 0) ? (
        <section className="settings-section">
          <div className="settings-section__header">
            <h3 className="settings-section__title">
              {t("settings.models.notConnected")}{" "}
              <span className="resource-list__count">{visibleUnconnected.length}</span>
            </h3>
            <button className="button button--secondary" type="button" onClick={onOpenProviders}>
              {t("settings.models.connectProvider")}
            </button>
          </div>
          <p className="settings-section__description">
            {t("settings.models.notConnectedDescription")}
          </p>
          {searching || showUnconnected ? (
            <div className="settings-group" data-testid="settings-unconnected-model-list">
              {visibleUnconnected.map((model) => (
                <ModelRow isDefault={false} key={modelPattern(model)} model={model} />
              ))}
            </div>
          ) : (
            <button
              className="resource-list__more"
              type="button"
              onClick={() => setShowUnconnected(true)}
            >
              {t("settings.models.showModels", { count: unconnectedModels.length })}
            </button>
          )}
        </section>
      ) : null}
    </>
  );
}

function ModelRow({
  model,
  isDefault,
  children,
}: {
  readonly model: RuntimeModelRecord;
  readonly isDefault: boolean;
  readonly children?: ReactNode;
}) {
  return (
    <div className="settings-row model-row">
      <div className="settings-row__label">
        <div className="settings-row__title">
          {model.label}
          {isDefault ? (
            <span className="model-row__badge">{t("settings.models.badgeDefault")}</span>
          ) : null}
        </div>
        <div className="settings-row__description">
          {model.providerName} · {modelPattern(model)}
          {model.reasoning ? (
            <span className="model-row__tag">{t("settings.models.tagReasoning")}</span>
          ) : null}
          {model.supportsImages ? (
            <span className="model-row__tag">{t("settings.models.tagImages")}</span>
          ) : null}
        </div>
      </div>
      {children ? <div className="settings-row__control">{children}</div> : null}
    </div>
  );
}
