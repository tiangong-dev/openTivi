import { useCallback } from "react";

import { TvIntent } from "./tvInput";

export type FocusScopeEdgePolicy = "stay" | "wrap" | "bubble";

export interface LinearFocusScopeConfig<T extends string> {
  items: readonly T[];
  current: T;
  intent: TvIntent;
  backwardIntent: TvIntent;
  forwardIntent: TvIntent;
  backwardEdge?: FocusScopeEdgePolicy;
  forwardEdge?: FocusScopeEdgePolicy;
}

export interface FocusScopeResult<T> {
  handled: boolean;
  next: T;
}

export interface UseLinearFocusGroupConfig<T extends string> {
  items: readonly T[];
  current: T;
  setCurrent: (next: T) => void;
  backwardIntent: TvIntent;
  forwardIntent: TvIntent;
  backwardEdge?: FocusScopeEdgePolicy;
  forwardEdge?: FocusScopeEdgePolicy;
}

export interface IndexFocusScopeConfig {
  itemCount: number;
  currentIndex: number;
  intent: TvIntent;
  backwardIntent: TvIntent;
  forwardIntent: TvIntent;
  backwardEdge?: FocusScopeEdgePolicy;
  forwardEdge?: FocusScopeEdgePolicy;
}

export interface UseIndexFocusGroupConfig {
  itemCount: number;
  currentIndex: number;
  setCurrentIndex: (nextIndex: number) => void;
  backwardIntent: TvIntent;
  forwardIntent: TvIntent;
  backwardEdge?: FocusScopeEdgePolicy;
  forwardEdge?: FocusScopeEdgePolicy;
}

export function resolveLinearFocusScope<T extends string>(
  config: LinearFocusScopeConfig<T>,
): FocusScopeResult<T> {
  const {
    items,
    current,
    intent,
    backwardIntent,
    forwardIntent,
    backwardEdge = "bubble",
    forwardEdge = "bubble",
  } = config;

  const currentIndex = items.indexOf(current);
  if (currentIndex < 0) {
    return { handled: false, next: current };
  }

  if (intent === backwardIntent) {
    if (currentIndex > 0) {
      return { handled: true, next: items[currentIndex - 1] };
    }
    if (backwardEdge === "wrap") {
      return { handled: true, next: items[items.length - 1] };
    }
    if (backwardEdge === "stay") {
      return { handled: true, next: current };
    }
    return { handled: false, next: current };
  }

  if (intent === forwardIntent) {
    if (currentIndex < items.length - 1) {
      return { handled: true, next: items[currentIndex + 1] };
    }
    if (forwardEdge === "wrap") {
      return { handled: true, next: items[0] };
    }
    if (forwardEdge === "stay") {
      return { handled: true, next: current };
    }
    return { handled: false, next: current };
  }

  return { handled: false, next: current };
}

export function useLinearFocusGroup<T extends string>(
  config: UseLinearFocusGroupConfig<T>,
) {
  const {
    items,
    current,
    setCurrent,
    backwardIntent,
    forwardIntent,
    backwardEdge = "bubble",
    forwardEdge = "bubble",
  } = config;

  const handleIntent = useCallback(
    (intent: TvIntent): FocusScopeResult<T> => {
      const result = resolveLinearFocusScope({
        items,
        current,
        intent,
        backwardIntent,
        forwardIntent,
        backwardEdge,
        forwardEdge,
      });
      if (result.handled && result.next !== current) {
        setCurrent(result.next);
      }
      return result;
    },
    [
      backwardEdge,
      backwardIntent,
      current,
      forwardEdge,
      forwardIntent,
      items,
      setCurrent,
    ],
  );

  return {
    handleIntent,
  };
}

export function resolveIndexFocusScope(
  config: IndexFocusScopeConfig,
): FocusScopeResult<number> {
  const {
    itemCount,
    currentIndex,
    intent,
    backwardIntent,
    forwardIntent,
    backwardEdge = "bubble",
    forwardEdge = "bubble",
  } = config;

  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) {
    return { handled: false, next: currentIndex };
  }

  if (intent === backwardIntent) {
    if (currentIndex > 0) {
      return { handled: true, next: currentIndex - 1 };
    }
    if (backwardEdge === "wrap") {
      return { handled: true, next: itemCount - 1 };
    }
    if (backwardEdge === "stay") {
      return { handled: true, next: currentIndex };
    }
    return { handled: false, next: currentIndex };
  }

  if (intent === forwardIntent) {
    if (currentIndex < itemCount - 1) {
      return { handled: true, next: currentIndex + 1 };
    }
    if (forwardEdge === "wrap") {
      return { handled: true, next: 0 };
    }
    if (forwardEdge === "stay") {
      return { handled: true, next: currentIndex };
    }
    return { handled: false, next: currentIndex };
  }

  return { handled: false, next: currentIndex };
}

export function useIndexFocusGroup(config: UseIndexFocusGroupConfig) {
  const {
    itemCount,
    currentIndex,
    setCurrentIndex,
    backwardIntent,
    forwardIntent,
    backwardEdge = "bubble",
    forwardEdge = "bubble",
  } = config;

  const handleIntent = useCallback(
    (intent: TvIntent): FocusScopeResult<number> => {
      const result = resolveIndexFocusScope({
        itemCount,
        currentIndex,
        intent,
        backwardIntent,
        forwardIntent,
        backwardEdge,
        forwardEdge,
      });
      if (result.handled && result.next !== currentIndex) {
        setCurrentIndex(result.next);
      }
      return result;
    },
    [
      backwardEdge,
      backwardIntent,
      currentIndex,
      forwardEdge,
      forwardIntent,
      itemCount,
      setCurrentIndex,
    ],
  );

  return {
    handleIntent,
  };
}
