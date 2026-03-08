export type TvIntent =
  | "MoveUp"
  | "MoveDown"
  | "MoveLeft"
  | "MoveRight"
  | "Confirm"
  | "Back"
  | "SecondaryAction"
  | "PlayPause";

export interface TvContentKeyDetail {
  key?: string;
  view?: string;
  intent?: TvIntent | null;
  repeat?: boolean;
}

export function mapKeyToTvIntent(key: string): TvIntent | null {
  switch (key) {
    case "ArrowUp":
      return "MoveUp";
    case "ArrowDown":
      return "MoveDown";
    case "ArrowLeft":
      return "MoveLeft";
    case "ArrowRight":
      return "MoveRight";
    case "Enter":
    case " ":
      return "Confirm";
    case "Escape":
    case "Backspace":
      return "Back";
    case "f":
    case "F":
      return "SecondaryAction";
    case "MediaPlayPause":
      return "PlayPause";
    default:
      return null;
  }
}

interface ConfirmPressCallbacks {
  onSingle: () => void;
  onDouble?: () => void;
  onLong?: () => void;
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
  const doublePressWindowMs = options?.doublePressWindowMs ?? 280;
  const longPressMs = options?.longPressMs ?? 520;
  const singleDelayMs = options?.singleDelayMs ?? (callbacks.onDouble ? doublePressWindowMs : 0);

  let isPressing = false;
  let longTriggered = false;
  let lastTapAt = 0;
  let singleTimer: number | null = null;
  let longTimer: number | null = null;

  const clearSingleTimer = () => {
    if (singleTimer !== null) {
      window.clearTimeout(singleTimer);
      singleTimer = null;
    }
  };

  const clearLongTimer = () => {
    if (longTimer !== null) {
      window.clearTimeout(longTimer);
      longTimer = null;
    }
  };

  const fireSingle = () => {
    clearSingleTimer();
    lastTapAt = 0;
    callbacks.onSingle();
  };

  return {
    onKeyDown(repeat) {
      if (repeat || isPressing) return;
      isPressing = true;
      longTriggered = false;
      clearLongTimer();
      if (callbacks.onLong) {
        longTimer = window.setTimeout(() => {
          if (!isPressing) return;
          longTriggered = true;
          clearSingleTimer();
          callbacks.onLong?.();
        }, longPressMs);
      }
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

      if (!callbacks.onDouble) {
        fireSingle();
        return;
      }

      const now = Date.now();
      if (lastTapAt > 0 && now - lastTapAt <= doublePressWindowMs) {
        lastTapAt = 0;
        clearSingleTimer();
        callbacks.onDouble();
        return;
      }

      lastTapAt = now;
      clearSingleTimer();
      singleTimer = window.setTimeout(() => {
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
