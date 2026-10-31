import type { ReactNode } from "react";
import type {
  RuntimeSettingsSnapshot,
  RuntimeSnapshot,
} from "@lancer/session-driver/runtime-types";
import { hasMessage, t } from "../../../contracts/i18n";

export const THINKING_LEVELS: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

export function labelForThinking(
  level: NonNullable<RuntimeSettingsSnapshot["defaultThinkingLevel"]>,
): string {
  const key = `models.thinking.${level}`;
  if (hasMessage(key)) {
    return t(key);
  }
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function filterProviders(
  providers: readonly RuntimeSnapshot["providers"][number][],
  query: string,
): readonly RuntimeSnapshot["providers"][number][] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return providers;
  }
  return providers.filter((provider) =>
    [provider.id, provider.name, provider.authType].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

export function filterModels(
  models: readonly RuntimeSnapshot["models"][number][],
  query: string,
): readonly RuntimeSnapshot["models"][number][] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return models;
  }
  return models.filter((model) =>
    [model.providerId, model.providerName, model.modelId, model.label].some((value) =>
      value.toLowerCase().includes(normalized),
    ),
  );
}

/* ── Layout components ────────────────────────────────── */

export function SettingsGroup({
  title,
  description,
  plain = false,
  children,
}: {
  readonly title?: string;
  readonly description?: string;
  /** Lay children out without the rounded card, for tiles and other custom content. */
  readonly plain?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="settings-section">
      {title ? <h3 className="settings-section__title">{title}</h3> : null}
      {description ? <p className="settings-section__description">{description}</p> : null}
      {plain ? children : <div className="settings-group">{children}</div>}
    </div>
  );
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        <div className="settings-row__title">{title}</div>
        {description ? <div className="settings-row__description">{description}</div> : null}
      </div>
      {children ? <div className="settings-row__control">{children}</div> : null}
    </div>
  );
}

type ProviderRecord = RuntimeSnapshot["providers"][number];

interface ProviderAction {
  readonly disabled: boolean;
  readonly label: string;
  readonly primary?: boolean;
  readonly onClick?: () => void;
}

export function ProviderRow({
  provider,
  description,
  onLoginProvider,
  onLogoutProvider,
  onConfigureApiKey,
}: {
  readonly provider: ProviderRecord;
  /** Extra guidance shown under the status, e.g. which subscription a sign-in uses. */
  readonly description?: string;
  readonly onLoginProvider: (providerId: string) => void;
  readonly onLogoutProvider: (providerId: string) => void;
  readonly onConfigureApiKey: (provider: ProviderRecord) => void;
}) {
  const actions = resolveProviderActions(
    provider,
    onLoginProvider,
    onLogoutProvider,
    onConfigureApiKey,
  );
  return (
    <div className="settings-row" data-provider-id={provider.id}>
      <div className="settings-row__label">
        <div className="settings-row__title">{provider.name}</div>
        <div className="settings-row__description">{describeProviderStatus(provider)}</div>
        {description ? (
          <div className="settings-row__description settings-row__hint">{description}</div>
        ) : null}
      </div>
      {actions.length > 0 ? (
        <div className="settings-row__control settings-row__control--actions">
          {actions.map((action) => (
            <button
              className={action.primary ? "button" : "button button--secondary"}
              disabled={action.disabled}
              key={action.label}
              type="button"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function describeProviderStatus(provider: ProviderRecord): string {
  switch (provider.authSource) {
    case "oauth":
      return t("providers.status.oauth");
    case "auth_file":
      return t("providers.status.authFile");
    case "env":
      return t("providers.status.env");
    case "external":
      return provider.hasAuth
        ? t("providers.status.externalConnected")
        : t("providers.status.external");
    default:
      if (provider.oauthSupported && provider.apiKeySetupSupported) {
        return t("providers.status.oauthAndKey");
      }
      if (provider.oauthSupported) {
        return t("providers.status.oauthAvailable");
      }
      if (provider.apiKeySetupSupported) {
        return t("providers.status.apiKey");
      }
      return provider.authType === "api_key"
        ? t("providers.status.apiKey")
        : t("providers.status.builtIn");
  }
}

function resolveProviderActions(
  provider: ProviderRecord,
  onLoginProvider: (providerId: string) => void,
  onLogoutProvider: (providerId: string) => void,
  onConfigureApiKey: (provider: ProviderRecord) => void,
): readonly ProviderAction[] {
  if (provider.authSource === "oauth") {
    return [
      {
        disabled: false,
        label: t("providers.action.logout"),
        onClick: () => onLogoutProvider(provider.id),
      },
    ];
  }

  const actions: ProviderAction[] = [];
  if (provider.oauthSupported && provider.authSource === "none") {
    actions.push({
      disabled: false,
      label: t("providers.action.login"),
      primary: true,
      onClick: () => onLoginProvider(provider.id),
    });
  }

  if (
    provider.apiKeySetupSupported &&
    (provider.authSource === "none" || provider.authSource === "auth_file")
  ) {
    actions.push({
      disabled: false,
      label:
        provider.authSource === "auth_file"
          ? t("providers.action.manage")
          : t("providers.action.setApiKey"),
      onClick: () => onConfigureApiKey(provider),
    });
  }

  if (actions.length > 0) {
    return actions;
  }

  if (provider.authSource === "env" || provider.authSource === "external") {
    return [];
  }

  return [{ disabled: true, label: t("providers.action.configureExternally") }];
}
