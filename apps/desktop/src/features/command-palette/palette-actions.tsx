import type { ReactNode } from "react";
import { t, translate, type MessageKey, type MessageParams } from "../../../contracts/i18n";
import { formatShortcut } from "../../../contracts/ipc";
import type { BuiltinToolKind } from "../../../contracts/workbench";
import type { ThreadAction } from "../threads/thread-actions";
import { BUILTIN_TOOL_ENTRIES } from "../workbench/builtin-tools";
import type { SettingsSection } from "../settings/settings-view";
import {
  ClockIcon,
  ExtensionIcon,
  FileIcon,
  FolderIcon,
  ModelIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SidebarToggleIcon,
  SidePanelIcon,
  SkillIcon,
} from "../../ui/icons";

export type PaletteMode = "commands" | "files" | "models";

export interface PaletteAction {
  readonly id: string;
  readonly title: string;
  /** The English title, matched by search as well when the UI is translated. */
  readonly searchTitle?: string;
  readonly icon: ReactNode;
  readonly hint?: string;
  /** Actions that open another palette list keep the palette open. */
  readonly keepsOpen?: boolean;
  readonly run: () => void;
}

/** "Settings" itself opens General. */
const SETTINGS_SECTIONS: readonly (readonly [SettingsSection, MessageKey])[] = [
  ["appearance", "extensions.palette.settingsAppearance"],
  ["notifications", "extensions.palette.settingsNotifications"],
  ["shortcuts", "extensions.palette.settingsShortcuts"],
  ["providers", "extensions.palette.settingsProviders"],
  ["models", "extensions.palette.settingsModels"],
];

const TOGGLE_TOOL_TITLES: Readonly<Record<BuiltinToolKind, MessageKey>> = {
  files: "extensions.palette.toggleFiles",
  changes: "extensions.palette.toggleChanges",
  terminal: "extensions.palette.toggleTerminal",
};

function titled(
  key: MessageKey,
  params?: MessageParams,
): { readonly title: string; readonly searchTitle: string } {
  return { title: t(key, params), searchTitle: translate("en", key, params) };
}

/** What the app can do right now; an action is listed only when it would work. */
export interface PaletteActionContext {
  readonly platform: NodeJS.Platform;
  readonly hasWorkspace: boolean;
  /** A thread is open in the main pane, with the actions its menus show. */
  readonly thread?: {
    readonly canSwitchModel: boolean;
    readonly actions: readonly ThreadAction[];
  };
  readonly canToggleSidebar: boolean;
  readonly newThread: () => void;
  readonly openFolder: () => void;
  readonly openSettings: (section: SettingsSection) => void;
  readonly openSkills: () => void;
  readonly openExtensions: () => void;
  readonly openScheduledTasks: () => void;
  readonly toggleSidebar: () => void;
  /** Shows the tool in the side panel, or hides the panel when that tool is already showing. */
  readonly toggleTool: (kind: BuiltinToolKind) => void;
  readonly toggleSidePanel: () => void;
  /** Extension views the side panel can open for this thread. */
  readonly extensionViews: readonly {
    readonly id: string;
    readonly title: string;
    readonly open: () => void;
  }[];
  readonly findInThread: () => void;
  readonly openPaletteMode: (mode: PaletteMode) => void;
}

export function buildPaletteActions(context: PaletteActionContext): readonly PaletteAction[] {
  const { platform, thread } = context;
  const actions: PaletteAction[] = [];
  if (context.hasWorkspace) {
    actions.push({
      id: "new-thread",
      ...titled("extensions.palette.newThread"),
      icon: <PlusIcon />,
      hint: formatShortcut(platform, "N"),
      run: context.newThread,
    });
  }
  actions.push({
    id: "open-folder",
    ...titled("extensions.palette.openFolder"),
    icon: <FolderIcon />,
    run: context.openFolder,
  });
  if (thread) {
    actions.push(
      {
        id: "go-to-file",
        ...titled("extensions.palette.goToFile"),
        icon: <FileIcon />,
        hint: formatShortcut(platform, "P"),
        keepsOpen: true,
        run: () => context.openPaletteMode("files"),
      },
      {
        id: "find-in-thread",
        ...titled("extensions.palette.findInThread"),
        icon: <SearchIcon />,
        hint: formatShortcut(platform, "F"),
        run: context.findInThread,
      },
    );
    if (thread.canSwitchModel) {
      actions.push({
        id: "switch-model",
        ...titled("extensions.palette.switchModel"),
        icon: <ModelIcon />,
        keepsOpen: true,
        run: () => context.openPaletteMode("models"),
      });
    }
    for (const { kind, Icon, shortcutKey } of BUILTIN_TOOL_ENTRIES) {
      actions.push({
        id: `toggle-${kind}`,
        ...titled(TOGGLE_TOOL_TITLES[kind]),
        icon: <Icon />,
        hint: shortcutKey ? formatShortcut(platform, shortcutKey) : undefined,
        run: () => context.toggleTool(kind),
      });
    }
    actions.push({
      id: "toggle-side-panel",
      ...titled("extensions.palette.toggleSidePanel"),
      icon: <SidePanelIcon />,
      hint: formatShortcut(platform, "B", { alt: true }),
      run: context.toggleSidePanel,
    });
    for (const view of context.extensionViews) {
      actions.push({
        id: `extension-view:${view.id}`,
        ...titled("extensions.palette.openExtensionView", { title: view.title }),
        icon: <ExtensionIcon />,
        run: view.open,
      });
    }
    actions.push(...thread.actions);
  }
  if (context.canToggleSidebar) {
    actions.push({
      id: "toggle-sidebar",
      ...titled("extensions.palette.toggleSidebar"),
      icon: <SidebarToggleIcon />,
      hint: formatShortcut(platform, "B"),
      run: context.toggleSidebar,
    });
  }
  actions.push({
    id: "scheduled-tasks",
    ...titled("extensions.palette.scheduledTasks"),
    icon: <ClockIcon />,
    run: context.openScheduledTasks,
  });
  if (context.hasWorkspace) {
    actions.push(
      {
        id: "skills",
        ...titled("extensions.palette.skills"),
        icon: <SkillIcon />,
        run: context.openSkills,
      },
      {
        id: "extensions",
        ...titled("extensions.palette.extensions"),
        icon: <ExtensionIcon />,
        run: context.openExtensions,
      },
    );
  }
  actions.push({
    id: "settings",
    ...titled("extensions.palette.settings"),
    icon: <SettingsIcon />,
    hint: formatShortcut(platform, ","),
    run: () => context.openSettings("general"),
  });
  for (const [section, titleKey] of SETTINGS_SECTIONS) {
    actions.push({
      id: `settings-${section}`,
      ...titled(titleKey),
      icon: <SettingsIcon />,
      run: () => context.openSettings(section),
    });
  }
  return actions;
}
