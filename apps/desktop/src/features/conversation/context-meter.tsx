import { useEffect, useId, useState } from "react";
import type {
  SessionPlanLimit,
  SessionPromptCache,
  SessionUsageSnapshot,
} from "@lancer/session-driver";
import { t } from "../../../contracts/i18n";

interface ContextMeterProps {
  readonly usage: SessionUsageSnapshot | undefined;
}

const RING_RADIUS = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Codex-style context ring beside the model picker. Hovering or focusing it
 * opens a card with pi's context, prompt-cache, plan-limit and thread usage.
 */
export function ContextMeter({ usage }: ContextMeterProps) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  const now = useNow(open && hasCountdown(usage));
  const context = usage?.context;
  if (!usage || !context) return null;

  const percent = context.tokens === null ? null : (context.tokens / context.contextWindow) * 100;
  const tone =
    percent === null ? "unknown" : percent > 90 ? "danger" : percent > 70 ? "warning" : "normal";
  const label =
    percent === null
      ? t("composer.context.ariaUnknown")
      : t("composer.context.ariaUsed", { percent: formatPercent(percent) });

  return (
    <div
      className="context-meter"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="context-meter__ring"
        data-tone={tone}
        aria-label={label}
        aria-describedby={open ? cardId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle className="context-meter__track" cx="8" cy="8" r={RING_RADIUS} />
          <circle
            className="context-meter__fill"
            cx="8"
            cy="8"
            r={RING_RADIUS}
            strokeDasharray={`${(Math.min(percent ?? 0, 100) / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            transform="rotate(-90 8 8)"
          />
        </svg>
      </button>
      {open ? (
        <div className="context-meter__card" id={cardId} role="tooltip">
          <section className="context-meter__section">
            <h3 className="context-meter__heading">{t("composer.context.heading")}</h3>
            <p className="context-meter__headline">
              {context.tokens === null || percent === null
                ? t("composer.context.unknownHeadline", {
                    window: formatTokens(context.contextWindow),
                  })
                : t("composer.context.usedHeadline", {
                    percent: formatPercent(percent),
                    tokens: formatTokens(context.tokens),
                    window: formatTokens(context.contextWindow),
                  })}
            </p>
            <p className="context-meter__note">
              {context.compactAtTokens === undefined
                ? t("composer.context.autoCompactOff")
                : t("composer.context.autoCompactAt", {
                    percent: formatPercent((context.compactAtTokens / context.contextWindow) * 100),
                  })}
            </p>
          </section>
          <section className="context-meter__section">
            <h3 className="context-meter__heading">{t("composer.context.promptCache")}</h3>
            {usage.lastTurn ? (
              <Row
                label={t("composer.context.lastTurn")}
                value={t("composer.context.cached", {
                  percent: formatPercent(cacheHitPercent(usage.lastTurn)),
                })}
              />
            ) : null}
            <CacheRow cache={usage.cache} now={now} />
          </section>
          {usage.planLimits && usage.planLimits.limits.length > 0 ? (
            <section className="context-meter__section">
              <h3 className="context-meter__heading">{t("composer.context.planLimits")}</h3>
              {usage.planLimits.limits.map((limit) => (
                <Row
                  key={limit.windowMinutes}
                  label={planLimitLabel(limit)}
                  value={
                    limit.resetsAt
                      ? t("composer.context.resetsIn", {
                          duration: formatDuration(Date.parse(limit.resetsAt) - now),
                        })
                      : ""
                  }
                />
              ))}
            </section>
          ) : null}
          <section className="context-meter__section">
            <h3 className="context-meter__heading">{t("composer.context.thisThread")}</h3>
            <Row
              label={t("composer.context.inputOutput")}
              value={`${formatTokens(usage.totals.input)} / ${formatTokens(usage.totals.output)}`}
            />
            <Row
              label={t("composer.context.cacheReadWrite")}
              value={`${formatTokens(usage.totals.cacheRead)} / ${formatTokens(usage.totals.cacheWrite)}`}
            />
            <Row
              label={t("composer.context.cost")}
              value={
                usage.subscription
                  ? t("composer.context.subscription")
                  : `$${usage.totals.cost.toFixed(2)}`
              }
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="context-meter__row">
      <span>{label}</span>
      <span className="context-meter__value">{value}</span>
    </div>
  );
}

function CacheRow({ cache, now }: { readonly cache: SessionPromptCache; readonly now: number }) {
  const nextRefreshIn = cache.nextRefreshAt ? Date.parse(cache.nextRefreshAt) - now : 0;
  if (nextRefreshIn > 0) {
    return (
      <Row
        label={t("composer.context.keptWarm")}
        value={t("composer.context.nextRefreshIn", { countdown: formatCountdown(nextRefreshIn) })}
      />
    );
  }
  if (!cache.expiresAt) {
    return cache.lifetimeSeconds === undefined ? (
      <Row label={t("composer.context.expiry")} value={t("composer.context.expiryNotReported")} />
    ) : (
      <Row label={t("composer.context.expiry")} value={t("composer.context.expiryNothingCached")} />
    );
  }
  const expiresIn = Date.parse(cache.expiresAt) - now;
  return expiresIn > 0 ? (
    <Row label={t("composer.context.expiresIn")} value={formatCountdown(expiresIn)} />
  ) : (
    <Row label={t("composer.context.expiry")} value={t("composer.context.expired")} />
  );
}

function hasCountdown(usage: SessionUsageSnapshot | undefined): boolean {
  return Boolean(usage && (usage.cache.expiresAt || usage.cache.nextRefreshAt || usage.planLimits));
}

/** Current time; re-renders every second only while something on screen counts down. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  const [wasTicking, setWasTicking] = useState(ticking);
  if (ticking !== wasTicking) {
    // Read the clock during the render that opens the card, so it never shows a stale countdown.
    setWasTicking(ticking);
    setNow(Date.now());
  }
  useEffect(() => {
    if (!ticking) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [ticking]);
  return now;
}

function cacheHitPercent(turn: NonNullable<SessionUsageSnapshot["lastTurn"]>): number {
  const prompt = turn.input + turn.cacheRead + turn.cacheWrite;
  return prompt > 0 ? (turn.cacheRead / prompt) * 100 : 0;
}

function planLimitLabel(limit: SessionPlanLimit): string {
  const percent = formatPercent(limit.usedPercent);
  if (limit.windowMinutes === 7 * 24 * 60) return t("composer.context.limitWeekly", { percent });
  if (limit.windowMinutes === 24 * 60) return t("composer.context.limitDaily", { percent });
  if (limit.windowMinutes % 60 === 0) {
    return t("composer.context.limitHours", { percent, hours: limit.windowMinutes / 60 });
  }
  return t("composer.context.limitMinutes", { percent, minutes: limit.windowMinutes });
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    const millions = count / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : Number(millions.toFixed(1))}M`;
  }
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** m:ss for the short cache timers. */
function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** Coarse "1 d 16 h" / "2 hr 57 min" for plan-limit resets, like Claude's hover. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return t("composer.context.durationDays", { days, hours });
  if (hours > 0) return t("composer.context.durationHours", { hours, minutes });
  return t("composer.context.durationMinutes", { minutes });
}
