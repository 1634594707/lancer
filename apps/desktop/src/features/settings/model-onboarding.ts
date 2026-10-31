import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import { t } from "../../../contracts/i18n";
import { buildModelOptions } from "../conversation/composer-commands";

export type ModelOnboardingSettingsSection = "models" | "providers";

export interface ModelOnboardingNotice {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly actionSection: ModelOnboardingSettingsSection;
}

export interface ModelOnboardingState {
  readonly hasSelectableModels: boolean;
  readonly requiresModelSelection: boolean;
  readonly unselectedModelLabel: string;
  readonly emptyModelTitle: string;
  readonly emptyModelDescription: string;
  readonly notice?: ModelOnboardingNotice;
}

interface ModelSelectionInput {
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
}

export function deriveModelOnboardingState(
  runtime: RuntimeSnapshot | undefined,
  currentSelection: ModelSelectionInput,
): ModelOnboardingState {
  const selectableModels = buildModelOptions(runtime);
  const selectableSet = new Set(
    selectableModels.map((model) => `${model.providerId}:${model.modelId}`),
  );
  const hasSelectableModels = selectableModels.length > 0;
  const connectedProviderCount =
    runtime?.providers.filter((provider) => provider.hasAuth).length ?? 0;
  const settingsDefault = {
    provider: runtime?.settings.defaultProvider,
    modelId: runtime?.settings.defaultModelId,
  };
  const hasDefaultModel = Boolean(settingsDefault.provider && settingsDefault.modelId);
  const defaultModelUsable = isUsableSelection(settingsDefault, selectableSet);
  const hasCurrentSelection = Boolean(currentSelection.provider && currentSelection.modelId);
  const currentSelectionUsable = isUsableSelection(currentSelection, selectableSet);

  if (!hasSelectableModels) {
    return {
      hasSelectableModels: false,
      requiresModelSelection: true,
      unselectedModelLabel: t("settings.onboarding.noModels"),
      emptyModelTitle: t("settings.onboarding.noModels"),
      emptyModelDescription:
        connectedProviderCount > 0
          ? t("settings.onboarding.openModelsToEnable")
          : t("settings.onboarding.openProvidersToConnect"),
      notice:
        connectedProviderCount > 0
          ? {
              title: t("settings.onboarding.noModels"),
              description: t("settings.onboarding.allModelsDisabled"),
              actionLabel: t("settings.onboarding.openModels"),
              actionSection: "models",
            }
          : {
              title: t("settings.onboarding.noModels"),
              description: t("settings.onboarding.connectProviderFirst"),
              actionLabel: t("settings.onboarding.openProviders"),
              actionSection: "providers",
            },
    };
  }

  if (hasCurrentSelection && !currentSelectionUsable) {
    return {
      hasSelectableModels: true,
      requiresModelSelection: true,
      unselectedModelLabel: t("settings.onboarding.pickModel"),
      emptyModelTitle: t("settings.onboarding.noModels"),
      emptyModelDescription: t("settings.onboarding.pickModelDescription"),
      notice: {
        title: t("settings.onboarding.selectedUnavailable"),
        description: hasDefaultModel
          ? t("settings.onboarding.selectedUnavailableUpdateDefault")
          : t("settings.onboarding.selectedUnavailableChooseDefault"),
        actionLabel: t("settings.onboarding.openModels"),
        actionSection: "models",
      },
    };
  }

  if (!hasDefaultModel) {
    return {
      hasSelectableModels: true,
      requiresModelSelection: !currentSelectionUsable,
      unselectedModelLabel: t("settings.onboarding.pickModel"),
      emptyModelTitle: t("settings.onboarding.noDefault"),
      emptyModelDescription: t("settings.onboarding.pickModelDescription"),
      notice: currentSelectionUsable
        ? undefined
        : {
            title: t("settings.onboarding.noDefault"),
            description: t("settings.onboarding.setDefault"),
            actionLabel: t("settings.onboarding.openModels"),
            actionSection: "models",
          },
    };
  }

  if (!defaultModelUsable) {
    const defaultLabel = `${settingsDefault.provider}:${settingsDefault.modelId}`;
    return {
      hasSelectableModels: true,
      requiresModelSelection: !currentSelectionUsable,
      unselectedModelLabel: t("settings.onboarding.pickModel"),
      emptyModelTitle: t("settings.onboarding.defaultUnavailable"),
      emptyModelDescription: t("settings.onboarding.pickModelDescription"),
      notice: {
        title: t("settings.onboarding.defaultUnavailable"),
        description: currentSelectionUsable
          ? t("settings.onboarding.defaultUnavailableUpdate", { model: defaultLabel })
          : t("settings.onboarding.defaultUnavailableChoose", { model: defaultLabel }),
        actionLabel: t("settings.onboarding.openModels"),
        actionSection: "models",
      },
    };
  }

  return {
    hasSelectableModels: true,
    requiresModelSelection: false,
    unselectedModelLabel: t("settings.onboarding.pickModel"),
    emptyModelTitle: t("settings.onboarding.noModels"),
    emptyModelDescription: t("settings.onboarding.pickModelDescription"),
  };
}

function isUsableSelection(
  selection: ModelSelectionInput,
  selectableSet: ReadonlySet<string>,
): boolean {
  return Boolean(
    selection.provider &&
    selection.modelId &&
    selectableSet.has(`${selection.provider}:${selection.modelId}`),
  );
}
