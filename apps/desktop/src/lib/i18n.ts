import enUsMessages from "../../../../shared/locales/en-US.json";
import zhCnMessages from "../../../../shared/locales/zh-CN.json";

export type Locale = "en-US" | "zh-CN";
export const LOCALE_SETTING_KEY = "ui.locale";

type TranslationParams = Record<string, string | number>;
export type TranslationKey = keyof typeof enUsMessages;

const zhMessages: Record<TranslationKey, string> = zhCnMessages;

const messages = {
  "en-US": enUsMessages,
  "zh-CN": zhMessages,
} as const;

export function resolveLocale(raw: unknown): Locale {
  if (typeof raw === "string" && raw.toLowerCase().startsWith("zh")) {
    return "zh-CN";
  }
  return "en-US";
}

export function detectDefaultLocale(): Locale {
  return resolveLocale(globalThis.navigator?.language);
}

export function t(locale: Locale, key: TranslationKey, params?: TranslationParams): string {
  const selected = messages[locale][key] ?? messages["en-US"][key] ?? key;
  if (!params) return selected;
  return selected.replace(/\{(\w+)\}/g, (_matched, token: string) => {
    const value = params[token];
    return value === undefined ? `{${token}}` : String(value);
  });
}
