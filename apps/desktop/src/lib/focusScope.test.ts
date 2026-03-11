import { describe, expect, it } from "vitest";

import { resolveLinearFocusScope } from "./focusScope";
import { TvIntent } from "./tvInput";

describe("focus scope", () => {
  const items = ["a", "b", "c"] as const;

  it("moves within the group before bubbling", () => {
    expect(
      resolveLinearFocusScope({
        items,
        current: "b",
        intent: TvIntent.MoveLeft,
        backwardIntent: TvIntent.MoveLeft,
        forwardIntent: TvIntent.MoveRight,
      }),
    ).toEqual({ handled: true, next: "a" });
  });

  it("bubbles when moving past a bubbling edge", () => {
    expect(
      resolveLinearFocusScope({
        items,
        current: "a",
        intent: TvIntent.MoveLeft,
        backwardIntent: TvIntent.MoveLeft,
        forwardIntent: TvIntent.MoveRight,
        backwardEdge: "bubble",
        forwardEdge: "stay",
      }),
    ).toEqual({ handled: false, next: "a" });
  });

  it("can stay at the edge instead of bubbling", () => {
    expect(
      resolveLinearFocusScope({
        items,
        current: "c",
        intent: TvIntent.MoveRight,
        backwardIntent: TvIntent.MoveLeft,
        forwardIntent: TvIntent.MoveRight,
        forwardEdge: "stay",
      }),
    ).toEqual({ handled: true, next: "c" });
  });

  it("moves forward within a horizontal group", () => {
    expect(
      resolveLinearFocusScope({
        items,
        current: "a",
        intent: TvIntent.MoveRight,
        backwardIntent: TvIntent.MoveLeft,
        forwardIntent: TvIntent.MoveRight,
        backwardEdge: "bubble",
        forwardEdge: "stay",
      }),
    ).toEqual({ handled: true, next: "b" });
  });
});
