import { mapKeyToTvIntent, TvIntent } from "./intents";

export interface TvContentKeyDetail {
  key?: string;
  view?: string;
  intent?: TvIntent | null;
  repeat?: boolean;
}

export function createTvContentKeyDetail(
  key: string,
  view: string,
  repeat: boolean,
): TvContentKeyDetail {
  return {
    key,
    view,
    repeat,
    intent: mapKeyToTvIntent(key),
  };
}
