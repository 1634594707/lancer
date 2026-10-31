import { resolveRuntimeCommands } from "../../../contracts/composer-commands";
import type {
  RuntimeCommandRecord,
  RuntimeProviderRecord,
  RuntimeSettingsSnapshot,
  RuntimeSnapshot,
} from "@lancer/session-driver/runtime-types";
import type { ExtensionCommandCompatibilityRecord } from "../../../contracts/desktop-state";
import { titleCase } from "../../lib/string-utils";
import { t, translate, type MessageKey } from "../../../contracts/i18n";

export type ComposerSlashCommandKind =
  | "runtime"
  | "model"
  | "thinking"
  | "tree"
  | "status"
  | "session"
  | "reload"
  | "compact"
  | "name"
  | "login"
  | "logout"
  | "settings"
  | "scoped-models";

export interface ComposerSlashCommand {
  readonly id: string;
  readonly kind: ComposerSlashCommandKind;
  readonly command: string;
  readonly template: string;
  readonly title: string;
  readonly description: string;
  readonly submitMode?: "immediate" | "prefill" | "pick-option";
  readonly section: "runtime" | "host";
  readonly runtimeCommand?: RuntimeCommandRecord;
  readonly sourceLabel?: string;
  readonly compatibility?: ExtensionCommandCompatibilityRecord;
}

export interface ComposerSlashCommandSection {
  readonly id: "runtime" | "host";
  readonly title?: string;
  readonly items: readonly ComposerSlashCommand[];
}

export interface ComposerSlashOption {
  readonly value: string;
  readonly label: string;
  readonly description: string;
}

export interface ComposerSlashOptionEmptyState {
  readonly title: string;
  readonly description: string;
}

