import { useEffect, useRef, useState } from "react";
import { useIndexFocusGroup } from "../lib/focusScope";
import { SourcesView } from "../features/sources/SourcesView";
import { ChannelsView } from "../features/channels/ChannelsView";
import { FavoritesView } from "../features/favorites/FavoritesView";
import { RecentsView } from "../features/recents/RecentsView";
import { SettingsView } from "../features/settings/SettingsView";
import { VideoPlayer } from "../features/player/VideoPlayer";
import {
  APP_START_VIEW_SETTING_KEY,
  DEFAULT_APP_START_VIEW,
  PLAYER_LAST_CHANNEL_ID_SETTING_KEY,
  resolveAppStartView,
  resolvePlayerLastChannelId,
  type AppStartView,
} from "../lib/settings";
import { tauriInvoke } from "../lib/tauri";
import { mapKeyToTvIntent, TvIntent, type TvContentKeyDetail } from "../lib/tvInput";
import { detectDefaultLocale, LOCALE_SETTING_KEY, resolveLocale, t, type Locale } from "../lib/i18n";
import type { Channel, Setting } from "../types/api";

type View = AppStartView;
type FocusZone = "nav" | "content";

export function AppShell() {
  const [activeView, setActiveView] = useState<View>(DEFAULT_APP_START_VIEW);
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
  const [channelList, setChannelList] = useState<Channel[]>([]);
  const [locale, setLocale] = useState<Locale>(detectDefaultLocale());
  const [focusedNavIndex, setFocusedNavIndex] = useState(0);
  const [focusZone, setFocusZone] = useState<FocusZone>("nav");
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauriInvoke<Setting[]>("get_settings");
        const localeSetting = settings.find((s) => s.key === LOCALE_SETTING_KEY);
        const startViewSetting = settings.find((s) => s.key === APP_START_VIEW_SETTING_KEY);
        const lastChannelSetting = settings.find((s) => s.key === PLAYER_LAST_CHANNEL_ID_SETTING_KEY);
        setLocale(resolveLocale(localeSetting?.value));
        setActiveView(resolveAppStartView(startViewSetting?.value));
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

  useEffect(() => {
    const currentIndex = navItems.findIndex((item) => item.key === activeView);
    if (currentIndex >= 0) {
      setFocusedNavIndex(currentIndex);
    }
  }, [activeView]);

  const activateView = (view: View) => {
    setActiveView(view);
    setPlayingChannel(null);
  };

  const focusNavByIndex = (nextIndex: number) => {
    if (navItems.length === 0) return;
    const wrapped = ((nextIndex % navItems.length) + navItems.length) % navItems.length;
    setFocusedNavIndex(wrapped);
    navButtonRefs.current[wrapped]?.focus();
  };

  const focusContent = () => {
    window.dispatchEvent(new CustomEvent("tv-focus-content", { detail: { view: activeView } }));
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
    window.dispatchEvent(new CustomEvent("tv-focus-zone", { detail: { zone: focusZone, view: activeView } }));
    if (focusZone === "nav") {
      navButtonRefs.current[focusedNavIndex]?.focus();
      return;
    }
    focusContent();
  }, [focusZone, focusedNavIndex, activeView, playingChannel]);

  useEffect(() => {
    if (playingChannel) {
      return;
    }
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
    const dispatchContentKey = (key: string, repeat: boolean): boolean => {
      const detail: TvContentKeyDetail = {
        key,
        view: activeView,
        repeat,
        intent: mapKeyToTvIntent(key),
      };
      const contentEvent = new CustomEvent("tv-content-key", {
        detail,
        cancelable: true,
      });
      // dispatchEvent returns false when preventDefault() is called by listeners.
      return !window.dispatchEvent(contentEvent);
    };
    const dispatchContentKeyUp = (key: string) => {
      const detail: TvContentKeyDetail = {
        key,
        view: activeView,
        repeat: false,
        intent: mapKeyToTvIntent(key),
      };
      window.dispatchEvent(new CustomEvent("tv-content-keyup", { detail }));
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      // Avoid handling the same key twice when a focused component already handled it.
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
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
        const handledByContent = dispatchContentKey(event.key, event.repeat);
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
        intent === TvIntent.Back ||
        event.key === "Delete" ||
        event.key === "r" ||
        event.key === "R"
      ) {
        event.preventDefault();
        void dispatchContentKey(event.key, event.repeat);
      }
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
      if (focusZone !== "content") return;
      if (mapKeyToTvIntent(event.key) !== TvIntent.Confirm) return;
      event.preventDefault();
      dispatchContentKeyUp(event.key);
    };
    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("keyup", onWindowKeyUp);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("keyup", onWindowKeyUp);
    };
  }, [activeView, focusZone, focusedNavIndex, navFocusGroup, navItems, playingChannel]);

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
    }
  };

  return (
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
            onClick={() => activateView(item.key)}
            onFocus={() => {
              setFocusedNavIndex(index);
              setFocusZone("nav");
            }}
            style={{
              ...navBtnStyle,
              ...(item.key === activeView ? navBtnActiveStyle : null),
              ...(focusZone === "nav" && index === focusedNavIndex ? navBtnCursorStyle : null),
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main ref={mainRef} style={mainStyle}>
        {playingChannel ? (
          <VideoPlayer
            channel={playingChannel}
            channels={channelList}
            locale={locale}
            onClose={() => setPlayingChannel(null)}
            onChannelChange={(ch) => {
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
      </main>
    </>
  );
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
