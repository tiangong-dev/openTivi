export enum ConfirmGesture {
  Single = "Single",
  Double = "Double",
  Long = "Long",
}

export const CONFIRM_GESTURES = [
  ConfirmGesture.Single,
  ConfirmGesture.Double,
  ConfirmGesture.Long,
] as const;

export function isConfirmGestureOneOf(
  gesture: ConfirmGesture | null | undefined,
  candidates: readonly ConfirmGesture[],
): gesture is ConfirmGesture {
  return gesture !== null && gesture !== undefined && candidates.includes(gesture);
}

interface ConfirmPressCallbacks {
  onGesture: (gesture: ConfirmGesture) => void;
}

interface ConfirmPressOptions {
  doublePressWindowMs?: number;
  longPressMs?: number;
  singleDelayMs?: number;
}

interface ConfirmPressHandler {
  onKeyDown: (repeat: boolean) => void;
  onKeyUp: () => void;
  clear: () => void;
}

export function createConfirmPressHandler(
  callbacks: ConfirmPressCallbacks,
  options?: ConfirmPressOptions,
): ConfirmPressHandler {
  const doublePressWindowMs = options?.doublePressWindowMs ?? 360;
  const longPressMs = options?.longPressMs ?? 520;
  const singleDelayMs = options?.singleDelayMs ?? doublePressWindowMs;

  let isPressing = false;
  let longTriggered = false;
  let lastTapAt = 0;
  let singleTimer: number | null = null;
  let longTimer: number | null = null;

  const clearSingleTimer = () => {
    if (singleTimer !== null) {
      globalThis.clearTimeout(singleTimer);
      singleTimer = null;
    }
  };

  const clearLongTimer = () => {
    if (longTimer !== null) {
      globalThis.clearTimeout(longTimer);
      longTimer = null;
    }
  };

  const fireSingle = () => {
    clearSingleTimer();
    lastTapAt = 0;
    callbacks.onGesture(ConfirmGesture.Single);
  };

  return {
    onKeyDown(repeat) {
      if (repeat || isPressing) return;
      isPressing = true;
      longTriggered = false;
      clearLongTimer();
      longTimer = globalThis.setTimeout(() => {
        if (!isPressing) return;
        longTriggered = true;
        clearSingleTimer();
        callbacks.onGesture(ConfirmGesture.Long);
      }, longPressMs);
    },
    onKeyUp() {
      if (!isPressing) return;
      isPressing = false;
      clearLongTimer();

      if (longTriggered) {
        longTriggered = false;
        lastTapAt = 0;
        clearSingleTimer();
        return;
      }

      const now = Date.now();
      if (lastTapAt > 0 && now - lastTapAt <= doublePressWindowMs) {
        lastTapAt = 0;
        clearSingleTimer();
        callbacks.onGesture(ConfirmGesture.Double);
        return;
      }

      lastTapAt = now;
      clearSingleTimer();
      singleTimer = globalThis.setTimeout(() => {
        fireSingle();
      }, singleDelayMs);
    },
    clear() {
      isPressing = false;
      longTriggered = false;
      lastTapAt = 0;
      clearSingleTimer();
      clearLongTimer();
    },
  };
}

export type { ConfirmPressHandler, ConfirmPressOptions };
