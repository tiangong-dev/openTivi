export const GUIDE_WINDOW_MINUTES_SETTING_KEY = "epg.timelineWindowMinutes";
export const DEFAULT_GUIDE_WINDOW_MINUTES = 180;

const ALLOWED_GUIDE_WINDOW_MINUTES = new Set([60, 90, 120, 150, 180, 240, 300, 360]);

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
