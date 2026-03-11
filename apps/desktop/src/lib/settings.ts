export const GUIDE_WINDOW_MINUTES_SETTING_KEY = "epg.timelineWindowMinutes";
export const DEFAULT_GUIDE_WINDOW_MINUTES = 180;
export const INSTANT_SWITCH_ENABLED_SETTING_KEY = "player.instantSwitchEnabled";
export const DEFAULT_INSTANT_SWITCH_ENABLED = false;
export const APP_START_VIEW_SETTING_KEY = "app.startView";

export const APP_START_VIEWS = ["channels", "favorites", "recents", "sources", "settings"] as const;
export type AppStartView = (typeof APP_START_VIEWS)[number];
export const DEFAULT_APP_START_VIEW: AppStartView = "channels";

const ALLOWED_GUIDE_WINDOW_MINUTES = new Set([60, 90, 120, 150, 180, 240, 300, 360]);
const ALLOWED_APP_START_VIEWS = new Set<string>(APP_START_VIEWS);

export function resolveGuideWindowMinutes(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : DEFAULT_GUIDE_WINDOW_MINUTES;
  if (!Number.isFinite(value)) return DEFAULT_GUIDE_WINDOW_MINUTES;
  const rounded = Math.round(value);
  return ALLOWED_GUIDE_WINDOW_MINUTES.has(rounded) ? rounded : DEFAULT_GUIDE_WINDOW_MINUTES;
}

export function resolveInstantSwitchEnabled(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw === "true" || raw === "1";
  return DEFAULT_INSTANT_SWITCH_ENABLED;
}

export function resolveAppStartView(raw: unknown): AppStartView {
  if (typeof raw === "string" && ALLOWED_APP_START_VIEWS.has(raw)) {
    return raw as AppStartView;
  }
  return DEFAULT_APP_START_VIEW;
}
