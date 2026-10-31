export type Locale = "en" | "zh-CN";
export type LanguagePreference = "system" | Locale;

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "zh-CN"];

export interface MessageCatalog<K extends string> {
  readonly en: Readonly<Record<K, string>>;
  readonly zh: Readonly<Record<K, string>>;
}

/**
 * English is the source of truth; the Chinese table must provide exactly the same keys,
 * so a missing or stale translation is a type error.
 */
export function defineMessages<const E extends Record<string, string>>(
  en: E,
  zh: { readonly [K in keyof E]: string },
): MessageCatalog<Extract<keyof E, string>> {
  return { en, zh } as MessageCatalog<Extract<keyof E, string>>;
}

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || isLocale(value);
}

export function localeFromLanguageTags(tags: readonly (string | undefined | null)[]): Locale {
  for (const tag of tags) {
    if (!tag) continue;
    const normalized = tag.toLowerCase();
    if (normalized.startsWith("zh")) return "zh-CN";
    if (normalized.startsWith("en")) return "en";
  }
  return "en";
}

export function resolveLocale(
  preference: LanguagePreference | undefined,
  systemLocale: Locale,
): Locale {
  return preference && preference !== "system" ? preference : systemLocale;
}
