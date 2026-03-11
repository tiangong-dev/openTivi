export enum TvIntent {
  MoveUp = "MoveUp",
  MoveDown = "MoveDown",
  MoveLeft = "MoveLeft",
  MoveRight = "MoveRight",
  Confirm = "Confirm",
  Back = "Back",
  SecondaryAction = "SecondaryAction",
  PlayPause = "PlayPause",
}

export enum ConfirmGesture {
  Single = "Single",
  Double = "Double",
  Long = "Long",
}

export interface TvContentKeyDetail {
  key?: string;
  view?: string;
  intent?: TvIntent | null;
  repeat?: boolean;
}

export function mapKeyToTvIntent(key: string): TvIntent | null {
  switch (key) {
    case "ArrowUp":
      return TvIntent.MoveUp;
    case "ArrowDown":
      return TvIntent.MoveDown;
    case "ArrowLeft":
      return TvIntent.MoveLeft;
    case "ArrowRight":
      return TvIntent.MoveRight;
    case "Enter":
    case " ":
      return TvIntent.Confirm;
    case "Escape":
    case "Backspace":
      return TvIntent.Back;
    case "f":
    case "F":
      return TvIntent.SecondaryAction;
    case "MediaPlayPause":
      return TvIntent.PlayPause;
    default:
      return null;
  }
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
  const doublePressWindowMs = options?.doublePressWindowMs ?? 280;
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
