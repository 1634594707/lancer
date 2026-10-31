import type { ReactNode } from "react";
import { t } from "../../../contracts/i18n";
import {
  BellIcon,
  KeyboardIcon,
  ModelIcon,
  PlugIcon,
  SettingsIcon,
  SkillIcon,
  SunIcon,
} from "../../ui/icons";

export interface SettingsSectionDefinition {
  readonly id: string;
  readonly title: string;
  readonly group: string;
  readonly icon: ReactNode;
  /** Words people search for that are not in the title, such as the page's row titles. */
  readonly keywords: readonly string[];
  readonly description: (workspaceName: string) => string;
  /** Pages that read or write one workspace's runtime. */
  readonly needsWorkspace: boolean;
}

/** Nav order: grouped the way Codex groups its settings, one entry per page. */
export const SETTINGS_SECTIONS = [
  {
    id: "general",
    get title() {
      return t("settings.section.general");
    },
    get group() {
      return t("settings.group.app");
    },
    icon: <SettingsIcon />,
    keywords: [
      "general",
      "model settings scope",
      "per repo",
      "skill slash commands",
      "terminal",
      "shell",
      "通用",
      "模型设置范围",
      "按仓库",
      "技能斜杠命令",
      "终端",
      "语言",
    ],
    description: () => t("settings.section.generalDescription"),
    needsWorkspace: false,
  },
  {
    id: "appearance",
    get title() {
      return t("settings.section.appearance");
    },
    get group() {
      return t("settings.group.app");
    },
    icon: <SunIcon />,
    keywords: [
      "appearance",
      "theme",
      "light",
      "dark",
      "system",
      "preset",
      "colors",
      "transparency",
      "外观",
      "主题",
      "浅色",
      "深色",
      "跟随系统",
      "配色",
      "颜色",
      "透明",
    ],
    description: () => t("settings.section.appearanceDescription"),
    needsWorkspace: false,
  },
  {
    id: "notifications",
    get title() {
      return t("settings.section.notifications");
    },
    get group() {
      return t("settings.group.app");
    },
    icon: <BellIcon />,
    keywords: [
      "notifications",
      "alerts",
      "background",
      "completion",
      "failures",
      "approval",
      "macos",
      "通知",
      "提醒",
      "后台",
      "完成",
      "失败",
      "批准",
    ],
    description: () => t("settings.section.notificationsDescription"),
    needsWorkspace: false,
  },
  {
    id: "shortcuts",
    get title() {
      return t("settings.section.shortcuts");
    },
    get group() {
      return t("settings.group.app");
    },
    icon: <KeyboardIcon />,
    keywords: [
      "keyboard shortcuts",
      "keys",
      "hotkeys",
      "keybindings",
      "快捷键",
      "键盘",
      "按键",
      "键位",
    ],
    description: () => t("settings.section.shortcutsDescription"),
    needsWorkspace: false,
  },
  {
    id: "providers",
    get title() {
      return t("settings.section.providers");
    },
    get group() {
      return t("settings.group.agent");
    },
    icon: <PlugIcon />,
    keywords: [
      "providers",
      "login",
      "logout",
      "oauth",
      "api key",
      "auth",
      "custom endpoint",
      "模型与账号",
      "提供商",
      "账号",
      "登录",
      "退出登录",
      "API 密钥",
      "认证",
      "自定义端点",
    ],
    description: (workspaceName) =>
      t("settings.section.providersDescription", { workspace: workspaceName }),
    needsWorkspace: true,
  },
  {
    id: "models",
    get title() {
      return t("settings.section.models");
    },
    get group() {
      return t("settings.group.agent");
    },
    icon: <ModelIcon />,
    keywords: [
      "models",
      "default model",
      "reasoning",
      "thinking",
      "enabled models",
      "模型",
      "默认模型",
      "推理",
      "思考强度",
      "已启用的模型",
    ],
    description: () => t("settings.section.modelsDescription"),
    needsWorkspace: true,
  },
] as const satisfies readonly SettingsSectionDefinition[];

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Skills and extensions live in the settings nav but are their own app views. */
export const CUSTOMIZE_SECTION_ID = "customize";

export const SETTINGS_NAV_ITEMS = [
  ...SETTINGS_SECTIONS,
  {
    id: CUSTOMIZE_SECTION_ID,
    get title() {
      return t("settings.section.customize");
    },
    get group() {
      return t("settings.group.customize");
    },
    icon: <SkillIcon />,
    keywords: [
      "skills and extensions",
      "skills",
      "extensions",
      "plugins",
      "slash commands",
      "tools",
      "技能与扩展",
      "技能",
      "扩展",
      "插件",
      "斜杠命令",
      "工具",
      "自定义",
    ],
  },
] as const;

export function settingsSectionDefinition(section: SettingsSection): SettingsSectionDefinition {
  return SETTINGS_SECTIONS.find((definition) => definition.id === section) ?? SETTINGS_SECTIONS[0];
}

export function sectionTitle(section: SettingsSection): string {
  return settingsSectionDefinition(section).title;
}
