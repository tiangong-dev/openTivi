export type Locale = "en-US" | "zh-CN";

export const LOCALE_SETTING_KEY = "ui.locale";

export function resolveLocale(raw: unknown): Locale {
  if (typeof raw === "string" && raw.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en-US";
}

export function detectDefaultLocale(): Locale {
  return resolveLocale(globalThis.navigator?.language);
}

export function tr(locale: Locale, en: string, zh: string): string {
  return locale === "zh-CN" ? zh : en;
}
