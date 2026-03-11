import { describe, expect, it } from "vitest";

import {
  DEFAULT_APP_START_VIEW,
  DEFAULT_GUIDE_WINDOW_MINUTES,
  resolveAppStartView,
  resolveGuideWindowMinutes,
  resolveInstantSwitchEnabled,
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
});
