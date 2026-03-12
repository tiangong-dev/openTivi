import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIndexFocusGroup } from "../lib/focusScope";
import {
  APP_START_VIEW_SETTING_KEY,
  APP_START_VIEWS,
  DEFAULT_APP_START_VIEW,
  PLAYER_LAST_CHANNEL_ID_SETTING_KEY,
  resolveAppStartView,
  resolvePlayerLastChannelId,
  type AppStartView,
} from "../lib/settings";
import { tauriInvoke } from "../lib/tauri";
import { mapKeyToTvIntent, TvIntent, type TvContentKeyDetail } from "../lib/tvInput";
import { detectDefaultLocale, LOCALE_SETTING_KEY, resolveLocale, t, type Locale } from "../lib/i18n";
import {
  NavigationContext,
  type NavigationContentKeyListener,
  type NavigationContentKeyUpListener,
  type NavigationFocusContentListener,
} from "../lib/navigation";
import type { Channel, Setting } from "../types/api";

type View = AppStartView | "dev-components";
type FocusZone = "nav" | "content";
type InputMode = "keyboard" | "pointer";
const isDev = import.meta.env.DEV;

const loadChannelsView = () =>
  import("../features/channels/ChannelsView").then((module) => ({ default: module.ChannelsView }));
const loadFavoritesView = () =>
  import("../features/favorites/FavoritesView").then((module) => ({ default: module.FavoritesView }));
const loadRecentsView = () =>
  import("../features/recents/RecentsView").then((module) => ({ default: module.RecentsView }));
const loadSourcesView = () =>
  import("../features/sources/SourcesView").then((module) => ({ default: module.SourcesView }));
const loadSettingsView = () =>
  import("../features/settings/SettingsView").then((module) => ({ default: module.SettingsView }));
const loadDevComponentsView = () =>
  import("../features/dev/DevComponentsView").then((module) => ({ default: module.DevComponentsView }));
const loadVideoPlayer = () =>
  import("../features/player/VideoPlayer").then((module) => ({ default: module.VideoPlayer }));

const ChannelsView = lazy(loadChannelsView);
const FavoritesView = lazy(loadFavoritesView);
const RecentsView = lazy(loadRecentsView);
const SourcesView = lazy(loadSourcesView);
const SettingsView = lazy(loadSettingsView);
const DevComponentsView = lazy(loadDevComponentsView);
const VideoPlayer = lazy(loadVideoPlayer);

const viewPreloaders: Record<View, () => Promise<unknown>> = {
  channels: loadChannelsView,
  favorites: loadFavoritesView,
  recents: loadRecentsView,
  sources: loadSourcesView,
  settings: loadSettingsView,
  "dev-components": loadDevComponentsView,
};

function scheduleIdleWork(callback: IdleRequestCallback): number {
  const host = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: IdleRequestCallback) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof host.requestIdleCallback === "function") {
    return host.requestIdleCallback(callback);
  }
  return window.setTimeout(
    () => callback({ didTimeout: false, timeRemaining: () => 0 } as IdleDeadline),
    150,
  );
}

