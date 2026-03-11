import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_START_VIEW,
  DEFAULT_GUIDE_WINDOW_MINUTES,
  DEFAULT_PLAYER_VOLUME,
  resolveEpgReminders,
  resolveAppStartView,
  resolveGuideWindowMinutes,
  resolveInstantSwitchEnabled,
  resolvePlayerLastChannelId,
  resolvePlayerVolume,
} from "./settings";

describe("settings resolvers", () => {
  it("accepts a valid start view", () => {
    expect(resolveAppStartView("sources")).toBe("sources");
  });

  it("falls back to the default start view for invalid input", () => {
    expect(resolveAppStartView("library")).toBe(DEFAULT_APP_START_VIEW);
    expect(resolveAppStartView(null)).toBe(DEFAULT_APP_START_VIEW);
  });

  it("normalizes guide window minutes", () => {
    expect(resolveGuideWindowMinutes("180")).toBe(180);
    expect(resolveGuideWindowMinutes("999")).toBe(DEFAULT_GUIDE_WINDOW_MINUTES);
  });

  it("normalizes instant switch values", () => {
    expect(resolveInstantSwitchEnabled("true")).toBe(true);
    expect(resolveInstantSwitchEnabled("0")).toBe(false);
  });

  it("normalizes player volume", () => {
    expect(resolvePlayerVolume("0.5")).toBe(0.5);
    expect(resolvePlayerVolume(2)).toBe(1);
    expect(resolvePlayerVolume("bad")).toBe(DEFAULT_PLAYER_VOLUME);
  });

  it("normalizes last channel ids", () => {
    expect(resolvePlayerLastChannelId("12")).toBe(12);
    expect(resolvePlayerLastChannelId(0)).toBeNull();
    expect(resolvePlayerLastChannelId("bad")).toBeNull();
  });

  it("normalizes epg reminders", () => {
    expect(resolveEpgReminders([{ programId: 1, channelId: 2, title: "News", startAt: "20260101080000 +0800" }])).toHaveLength(1);
    expect(resolveEpgReminders([{ programId: 0 }])).toHaveLength(0);
  });
});
