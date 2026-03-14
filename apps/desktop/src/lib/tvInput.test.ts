import { describe, expect, it, vi } from "vitest";

import {
  ConfirmGesture,
  createConfirmPressHandler,
  isConfirmGestureOneOf,
  isDirectionalIntent,
  isHorizontalIntent,
  isVerticalIntent,
  mapKeyToTvIntent,
  TvIntent,
} from "./tvInput";

describe("tv input", () => {
  it("maps keys to stable intent enums", () => {
    expect(mapKeyToTvIntent("ArrowUp")).toBe(TvIntent.MoveUp);
    expect(mapKeyToTvIntent("ArrowDown")).toBe(TvIntent.MoveDown);
    expect(mapKeyToTvIntent("ArrowLeft")).toBe(TvIntent.MoveLeft);
    expect(mapKeyToTvIntent("ArrowRight")).toBe(TvIntent.MoveRight);
    expect(mapKeyToTvIntent("Enter")).toBe(TvIntent.Confirm);
    expect(mapKeyToTvIntent("NumpadEnter")).toBe(TvIntent.Confirm);
    expect(mapKeyToTvIntent("Escape")).toBe(TvIntent.Back);
    expect(mapKeyToTvIntent("F")).toBe(TvIntent.SecondaryAction);
  });

  it("emits single, double, and long confirm gestures", async () => {
    vi.useFakeTimers();
    const gestures: ConfirmGesture[] = [];
    const handler = createConfirmPressHandler({
      onGesture: (gesture) => gestures.push(gesture),
    });

    handler.onKeyDown(false);
    handler.onKeyUp();
    await vi.advanceTimersByTimeAsync(380);
    expect(gestures).toEqual([ConfirmGesture.Single]);

    gestures.length = 0;
    handler.onKeyDown(false);
    handler.onKeyUp();
    handler.onKeyDown(false);
    handler.onKeyUp();
    await vi.advanceTimersByTimeAsync(10);
    expect(gestures).toEqual([ConfirmGesture.Double]);

    gestures.length = 0;
    handler.onKeyDown(false);
    handler.onKeyUp();
    await vi.advanceTimersByTimeAsync(320);
    handler.onKeyDown(false);
    handler.onKeyUp();
    await vi.advanceTimersByTimeAsync(10);
    expect(gestures).toEqual([ConfirmGesture.Double]);

    gestures.length = 0;
    const relaxedHandler = createConfirmPressHandler(
      {
        onGesture: (gesture) => gestures.push(gesture),
      },
      { doublePressWindowMs: 520, longPressMs: 700 },
    );
    relaxedHandler.onKeyDown(false);
    relaxedHandler.onKeyUp();
    await vi.advanceTimersByTimeAsync(460);
    relaxedHandler.onKeyDown(false);
    relaxedHandler.onKeyUp();
    await vi.advanceTimersByTimeAsync(10);
    expect(gestures).toEqual([ConfirmGesture.Double]);

    gestures.length = 0;
    handler.onKeyDown(false);
    await vi.advanceTimersByTimeAsync(600);
    handler.onKeyUp();
    expect(gestures).toEqual([ConfirmGesture.Long]);

    vi.useRealTimers();
  });

  it("categorizes directional intents and confirm gestures", () => {
    expect(isDirectionalIntent(TvIntent.MoveLeft)).toBe(true);
    expect(isHorizontalIntent(TvIntent.MoveLeft)).toBe(true);
    expect(isHorizontalIntent(TvIntent.MoveUp)).toBe(false);
    expect(isVerticalIntent(TvIntent.MoveDown)).toBe(true);
    expect(isVerticalIntent(TvIntent.Confirm)).toBe(false);
    expect(isConfirmGestureOneOf(ConfirmGesture.Long, [ConfirmGesture.Double, ConfirmGesture.Long])).toBe(true);
    expect(isConfirmGestureOneOf(ConfirmGesture.Single, [ConfirmGesture.Double])).toBe(false);
  });
});
