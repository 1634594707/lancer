import type { ThemeMode, ThemePresetId } from "../../../contracts/desktop-state";
import { t, type MessageKey } from "../../../contracts/i18n";
import { SettingsSelect, SettingsSwitch } from "./settings-controls";
import { SettingsGroup, SettingsRow } from "./settings-utils";
import type { CSSProperties } from "react";
import { themePreset, themePresets, themeSwatches, themeTokensFor } from "../../../contracts/theme";
import { useActiveTheme } from "../../ui/active-theme";

interface SettingsAppearanceSectionProps {
  readonly themeMode: ThemeMode;
  readonly themePresetId: ThemePresetId;
  readonly onSetThemeMode: (mode: ThemeMode) => void;
  readonly onSetThemePresetId: (presetId: ThemePresetId) => void;
  readonly enableTransparency: boolean;
  readonly onSetEnableTransparency: (enabled: boolean) => void;
}

const THEME_MODES: readonly { readonly mode: ThemeMode; readonly labelKey: MessageKey }[] = [
  { mode: "system", labelKey: "settings.appearance.modeSystem" },
  { mode: "light", labelKey: "settings.appearance.modeLight" },
  { mode: "dark", labelKey: "settings.appearance.modeDark" },
];

export function SettingsAppearanceSection({
  themeMode,
  themePresetId,
  onSetThemeMode,
  onSetThemePresetId,
  enableTransparency,
  onSetEnableTransparency,
}: SettingsAppearanceSectionProps) {
  const activePreset = themePreset(themePresetId);
  const { variant } = useActiveTheme();
  return (
    <>
      <SettingsGroup title={t("settings.appearance.theme")} plain>
        <div
          aria-label={t("settings.appearance.theme")}
          className="theme-mode-tiles"
          role="radiogroup"
          style={tilePalette(themePresetId)}
        >
          {THEME_MODES.map((option) => (
            <label className="theme-mode-tile" key={option.mode}>
              <input
                checked={themeMode === option.mode}
                name="theme-mode"
                type="radio"
                onChange={() => onSetThemeMode(option.mode)}
              />
              <span
                aria-hidden="true"
                className={`theme-mode-tile__preview theme-mode-tile__preview--${option.mode}`}
              >
                <span className="theme-mode-tile__window">
                  <span className="theme-mode-tile__line theme-mode-tile__line--title" />
                  <span className="theme-mode-tile__line" />
                  <span className="theme-mode-tile__line" />
                </span>
              </span>
              <span className="theme-mode-tile__label">{t(option.labelKey)}</span>
            </label>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow
          title={t("settings.appearance.colorPreset")}
          description={activePreset.description}
        >
          <span className="settings-preset-control">
            <span aria-hidden="true" className="settings-preset-swatches">
              {themeSwatches(themePresetId, variant).map((swatch, index) => (
                <span key={index} style={{ background: swatch }} />
              ))}
            </span>
            <SettingsSelect
              label={t("settings.appearance.colorPreset")}
              options={themePresets.map((preset) => ({ value: preset.id, label: preset.name }))}
              value={themePresetId}
              onChange={onSetThemePresetId}
            />
          </span>
        </SettingsRow>
        <SettingsRow
          title={t("settings.appearance.transparency")}
          description={t("settings.appearance.transparencyDescription")}
        >
          <SettingsSwitch
            checked={enableTransparency}
            label={t("settings.appearance.transparency")}
            onChange={onSetEnableTransparency}
          />
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

function tilePalette(presetId: ThemePresetId): CSSProperties {
  const light = themeTokensFor(presetId, "light");
  const dark = themeTokensFor(presetId, "dark");
  return {
    "--tile-light-bg": light["--sidebar"],
    "--tile-light-window": light["--main"],
    "--tile-light-line": light["--line-strong"],
    "--tile-dark-bg": dark["--sidebar"],
    "--tile-dark-window": dark["--main"],
    "--tile-dark-line": dark["--line-strong"],
  } as CSSProperties;
}
