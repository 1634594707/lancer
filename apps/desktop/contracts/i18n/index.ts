import type { Locale } from "./define";
import { appMessages } from "./messages/app";
import { composerMessages } from "./messages/composer";
import { coreMessages } from "./messages/core";
import { extensionsMessages } from "./messages/extensions";
import { modelsMessages } from "./messages/models";
import { settingsMessages } from "./messages/settings";
import { threadsMessages } from "./messages/threads";
import { timelineMessages } from "./messages/timeline";
import { workbenchMessages } from "./messages/workbench";
import { lancerMessages } from "./messages/lancer";

export * from "./define";

const en = {
  ...coreMessages.en,
  ...modelsMessages.en,
  ...appMessages.en,
  ...composerMessages.en,
  ...extensionsMessages.en,
  ...settingsMessages.en,
  ...threadsMessages.en,
  ...timelineMessages.en,
  ...workbenchMessages.en,
  ...lancerMessages.en,
};

export type MessageKey = keyof typeof en;
export type MessageParams = Readonly<Record<string, string | number>>;

const zh: Readonly<Record<MessageKey, string>> = {
  ...coreMessages.zh,
  ...modelsMessages.zh,
  ...appMessages.zh,
  ...composerMessages.zh,
  ...extensionsMessages.zh,
  ...settingsMessages.zh,
  ...threadsMessages.zh,
  ...timelineMessages.zh,
  ...workbenchMessages.zh,
  ...lancerMessages.zh,
};

const catalogs: Readonly<Record<Locale, Readonly<Record<MessageKey, string>>>> = {
  en,
  "zh-CN": zh,
};

let currentLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  currentLocale = locale;
  for (const listener of listeners) listener(locale);
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function interpolate(template: string, params: MessageParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = catalogs[locale][key] || en[key] || key;
  return interpolate(template, params);
}

/** Translates with the current locale. Call at render time, never at module load. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(currentLocale, key, params);
}

/** Picks the singular or plural key by count; `{count}` is always available as a param. */
export function tPlural(
  count: number,
  singularKey: MessageKey,
  pluralKey: MessageKey,
  params?: MessageParams,
): string {
  return t(count === 1 ? singularKey : pluralKey, { count, ...params });
}

export function hasMessage(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}
