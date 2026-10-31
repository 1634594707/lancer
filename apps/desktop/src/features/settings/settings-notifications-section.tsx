import type { DesktopNotificationPermissionStatus } from "../../../contracts/ipc";
import type { NotificationPreferences } from "../../../contracts/desktop-state";
import { t } from "../../../contracts/i18n";
import { SettingsSwitch } from "./settings-controls";
import { SettingsGroup, SettingsRow } from "./settings-utils";

interface SettingsNotificationsSectionProps {
  readonly notificationPreferences: NotificationPreferences;
  readonly notificationPermissionStatus: DesktopNotificationPermissionStatus;
  readonly notificationPermissionPending: boolean;
  readonly onSetNotificationPreferences: (preferences: Partial<NotificationPreferences>) => void;
  readonly onRequestNotificationPermission: () => void;
  readonly onOpenSystemNotificationSettings: () => void;
}

export function SettingsNotificationsSection({
  notificationPreferences,
  notificationPermissionStatus,
  notificationPermissionPending,
  onSetNotificationPreferences,
  onRequestNotificationPermission,
  onOpenSystemNotificationSettings,
}: SettingsNotificationsSectionProps) {
  const statusLabel = labelForPermissionStatus(notificationPermissionStatus);
  const statusDescription = descriptionForPermissionStatus(notificationPermissionStatus);
  const showAskMacOs = notificationPermissionStatus === "default";
  const showOpenSystemSettings = notificationPermissionStatus === "denied";
  const showRecoveryActions = showAskMacOs || showOpenSystemSettings;

  return (
    <>
      <SettingsGroup
        title={t("settings.notifications.system")}
        description={t("settings.notifications.systemDescription")}
      >
        <SettingsRow title={t("settings.notifications.access")} description={statusDescription}>
          <span className="settings-row__value">{statusLabel}</span>
        </SettingsRow>
        {showRecoveryActions ? (
          <SettingsRow
            title={t("settings.notifications.turnOn")}
            description={
              showAskMacOs
                ? t("settings.notifications.turnOnAskDescription")
                : t("settings.notifications.turnOnDeniedDescription")
            }
          >
            <div className="settings-row__actions">
              {showAskMacOs ? (
                <button
                  className="button button--secondary"
                  disabled={notificationPermissionPending}
                  type="button"
                  onClick={onRequestNotificationPermission}
                >
                  {t("settings.notifications.askMacOs")}
                </button>
              ) : null}
              {showOpenSystemSettings ? (
                <button
                  className="button button--secondary"
                  disabled={notificationPermissionPending}
                  type="button"
                  onClick={onOpenSystemNotificationSettings}
                >
                  {t("settings.notifications.openSystemSettings")}
                </button>
              ) : null}
            </div>
          </SettingsRow>
        ) : null}
      </SettingsGroup>

      <SettingsGroup
        title={t("settings.notifications.inApp")}
        description={t("settings.notifications.inAppDescription")}
      >
        <SettingsRow
          title={t("settings.notifications.backgroundCompletion")}
          description={t("settings.notifications.backgroundCompletionDescription")}
        >
          <SettingsSwitch
            checked={notificationPreferences.backgroundCompletion}
            label={t("settings.notifications.backgroundCompletion")}
            onChange={(checked) => onSetNotificationPreferences({ backgroundCompletion: checked })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("settings.notifications.backgroundFailure")}
          description={t("settings.notifications.backgroundFailureDescription")}
        >
          <SettingsSwitch
            checked={notificationPreferences.backgroundFailure}
            label={t("settings.notifications.backgroundFailure")}
            onChange={(checked) => onSetNotificationPreferences({ backgroundFailure: checked })}
          />
        </SettingsRow>
        <SettingsRow
          title={t("settings.notifications.attentionNeeded")}
          description={t("settings.notifications.attentionNeededDescription")}
        >
          <SettingsSwitch
            checked={notificationPreferences.attentionNeeded}
            label={t("settings.notifications.attentionNeeded")}
            onChange={(checked) => onSetNotificationPreferences({ attentionNeeded: checked })}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function labelForPermissionStatus(status: DesktopNotificationPermissionStatus): string {
  switch (status) {
    case "granted":
      return t("settings.notifications.statusGranted");
    case "denied":
      return t("settings.notifications.statusDenied");
    case "default":
      return t("settings.notifications.statusDefault");
    case "unsupported":
      return t("settings.notifications.statusUnsupported");
    default:
      return t("settings.notifications.statusChecking");
  }
}

function descriptionForPermissionStatus(status: DesktopNotificationPermissionStatus): string {
  switch (status) {
    case "granted":
      return t("settings.notifications.statusGrantedDescription");
    case "denied":
      return t("settings.notifications.statusDeniedDescription");
    case "default":
      return t("settings.notifications.statusDefaultDescription");
    case "unsupported":
      return t("settings.notifications.statusUnsupportedDescription");
    default:
      return t("settings.notifications.statusCheckingDescription");
  }
}
