export const GUIDE_WINDOW_MINUTES_SETTING_KEY = "epg.timelineWindowMinutes";
export const DEFAULT_GUIDE_WINDOW_MINUTES = 180;
export const INSTANT_SWITCH_ENABLED_SETTING_KEY = "player.instantSwitchEnabled";
export const DEFAULT_INSTANT_SWITCH_ENABLED = false;
export const PREFER_NATIVE_HLS_SETTING_KEY = "player.preferNativeHls";
export const DEFAULT_PREFER_NATIVE_HLS = true;
export const PLAYER_VOLUME_SETTING_KEY = "player.volume";
export const DEFAULT_PLAYER_VOLUME = 0.8;
export const PLAYER_LAST_CHANNEL_ID_SETTING_KEY = "player.lastChannelId";
export const EPG_REMINDERS_SETTING_KEY = "epg.reminders";
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

export function resolvePreferNativeHls(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
  }
  return DEFAULT_PREFER_NATIVE_HLS;
}

export function resolvePlayerVolume(raw: unknown): number {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number(raw)
        : DEFAULT_PLAYER_VOLUME;
  if (!Number.isFinite(value)) return DEFAULT_PLAYER_VOLUME;
  return Math.max(0, Math.min(1, value));
}

export function resolvePlayerLastChannelId(raw: unknown): number | null {
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export interface EpgReminder {
  programId: number;
  channelId: number;
  title: string;
  startAt: string;
}

export function resolveEpgReminders(raw: unknown): EpgReminder[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Record<string, unknown>;
      const programId = Number(candidate.programId);
      const channelId = Number(candidate.channelId);
      const title = typeof candidate.title === "string" ? candidate.title : "";
      const startAt = typeof candidate.startAt === "string" ? candidate.startAt : "";
      if (!Number.isInteger(programId) || !Number.isInteger(channelId) || !title || !startAt) {
        return null;
      }
      return { programId, channelId, title, startAt };
    })
    .filter((item): item is EpgReminder => item !== null);
}

export function resolveAppStartView(raw: unknown): AppStartView {
  if (typeof raw === "string" && ALLOWED_APP_START_VIEWS.has(raw)) {
    return raw as AppStartView;
  }
  return DEFAULT_APP_START_VIEW;
}
