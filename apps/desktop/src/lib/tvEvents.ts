import { useEffect } from "react";

import {
  useNavigationState,
  type NavigationFocusContentDetail,
  type NavigationView,
} from "./navigation";
import type { TvContentKeyDetail } from "./tvInput";

type ViewSpec = NavigationView | readonly NavigationView[];

interface FocusContentDetail {
  view?: string;
}

function createSyntheticEvent<T>(detail: T): CustomEvent<T> {
  let prevented = false;
  return {
    detail,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  } as CustomEvent<T>;
}

function toViews(spec: ViewSpec): readonly NavigationView[] {
  return Array.isArray(spec) ? spec : [spec as NavigationView];
}

function matchesView(spec: ViewSpec, view?: string): boolean {
  return !view || toViews(spec).includes(view as NavigationView);
}

export function useViewActivity(spec: ViewSpec) {
  const navigation = useNavigationState();
  const isActiveView = toViews(spec).includes(navigation.activeView);
  const isKeyboardContentActive =
    isActiveView &&
    navigation.inputMode === "keyboard" &&
    navigation.focusZone === "content";
  const shouldClearDomFocus =
    isActiveView &&
    (navigation.inputMode === "pointer" || navigation.focusZone === "nav");

  return {
    navigation,
    isActiveView,
    isKeyboardContentActive,
    shouldClearDomFocus,
  };
}

export function useTvViewEvents({
  views,
  onFocusContent,
  onContentKey,
  onContentKeyUp,
}: {
  views: ViewSpec;
  onFocusContent?: (event: CustomEvent<FocusContentDetail>) => void;
  onContentKey?: (event: CustomEvent<TvContentKeyDetail>) => void;
  onContentKeyUp?: (event: CustomEvent<TvContentKeyDetail>) => void;
}) {
  const navigation = useNavigationState();

  useEffect(() => {
    const removers: Array<() => void> = [];

    if (onFocusContent) {
      const listener = (detail: NavigationFocusContentDetail) => {
        if (!matchesView(views, detail?.view)) return;
        onFocusContent(createSyntheticEvent(detail));
      };
      removers.push(navigation.subscribeFocusContent(listener));
    }

    if (onContentKey) {
      const listener = (detail: TvContentKeyDetail) => {
        if (!matchesView(views, detail?.view)) return;
        return onContentKey(createSyntheticEvent(detail));
      };
      removers.push(navigation.subscribeContentKey(listener));
    }

    if (onContentKeyUp) {
      const listener = (detail: TvContentKeyDetail) => {
        if (!matchesView(views, detail?.view)) return;
        onContentKeyUp(createSyntheticEvent(detail));
      };
      removers.push(navigation.subscribeContentKeyUp(listener));
    }

    return () => {
      removers.forEach((remove) => remove());
    };
  }, [navigation, onContentKey, onContentKeyUp, onFocusContent, views]);
}
