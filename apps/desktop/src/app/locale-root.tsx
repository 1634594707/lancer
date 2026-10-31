import { useEffect, useState, type ReactNode } from "react";
import {
  getLocale,
  isLocale,
  localeFromLanguageTags,
  resolveLocale,
  setLocale,
  type Locale,
} from "../../contracts/i18n";
import type { DesktopAppState } from "../../contracts/desktop-state";

const LOCALE_CACHE_KEY = "lancer:locale";

function readCachedLocale(): Locale | undefined {
  try {
    const cached = window.localStorage.getItem(LOCALE_CACHE_KEY);
    return isLocale(cached) ? cached : undefined;
  } catch {
    return undefined;
  }
}

function applyDocumentLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  try {
    window.localStorage.setItem(LOCALE_CACHE_KEY, locale);
  } catch {
    // Storage may be unavailable; the locale still applies for this session.
  }
}

/** Seeds the locale before the first render so the UI does not flash in the wrong language. */
export function applyInitialLocale(): void {
  const locale = readCachedLocale() ?? localeFromLanguageTags([...navigator.languages]);
  setLocale(locale);
  applyDocumentLocale(locale);
}

export function localeForState(state: Pick<DesktopAppState, "language" | "systemLocale">): Locale {
  return resolveLocale(
    state.language,
    isLocale(state.systemLocale) ? state.systemLocale : getLocale(),
  );
}

/**
 * Translations are read at render time from a module-level locale, so a language change
 * remounts the whole tree under a new key instead of threading context through every memo.
 */
export function LocaleRoot({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  useEffect(() => {
    const api = window.piApp;
    if (!api) return;
    const apply = (state: DesktopAppState) => {
      const next = localeForState(state);
      if (next === getLocale()) return;
      setLocale(next);
      applyDocumentLocale(next);
      setLocaleState(next);
    };
    let disposed = false;
    void api.getState().then(
      (state) => {
        if (!disposed) apply(state);
      },
      () => undefined,
    );
    const unsubscribe = api.onStateChanged(apply);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return <LocaleScope key={locale}>{children}</LocaleScope>;
}

function LocaleScope({ children }: { readonly children: ReactNode }) {
  return <>{children}</>;
}
