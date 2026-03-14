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

export const TV_DIRECTIONAL_INTENTS = [
  TvIntent.MoveUp,
  TvIntent.MoveDown,
  TvIntent.MoveLeft,
  TvIntent.MoveRight,
] as const;

export const TV_VERTICAL_INTENTS = [TvIntent.MoveUp, TvIntent.MoveDown] as const;
export const TV_HORIZONTAL_INTENTS = [TvIntent.MoveLeft, TvIntent.MoveRight] as const;

export type TvDirectionalIntent = (typeof TV_DIRECTIONAL_INTENTS)[number];

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
    case "NumpadEnter":
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

export function isIntentOneOf(
  intent: TvIntent | null | undefined,
  candidates: readonly TvIntent[],
): intent is TvIntent {
  return intent !== null && intent !== undefined && candidates.includes(intent);
}

export function isDirectionalIntent(
  intent: TvIntent | null | undefined,
): intent is TvDirectionalIntent {
  return isIntentOneOf(intent, TV_DIRECTIONAL_INTENTS);
}

export function isHorizontalIntent(intent: TvIntent | null | undefined): intent is TvDirectionalIntent {
  return isIntentOneOf(intent, TV_HORIZONTAL_INTENTS);
}

export function isVerticalIntent(intent: TvIntent | null | undefined): intent is TvDirectionalIntent {
  return isIntentOneOf(intent, TV_VERTICAL_INTENTS);
}
