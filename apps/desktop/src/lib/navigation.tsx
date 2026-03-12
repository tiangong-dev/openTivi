import { createContext, useContext } from "react";

import type { AppStartView } from "./settings";
import type { TvContentKeyDetail } from "./tvInput";

export type NavigationView = AppStartView | "dev-components" | "now-playing";
export type NavigationFocusZone = "nav" | "content";
export type NavigationInputMode = "keyboard" | "pointer";
export interface NavigationFocusContentDetail {
  view?: NavigationView;
}
export type NavigationFocusContentListener = (detail: NavigationFocusContentDetail) => void;
export type NavigationContentKeyListener = (detail: TvContentKeyDetail) => boolean | void;
export type NavigationContentKeyUpListener = (detail: TvContentKeyDetail) => void;

interface NavigationContextValue {
  activeView: NavigationView;
  focusZone: NavigationFocusZone;
  inputMode: NavigationInputMode;
  dispatchFocusContent: (detail: NavigationFocusContentDetail) => void;
  dispatchContentKey: (detail: TvContentKeyDetail) => boolean;
  dispatchContentKeyUp: (detail: TvContentKeyDetail) => void;
  subscribeFocusContent: (listener: NavigationFocusContentListener) => () => void;
  subscribeContentKey: (listener: NavigationContentKeyListener) => () => void;
  subscribeContentKeyUp: (listener: NavigationContentKeyUpListener) => () => void;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useNavigationState(): NavigationContextValue {
  const value = useContext(NavigationContext);
  if (!value) {
    throw new Error("useNavigationState must be used within NavigationContext");
  }
  return value;
}