export interface ComposerModelOption extends ComposerSlashOption {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ComposerProviderOption extends ComposerSlashOption {
  readonly providerId: string;
}

export function getModelOptionsEmptyTitle(): string {
  return t("composer.modelOptionsEmptyTitle");
}

export function getModelOptionsEmptyDescription(): string {
  return t("composer.modelOptionsEmptyDescription");
}

const HOST_COMMAND_TITLE_KEYS = new Map<string, MessageKey>();

function hostCommand(
  kind: Exclude<ComposerSlashCommandKind, "runtime">,
  titleKey: MessageKey,
  descriptionKey: MessageKey,
  submitMode: NonNullable<ComposerSlashCommand["submitMode"]>,
  templateSuffixKey?: MessageKey,
): ComposerSlashCommand {
  const id = `host:${kind}`;
  const command = `/${kind}`;
  HOST_COMMAND_TITLE_KEYS.set(id, titleKey);
  return {
    id,
    kind,
    command,
    get template() {
      return templateSuffixKey ? `${command} ${t(templateSuffixKey)}` : command;
    },
    get title() {
      return t(titleKey);
    },
    get description() {
      return t(descriptionKey);
    },
    submitMode,
    section: "host",
  };
}

const HOST_ACTION_SLASH_COMMANDS: readonly ComposerSlashCommand[] = [
  hostCommand(
    "model",
    "composer.slash.modelTitle",
    "composer.slash.modelDescription",
    "pick-option",
  ),
  hostCommand(
    "thinking",
    "composer.slash.thinkingTitle",
    "composer.slash.thinkingDescription",
    "pick-option",
  ),
  hostCommand("tree", "composer.slash.treeTitle", "composer.slash.treeDescription", "immediate"),
  hostCommand(
    "status",
    "composer.slash.statusTitle",
    "composer.slash.statusDescription",
    "immediate",
  ),
  hostCommand(
    "login",
    "composer.slash.loginTitle",
    "composer.slash.loginDescription",
    "pick-option",
  ),
  hostCommand(
    "logout",
    "composer.slash.logoutTitle",
    "composer.slash.logoutDescription",
    "pick-option",
  ),
  hostCommand(
    "settings",
    "composer.slash.settingsTitle",
    "composer.slash.settingsDescription",
    "immediate",
  ),
  hostCommand(
    "scoped-models",
    "composer.slash.scopedModelsTitle",
    "composer.slash.scopedModelsDescription",
    "immediate",
  ),
  hostCommand(
    "session",
    "composer.slash.sessionTitle",
    "composer.slash.sessionDescription",
    "immediate",
  ),
  hostCommand(
    "name",
    "composer.slash.nameTitle",
    "composer.slash.nameDescription",
    "prefill",
    "composer.slash.nameTemplate",
  ),
  hostCommand(
    "compact",
    "composer.slash.compactTitle",
    "composer.slash.compactDescription",
    "immediate",
  ),
  hostCommand(
    "reload",
    "composer.slash.reloadTitle",
    "composer.slash.reloadDescription",
    "immediate",
  ),
];

function thinkingOption(
  value: string,
  labelKey: MessageKey,
  descriptionKey: MessageKey,
): ComposerSlashOption {
  return {
    value,
    get label() {
      return t(labelKey);
    },
    get description() {
      return t(descriptionKey);
    },
  };
}

export const THINKING_OPTIONS: readonly ComposerSlashOption[] = [
  thinkingOption("low", "composer.thinking.low", "composer.thinking.lowDescription"),
  thinkingOption("medium", "composer.thinking.medium", "composer.thinking.mediumDescription"),
  thinkingOption("high", "composer.thinking.high", "composer.thinking.highDescription"),
  thinkingOption("xhigh", "composer.thinking.xhigh", "composer.thinking.xhighDescription"),
  thinkingOption("max", "composer.thinking.max", "composer.thinking.maxDescription"),
];

export function buildSlashCommandSections(
  query: string,
  runtime: RuntimeSnapshot | undefined,
  sessionCommands: readonly RuntimeCommandRecord[],
  compatibilityRecords: readonly ExtensionCommandCompatibilityRecord[] = [],
  options: {
    readonly allowTreeCommand?: boolean;
  } = {},
): readonly ComposerSlashCommandSection[] {
  const normalizedQuery = query.trim().toLowerCase();
  const availableRuntimeCommands = resolveRuntimeCommands(runtime, sessionCommands);
  const compatibilityByKey = new Map(
    compatibilityRecords.map(
      (record) => [`${record.extensionPath}::${record.commandName}`, record] as const,
    ),
  );
  const runtimeMatches = availableRuntimeCommands
    .map<ComposerSlashCommand>((command) => ({
      id: `runtime:${command.source}:${command.name}`,
      kind: "runtime",
      command: `/${command.name}`,
      template: `/${command.name} `,
      title: formatRuntimeCommandTitle(command),
      description: formatRuntimeCommandDescription(command),
      submitMode: "prefill",
      section: "runtime",
      runtimeCommand: command,
      sourceLabel: formatRuntimeSourceLabel(command),
      compatibility: compatibilityByKey.get(`${command.sourceInfo.path}::${command.name}`),
    }))
    .filter((command) => matchesCommand(command, normalizedQuery));
  const allowTreeCommand = options.allowTreeCommand ?? true;
  const hostMatches = HOST_ACTION_SLASH_COMMANDS.filter(
    (command) =>
      (allowTreeCommand || command.kind !== "tree") && matchesCommand(command, normalizedQuery),
  );

  // Prefer a host action when it is a prefix match and runtime skills only
  // match fuzzily. Otherwise an installed skill such as `observe-state` can
  // steal `/stat` from the built-in `/status` command on Tab.
  const hostHasPrefixMatch = hostMatches.some((command) =>
    command.command.toLowerCase().startsWith(normalizedQuery),
  );
  const runtimeHasPrefixMatch = runtimeMatches.some((command) =>
    command.command.toLowerCase().startsWith(normalizedQuery),
  );
  const runtimeSection: ComposerSlashCommandSection = {
    id: "runtime",
    title: runtimeMatches.length > 0 ? t("composer.slash.runtimeCommands") : undefined,
    items: runtimeMatches,
  };
  const hostSection: ComposerSlashCommandSection = {
    id: "host",
    title: hostMatches.length > 0 ? t("composer.slash.hostActions") : undefined,
    items: hostMatches,
  };
  const sections: ComposerSlashCommandSection[] =
    hostHasPrefixMatch && !runtimeHasPrefixMatch
      ? [hostSection, runtimeSection]
      : [runtimeSection, hostSection];

  return sections.filter((section) => section.items.length > 0);
}

export function flattenSlashSections(
  sections: readonly ComposerSlashCommandSection[],
): readonly ComposerSlashCommand[] {
  return sections.flatMap((section) => section.items);
}

export function buildProviderOptions(
  providers: readonly RuntimeProviderRecord[],
  filter: (provider: RuntimeProviderRecord) => boolean = () => true,
): readonly ComposerProviderOption[] {
  return providers
    .filter(filter)
    .sort(compareProviders)
    .map((provider) => ({
      value: provider.id,
      label: provider.name,
      description: describeProvider(provider),
      providerId: provider.id,
    }));
}

export function buildModelOptions(
  runtime: RuntimeSnapshot | undefined,
): readonly ComposerModelOption[] {
  if (!runtime) {
    return [];
  }

  const enabledPatterns = runtime.settings.enabledModelPatterns;
  const allAvailable = enabledPatterns.length === 0;
  const enabledSet = allAvailable ? undefined : new Set(enabledPatterns);

  return [...runtime.models]
    .filter((model) => {
      if (!model.available) return false;
      if (!enabledSet) return true;
      return enabledSet.has(`${model.providerId}/${model.modelId}`);
    })
    .sort((left: RuntimeSnapshot["models"][number], right: RuntimeSnapshot["models"][number]) => {
      const providerCompare =
        providerRankForId(runtime.providers, left.providerId) -
        providerRankForId(runtime.providers, right.providerId);
      if (providerCompare !== 0) {
        return providerCompare;
      }
      return `${left.providerName} ${left.label}`.localeCompare(
        `${right.providerName} ${right.label}`,
      );
    })
    .map((model: RuntimeSnapshot["models"][number]) => ({
      value: model.modelId,
      label: `${model.providerName} · ${model.label}`,
      description: model.modelId,
      providerId: model.providerId,
      modelId: model.modelId,
    }));
}

export function slashOptionsForCommand(
  command: ComposerSlashCommand | undefined,
  runtime?: RuntimeSnapshot,
): readonly ComposerSlashOption[] {
  if (!command) {
    return [];
  }

  if (command.kind === "thinking") {
    return THINKING_OPTIONS;
  }
  if (command.kind === "model") {
    return buildModelOptions(runtime);
  }
  if (command.kind === "login") {
    return buildProviderOptions(runtime?.providers ?? [], (provider) => provider.oauthSupported);
  }
  if (command.kind === "logout") {
    return buildProviderOptions(
      runtime?.providers ?? [],
      (provider) => provider.authSource === "oauth" || provider.authSource === "auth_file",
    );
  }

  return [];
}

export function slashOptionEmptyState(
  command: ComposerSlashCommand | undefined,
  runtime?: RuntimeSnapshot,
): ComposerSlashOptionEmptyState | undefined {
  if (!command) {
    return undefined;
  }

  if (command.kind === "model" && buildModelOptions(runtime).length === 0) {
    return {
      title: getModelOptionsEmptyTitle(),
      description: getModelOptionsEmptyDescription(),
    };
  }

  return undefined;
}

function matchesCommand(command: ComposerSlashCommand, normalizedQuery: string): boolean {
  if (!normalizedQuery.startsWith("/")) {
    return false;
  }

  if (normalizedQuery === "/") {
    return true;
  }

  const queryWithoutSlash = normalizedQuery.replace(/^\/+/, "").trim();
  const rawSearchTerms = [command.command.toLowerCase()];
  const aliasSearchTerms = buildSlashSearchAliases(command);
  if (rawSearchTerms.some((value) => value.includes(normalizedQuery))) {
    return true;
  }

  if (!queryWithoutSlash) {
    return false;
  }

  return aliasSearchTerms.some((value) => value.includes(queryWithoutSlash));
}

function buildSlashSearchAliases(command: ComposerSlashCommand): readonly string[] {
  const aliases = new Set<string>([
    command.command.replace(/^\/+/, "").toLowerCase(),
    command.title.toLowerCase(),
    command.sourceLabel?.toLowerCase() ?? "",
    command.compatibility?.status === "terminal-only" ? "terminal-only" : "",
  ]);

  const hostTitleKey = HOST_COMMAND_TITLE_KEYS.get(command.id);
  if (hostTitleKey) {
    aliases.add(translate("en", hostTitleKey).toLowerCase());
  }

  if (command.runtimeCommand) {
    aliases.add(command.runtimeCommand.name.toLowerCase());
    aliases.add(command.runtimeCommand.name.replace(/^skill:/, "").toLowerCase());
  }

  return [...aliases].filter(Boolean);
}

function describeProvider(provider: RuntimeProviderRecord): string {
  if (provider.authSource === "oauth") {
    return t("composer.provider.oauthConnected");
  }
  if (provider.authSource === "auth_file") {
    return t("composer.provider.savedApiKey");
  }
  if (provider.authSource === "env") {
    return t("composer.provider.envConfigured");
  }
  if (provider.authSource === "external") {
    return t("composer.provider.externalConfigured");
  }
  if (provider.oauthSupported) {
    return t("composer.provider.oauthAvailable");
  }
  if (provider.apiKeySetupSupported) {
    return t("composer.provider.needsApiKey");
  }
  return t("composer.provider.available");
}

function compareProviders(left: RuntimeProviderRecord, right: RuntimeProviderRecord): number {
  const leftRank = providerRank(left);
  const rightRank = providerRank(right);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  return left.name.localeCompare(right.name);
}

function providerRank(provider: RuntimeProviderRecord): number {
  if (provider.hasAuth) {
    return 0;
  }
  if (provider.id === "openai-codex" || provider.id === "anthropic") {
    return 1;
  }
  if (provider.oauthSupported) {
    return 2;
  }
  return 3;
}

function providerRankForId(
  providers: readonly RuntimeProviderRecord[],
  providerId: string,
): number {
  const provider = providers.find((entry) => entry.id === providerId);
  return provider ? providerRank(provider) : 99;
}

function summarizeSkillDescription(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return t("composer.slash.reusableWorkflow");
  }

