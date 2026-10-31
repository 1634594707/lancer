import type { ComponentType, ReactNode } from "react";
import { BUILTIN_TOOL_KINDS, type BuiltinToolKind } from "../../../contracts/workbench";
import { t, type MessageKey } from "../../../contracts/i18n";
import { DiffIcon, FileIcon, TerminalIcon } from "../../ui/icons";

interface BuiltinToolDefinition {
  readonly label: string;
  /** Shown in the tool chooser. */
  readonly description: string;
  readonly Icon: ComponentType;
  /** Key that toggles the tool with the platform modifier, when it has one. */
  readonly shortcutKey?: string;
}

interface BuiltinToolSource {
  readonly labelKey: MessageKey;
  readonly descriptionKey: MessageKey;
  readonly Icon: ComponentType;
  readonly shortcutKey?: string;
}

const BUILTIN_TOOL_SOURCES = {
  files: {
    labelKey: "workbench.tool.files",
    descriptionKey: "workbench.tool.filesDescription",
    Icon: FileIcon,
  },
  changes: {
    labelKey: "workbench.tool.review",
    descriptionKey: "workbench.tool.reviewDescription",
    Icon: DiffIcon,
    shortcutKey: "R",
  },
  terminal: {
    labelKey: "workbench.tool.terminal",
    descriptionKey: "workbench.tool.terminalDescription",
    Icon: TerminalIcon,
    shortcutKey: "J",
  },
} as const satisfies Record<BuiltinToolKind, BuiltinToolSource>;

/** Labels translate when read, so the active locale applies at render time. */
function toDefinition(source: BuiltinToolSource): BuiltinToolDefinition {
  return {
    get label() {
      return t(source.labelKey);
    },
    get description() {
      return t(source.descriptionKey);
    },
    Icon: source.Icon,
    ...(source.shortcutKey ? { shortcutKey: source.shortcutKey } : {}),
  };
}

/** Presentation for every built-in tool; a missing kind fails the build. */
export const BUILTIN_TOOLS: Record<BuiltinToolKind, BuiltinToolDefinition> = {
  files: toDefinition(BUILTIN_TOOL_SOURCES.files),
  changes: toDefinition(BUILTIN_TOOL_SOURCES.changes),
  terminal: toDefinition(BUILTIN_TOOL_SOURCES.terminal),
};

/** Chooser order follows the contract's kind list. */
export const BUILTIN_TOOL_ENTRIES = BUILTIN_TOOL_KINDS.map(
  (kind): BuiltinToolDefinition & { readonly kind: BuiltinToolKind } => {
    const definition = BUILTIN_TOOLS[kind];
    return {
      kind,
      get label() {
        return definition.label;
      },
      get description() {
        return definition.description;
      },
      Icon: definition.Icon,
      ...(definition.shortcutKey ? { shortcutKey: definition.shortcutKey } : {}),
    };
  },
);

/** The composition root supplies one panel per built-in tool; rendered only while selected. */
type BuiltinToolPanels = Record<BuiltinToolKind, () => ReactNode>;

/** Requires a panel for every built-in kind, so a new tool cannot silently render nothing. */
export function renderBuiltinToolPanel(
  kind: BuiltinToolKind,
  panels: BuiltinToolPanels,
): ReactNode {
  return panels[kind]();
}
