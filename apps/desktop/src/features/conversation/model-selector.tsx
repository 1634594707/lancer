import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { RuntimeSnapshot } from "@lancer/session-driver/runtime-types";
import { buildModelOptions, THINKING_OPTIONS, type ComposerModelOption } from "./composer-commands";
import { t } from "../../../contracts/i18n";

interface ModelSelectorProps {
  readonly onSelectDoubaoApp?: () => void;
  readonly runtime: RuntimeSnapshot | undefined;
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
  readonly thinkingLevel: string | undefined;
  readonly disabled?: boolean;
  readonly dropdownPlacement?: "above" | "below";
  readonly showEmptyModelControl?: boolean;
  readonly unselectedModelLabel?: string;
  readonly emptyModelLabel?: string;
  readonly emptyModelTitle?: string;
  /** Larger badge that shows the friendly model name, for the thread header. */
  readonly variant?: "compact" | "prominent";
  /** Explains why the control is disabled, e.g. while a turn is running. */
  readonly disabledReason?: string;
  readonly onSetModel: (provider: string, modelId: string) => void;
  readonly onSetThinking: (level: string) => void;
}

type OpenDropdown = "none" | "model" | "thinking";

export function ModelSelector({
  runtime,
  onSelectDoubaoApp,
  provider,
  modelId,
  thinkingLevel,
  disabled,
  dropdownPlacement = "above",
  showEmptyModelControl = false,
  unselectedModelLabel,
  emptyModelLabel,
  emptyModelTitle,
  variant = "compact",
  disabledReason,
  onSetModel,
  onSetThinking,
}: ModelSelectorProps) {
  const [open, setOpen] = useState<OpenDropdown>("none");
  const [modelFilter, setModelFilter] = useState("");
  const menuId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const modelOptions = useMemo(() => buildModelOptions(runtime), [runtime]);
  const filteredModels = useMemo(() => {
    if (!modelFilter) return modelOptions;
    const q = modelFilter.toLowerCase();
    return modelOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.description.toLowerCase().includes(q) ||
        opt.providerId.toLowerCase().includes(q),
    );
  }, [modelOptions, modelFilter]);

  const groupedModels = useMemo(() => groupByProvider(filteredModels), [filteredModels]);
  const hasAvailableModelOptions = modelOptions.length > 0;
  const hasModelControl = Boolean(provider && modelId) || hasAvailableModelOptions;
  const shouldRenderModelControl =
    hasModelControl || showEmptyModelControl || Boolean(onSelectDoubaoApp);
  const activeModel =
    provider && modelId
      ? runtime?.models.find((model) => model.providerId === provider && model.modelId === modelId)
      : undefined;
  const activeModelLabel = activeModel?.label || modelId;
  const activeProviderLabel = activeModel?.providerName || provider;
  const modelBadgeLabel =
    provider && modelId
      ? variant === "prominent"
        ? (activeModelLabel ?? `${provider}:${modelId}`)
        : `${provider}:${modelId}`
      : hasAvailableModelOptions
        ? (unselectedModelLabel ?? t("models.chooseModel"))
        : (emptyModelLabel ?? t("models.chooseModel"));
  const modelBadgeTitle =
    disabled && disabledReason
      ? disabledReason
      : provider && modelId
        ? t("models.badgeTitle", {
            model: activeModelLabel ?? modelId,
            provider: activeProviderLabel ?? provider,
            id: `${provider}/${modelId}`,
          })
        : undefined;
  const noMatchingModels =
    hasAvailableModelOptions && modelFilter.trim().length > 0 && groupedModels.length === 0;

  useLayoutEffect(() => {
    if (open === "none") return;
    dropdownRef.current?.showPopover();
    dropdownRef.current?.querySelector("input")?.focus();
  }, [open]);

  useEffect(() => {
    if (open === "none") {
      setModelFilter("");
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen("none");
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen("none");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!shouldRenderModelControl && !thinkingLevel) {
    return null;
  }

  return (
    <span
      className={`model-selector${variant === "prominent" ? " model-selector--prominent" : ""}`}
      ref={containerRef}
    >
      {shouldRenderModelControl ? (
        <span
          className="model-selector__anchor"
          style={{ "--model-menu-anchor": `--model-${menuId}` } as CSSProperties}
        >
          <button
            className="model-selector__badge"
            type="button"
            disabled={disabled}
            title={modelBadgeTitle}
            aria-expanded={open === "model"}
            onClick={() => setOpen(open === "model" ? "none" : "model")}
          >
            {variant === "prominent" && provider && modelId ? (
              <>
                <span className="model-selector__badge-model">{modelBadgeLabel}</span>
                <span className="model-selector__badge-provider">{activeProviderLabel}</span>
              </>
            ) : (
              modelBadgeLabel
            )}
          </button>
          {open === "model" ? (
            <div
              className={`model-selector__dropdown ${dropdownPlacement === "below" ? "model-selector__dropdown--below" : ""}`}
              ref={dropdownRef}
              popover="auto"
              onToggle={(event) => {
                if (event.newState === "closed") setOpen("none");
              }}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="model-selector__filter">
                <input
                  className="model-selector__filter-input"
                  placeholder={t("models.filterPlaceholder")}
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                />
              </div>
              {onSelectDoubaoApp ? (
                <div>
                  <div className="model-selector__group-title">应用会话</div>
                  <button
                    type="button"
                    className="model-selector__item"
                    data-testid="choose-doubao-app"
                    onClick={() => {
                      setOpen("none");
                      onSelectDoubaoApp();
                    }}
                  >
                    豆包 App
                  </button>
                </div>
              ) : null}
              {groupedModels.map((group) => (
                <div key={group.provider}>
                  <div className="model-selector__group-title">{group.provider}</div>
                  {group.items.map((option) => {
                    const isActive = option.providerId === provider && option.modelId === modelId;
                    return (
                      <button
                        className={`model-selector__item${isActive ? " model-selector__item--active" : ""}`}
                        key={`${option.providerId}:${option.modelId}`}
                        type="button"
                        onClick={() => {
                          if (!isActive) {
                            onSetModel(option.providerId, option.modelId);
                          }
                          setOpen("none");
                        }}
                      >
                        <span className="model-selector__item-label">{option.label}</span>
                        {isActive ? (
                          <span className="model-selector__item-meta">{t("models.active")}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
              {groupedModels.length === 0 ? (
                <>
                  <div className="model-selector__group-title">
                    {noMatchingModels
                      ? t("models.noMatching")
                      : (emptyModelTitle ?? t("composer.modelOptionsEmptyTitle"))}
                  </div>
                  {noMatchingModels ? (
                    <div className="model-selector__empty">{t("models.tryDifferentFilter")}</div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </span>
      ) : null}
      {thinkingLevel ? (
        <span
          className="model-selector__anchor"
          style={{ "--model-menu-anchor": `--thinking-${menuId}` } as CSSProperties}
        >
          <button
            className="model-selector__badge"
            type="button"
            disabled={disabled}
            aria-expanded={open === "thinking"}
            title={disabled && disabledReason ? disabledReason : t("models.thinkingTitle")}
            onClick={() => setOpen(open === "thinking" ? "none" : "thinking")}
          >
            {thinkingLevel}
          </button>
          {open === "thinking" ? (
            <div
              className={`model-selector__dropdown ${dropdownPlacement === "below" ? "model-selector__dropdown--below" : ""}`}
              ref={dropdownRef}
              popover="auto"
              onToggle={(event) => {
                if (event.newState === "closed") setOpen("none");
              }}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="model-selector__group-title">{t("models.thinkingLevel")}</div>
              {THINKING_OPTIONS.map((option) => {
                const isActive = option.value === thinkingLevel;
                return (
                  <button
                    className={`model-selector__item${isActive ? " model-selector__item--active" : ""}`}
                    key={option.value}
                    aria-pressed={isActive}
                    type="button"
                    onClick={() => {
                      if (!isActive) {
                        onSetThinking(option.value);
                      }
                      setOpen("none");
                    }}
                  >
                    <span className="model-selector__item-label">{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

interface ModelGroup {
  readonly provider: string;
  readonly items: readonly ComposerModelOption[];
}

function groupByProvider(options: readonly ComposerModelOption[]): readonly ModelGroup[] {
  const groups = new Map<string, ComposerModelOption[]>();
  for (const option of options) {
    const existing = groups.get(option.providerId);
    if (existing) {
      existing.push(option);
    } else {
      groups.set(option.providerId, [option]);
    }
  }
  return Array.from(groups.entries()).map(([provider, items]) => ({ provider, items }));
}