  const firstSentence = trimmed.match(/^[^.!?]+[.!?]?/)?.[0]?.trim() ?? trimmed;
  return firstSentence.length > 96 ? `${firstSentence.slice(0, 93).trimEnd()}...` : firstSentence;
}

function formatRuntimeCommandTitle(command: RuntimeCommandRecord): string {
  if (command.source === "skill" && command.name.startsWith("skill:")) {
    return titleCase(command.name.slice("skill:".length));
  }
  return titleCase(command.name.replace(/[:_-]+/g, " "));
}

function formatRuntimeCommandDescription(command: RuntimeCommandRecord): string {
  if (command.description?.trim()) {
    return command.description.trim();
  }
  if (command.source === "prompt") {
    return t("composer.slash.promptTemplate");
  }
  if (command.source === "skill") {
    return t("composer.slash.skillCommand");
  }
  return t("composer.slash.extensionCommand");
}

function formatRuntimeSourceLabel(command: RuntimeCommandRecord): string {
  if (command.source === "skill") {
    return t("composer.slash.sourceSkill");
  }
  if (command.source === "prompt") {
    return t("composer.slash.sourcePrompt");
  }
  return command.sourceInfo.source.replace(/^extension:/, "");
}

export function isExactSlashCommand(query: string, command: ComposerSlashCommand): boolean {
  return query.trim().toLowerCase() === command.command.toLowerCase();
}

export function parseTreeComposerCommand(
  value: string,
): { readonly type: "tree" } | { readonly type: "error"; readonly message: string } | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const [command, ...rest] = trimmed.split(/\s+/);
  if (command !== "/tree") {
    return undefined;
  }

  if (rest.length > 0) {
    return {
      type: "error",
      message: t("composer.slash.treeNoArguments"),
    };
  }

  return { type: "tree" };
}