function cancelIdleWork(handle: number) {
  const host = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: IdleRequestCallback) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof host.cancelIdleCallback === "function") {
    host.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

export function AppShell() {
  const [activeView, setActiveView] = useState<View>(DEFAULT_APP_START_VIEW);
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
  const [channelList, setChannelList] = useState<Channel[]>([]);
  const [locale, setLocale] = useState<Locale>(detectDefaultLocale());
  const [focusedNavIndex, setFocusedNavIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>("nav");
  const [inputMode, setInputMode] = useState<InputMode>("keyboard");
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mainRef = useRef<HTMLElement | null>(null);
  const focusContentListenersRef = useRef<Set<NavigationFocusContentListener>>(new Set());
  const contentKeyListenersRef = useRef<Set<NavigationContentKeyListener>>(new Set());
  const contentKeyUpListenersRef = useRef<Set<NavigationContentKeyUpListener>>(new Set());

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauriInvoke<Setting[]>("get_settings");
        const localeSetting = settings.find((s) => s.key === LOCALE_SETTING_KEY);
        const startViewSetting = settings.find((s) => s.key === APP_START_VIEW_SETTING_KEY);
        const lastChannelSetting = settings.find((s) => s.key === PLAYER_LAST_CHANNEL_ID_SETTING_KEY);
        const startView = resolveAppStartView(startViewSetting?.value);
        setLocale(resolveLocale(localeSetting?.value));
        setActiveView(startView);
        setFocusedNavIndex(Math.max(0, APP_START_VIEWS.indexOf(startView)));
        const lastChannelId = resolvePlayerLastChannelId(lastChannelSetting?.value);
        if (lastChannelId) {
          const restored = await tauriInvoke<Channel | null>("get_channel", { channelId: lastChannelId });
          if (restored) {
            const allChannels = await tauriInvoke<Channel[]>("list_channels", {
              query: { limit: 5000, offset: 0 },
            }).catch(() => [restored]);
            setPlayingChannel(restored);
            setChannelList(allChannels);
          }
        }
      } catch {
        setLocale(detectDefaultLocale());
        setActiveView(DEFAULT_APP_START_VIEW);
      }
    };
    void loadSettings();
  }, []);

  useEffect(() => {
    const currentViewPreloader = viewPreloaders[activeView];
    void currentViewPreloader();

    const idleHandle = scheduleIdleWork(() => {
      for (const [view, preload] of Object.entries(viewPreloaders) as Array<[View, () => Promise<unknown>]>) {
        if (view === activeView) continue;
        void preload();
      }
      void loadVideoPlayer();
    });

    return () => {
      cancelIdleWork(idleHandle);
    };
  }, [activeView]);

  const subscribeFocusContent = useCallback((listener: NavigationFocusContentListener) => {
    focusContentListenersRef.current.add(listener);
    return () => {
      focusContentListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeContentKey = useCallback((listener: NavigationContentKeyListener) => {
    contentKeyListenersRef.current.add(listener);
    return () => {
      contentKeyListenersRef.current.delete(listener);
    };
  }, []);

  const subscribeContentKeyUp = useCallback((listener: NavigationContentKeyUpListener) => {
    contentKeyUpListenersRef.current.add(listener);
    return () => {
      contentKeyUpListenersRef.current.delete(listener);
    };
  }, []);

  const dispatchFocusContent = useCallback((detail: { view?: View }) => {
    focusContentListenersRef.current.forEach((listener) => listener(detail));
  }, []);

  const dispatchContentKey = useCallback((detail: TvContentKeyDetail): boolean => {
    let handled = false;
    contentKeyListenersRef.current.forEach((listener) => {
      const result = listener(detail);
      if (result === true) {
        handled = true;
      }
    });
    return handled;
  }, []);

  const dispatchContentKeyUp = useCallback((detail: TvContentKeyDetail) => {
    contentKeyUpListenersRef.current.forEach((listener) => listener(detail));
  }, []);

  const handlePlay = (ch: Channel, allChannels?: Channel[]) => {
    void tauriInvoke("mark_recent_watched", { channelId: ch.id }).catch(() => undefined);
    void tauriInvoke("set_setting", {
      input: { key: PLAYER_LAST_CHANNEL_ID_SETTING_KEY, value: ch.id },
    }).catch(() => undefined);
    setPlayingChannel(ch);
    if (allChannels) setChannelList(allChannels);
  };

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
  };

  const navItems: { key: View; label: string }[] = [
    { key: "channels", label: t(locale, "nav.channels") },
    { key: "favorites", label: t(locale, "nav.favorites") },
    { key: "recents", label: t(locale, "nav.recents") },
    { key: "sources", label: t(locale, "nav.sources") },
    { key: "settings", label: t(locale, "nav.settings") },
    ...(isDev ? [{ key: "dev-components" as const, label: t(locale, "nav.devComponents") }] : []),
  ];
  const navFocusGroup = useIndexFocusGroup({
    itemCount: navItems.length,
    currentIndex: focusedNavIndex,
    setCurrentIndex: setFocusedNavIndex,
    backwardIntent: TvIntent.MoveUp,
    forwardIntent: TvIntent.MoveDown,
    backwardEdge: "wrap",
    forwardEdge: "wrap",
  });
  useEffect(() => {
    setFocusedNavIndex((prev) => Math.min(prev, navItems.length - 1));
  }, [navItems.length]);

  const activateView = (view: View, navIndex?: number) => {
    setActiveView(view);
    if (typeof navIndex === "number") {
      setFocusedNavIndex(navIndex);
    }
    setPlayingChannel(null);
  };

  const focusNavByIndex = (nextIndex: number) => {
    if (navItems.length === 0) return;
    const wrapped = ((nextIndex % navItems.length) + navItems.length) % navItems.length;
    setFocusedNavIndex(wrapped);
    navButtonRefs.current[wrapped]?.focus();
  };

  const focusContent = () => {
    dispatchFocusContent({ view: activeView });
    window.setTimeout(() => {
      const target = mainRef.current?.querySelector<HTMLElement>(
        '[data-tv-focusable="true"], [role="button"][tabindex="0"], button, input, select, textarea',
      );
      target?.focus();
    }, 0);
  };

  useEffect(() => {
    if (playingChannel) {
      return;
    }
    window.dispatchEvent(new CustomEvent("tv-focus-zone", {
      detail: { zone: inputMode === "keyboard" ? focusZone : undefined, view: activeView, inputMode },
    }));
    if (inputMode !== "keyboard") {
      return;
    }
    if (focusZone === "nav") {
      navButtonRefs.current[focusedNavIndex]?.focus();
      return;
    }
    focusContent();
  }, [focusZone, focusedNavIndex, activeView, inputMode, playingChannel]);

  useEffect(() => {
    if (playingChannel) {
      return;
    }
    const onWindowPointerDown = () => {
      setInputMode("pointer");
    };
    const isTypingTarget = () => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return false;
      if (element.dataset.tvNavigationPriority === "true") {
        return false;
      }
      const tagName = element.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        element.isContentEditable
      );
    };
    const dispatchContentKeyForInput = (key: string, repeat: boolean): boolean => {
      const detail: TvContentKeyDetail = {
        key,
        view: activeView,
        repeat,
        intent: mapKeyToTvIntent(key),
      };
      return dispatchContentKey(detail);
    };
    const dispatchContentKeyUpForInput = (key: string) => {
      const detail: TvContentKeyDetail = {
        key,
        view: activeView,
        repeat: false,
        intent: mapKeyToTvIntent(key),
      };
      dispatchContentKeyUp(detail);
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      // Avoid handling the same key twice when a focused component already handled it.
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
      if (inputMode !== "keyboard") {
        setInputMode("keyboard");
      }
      const intent = mapKeyToTvIntent(event.key);
      if (focusZone === "nav") {
        if (intent === TvIntent.MoveDown || intent === TvIntent.MoveUp) {
          const result = navFocusGroup.handleIntent(intent);
          if (result.handled) {
            event.preventDefault();
            focusNavByIndex(result.next);
          }
          return;
        }
        if (intent === TvIntent.Confirm) {
          event.preventDefault();
          const selected = navItems[focusedNavIndex];
          if (selected) {
            activateView(selected.key);
          }
          return;
        }
        if (intent === TvIntent.MoveRight) {
          event.preventDefault();
          setFocusZone("content");
        }
        return;
      }
      if (intent === TvIntent.MoveLeft) {
        event.preventDefault();
        const handledByContent = dispatchContentKeyForInput(event.key, event.repeat);
        if (!handledByContent) {
          (document.activeElement as HTMLElement | null)?.blur();
          setFocusZone("nav");
        }
        return;
      }
      if (intent === TvIntent.Back) {
        event.preventDefault();
        const handledByContent = dispatchContentKeyForInput(event.key, event.repeat);
        if (!handledByContent) {
          (document.activeElement as HTMLElement | null)?.blur();
          setFocusZone("nav");
        }
        return;
      }
      if (
        intent === TvIntent.MoveUp ||
        intent === TvIntent.MoveDown ||
        intent === TvIntent.MoveRight ||
        intent === TvIntent.Confirm ||
        intent === TvIntent.SecondaryAction ||
        event.key === "Delete" ||
        event.key === "r" ||
        event.key === "R"
      ) {
        event.preventDefault();
        void dispatchContentKeyForInput(event.key, event.repeat);
      }
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
      if (focusZone !== "content") return;
      if (mapKeyToTvIntent(event.key) !== TvIntent.Confirm) return;
      event.preventDefault();
      dispatchContentKeyUpForInput(event.key);
    };
    window.addEventListener("pointerdown", onWindowPointerDown, true);
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    return () => {
      window.removeEventListener("pointerdown", onWindowPointerDown, true);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
    };
  }, [activeView, dispatchContentKey, dispatchContentKeyUp, focusZone, focusedNavIndex, inputMode, navFocusGroup, navItems, playingChannel]);

  const navigationValue = useMemo(() => ({
    activeView,
    focusZone,
    inputMode,
    dispatchFocusContent,
    dispatchContentKey,
    dispatchContentKeyUp,
    subscribeFocusContent,
    subscribeContentKey,
    subscribeContentKeyUp,
  }), [
    activeView,
    focusZone,
    inputMode,
    dispatchFocusContent,
    dispatchContentKey,
    dispatchContentKeyUp,
    subscribeFocusContent,
    subscribeContentKey,
    subscribeContentKeyUp,
  ]);

  const renderView = () => {
    switch (activeView) {
      case "sources":
        return <SourcesView locale={locale} />;
      case "channels":
        return <ChannelsView locale={locale} onPlay={handlePlay} />;
      case "favorites":
        return <FavoritesView locale={locale} onPlay={handlePlay} />;
      case "recents":
        return <RecentsView locale={locale} onPlay={handlePlay} />;
      case "settings":
        return <SettingsView locale={locale} onLocaleChange={handleLocaleChange} />;
      case "dev-components":
        return <DevComponentsView locale={locale} />;
    }
  };

  return (
    <NavigationContext.Provider value={navigationValue}>
      <>
      <nav style={sidebarStyle}>
        {navItems.map((item, index) => (
          <button
            key={item.key}
            data-tv-nav-button="true"
            data-tv-nav-view={item.key}
            data-tv-nav-active={item.key === activeView ? "true" : undefined}
            ref={(node) => {
              navButtonRefs.current[index] = node;
            }}
            onClick={() => activateView(item.key, index)}
            onFocus={() => {
              setFocusedNavIndex(index);
              if (inputMode === "keyboard") {
                setFocusZone("nav");
              }
            }}
            style={{
              ...navBtnStyle,
              ...(item.key === activeView ? navBtnActiveStyle : null),
              ...(inputMode === "keyboard" && focusZone === "nav" && index === focusedNavIndex ? navBtnCursorStyle : null),
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main ref={mainRef} style={mainStyle}>
        <Suspense fallback={<ViewFallback />}>
          {playingChannel ? (
            <VideoPlayer
              channel={playingChannel}
              channels={channelList}
              locale={locale}
              onClose={() => setPlayingChannel(null)}
              onChannelChange={(ch: Channel) => {
                void tauriInvoke("mark_recent_watched", { channelId: ch.id }).catch(() => undefined);
                void tauriInvoke("set_setting", {
                  input: { key: PLAYER_LAST_CHANNEL_ID_SETTING_KEY, value: ch.id },
                }).catch(() => undefined);
                setPlayingChannel(ch);
              }}
            />
          ) : (
            renderView()
          )}
        </Suspense>
      </main>
      </>
    </NavigationContext.Provider>
  );
}

function ViewFallback() {
  return <div style={viewFallbackStyle} />;
}

const sidebarStyle: React.CSSProperties = {
  width: 200,
  backgroundColor: "var(--bg-secondary)",
  borderRight: "1px solid var(--border)",
  display: "flex",
  flexDirection: "column",
  padding: "16px 0",
  flexShrink: 0,
};

const navBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 16px",
  backgroundColor: "transparent",
  border: "none",
  color: "var(--text-primary)",
  fontSize: 14,
  cursor: "pointer",
  textAlign: "left",
  outline: "none",
};

const navBtnActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 2px 0 0 0 var(--accent)",
};

const navBtnCursorStyle: React.CSSProperties = {
  backgroundColor: "rgba(255, 255, 255, 0.08)",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
};

const viewFallbackStyle: React.CSSProperties = {
  flex: 1,
  backgroundColor: "var(--bg-primary)",
};
