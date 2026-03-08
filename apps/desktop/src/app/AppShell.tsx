import { useEffect, useRef, useState } from "react";
import { SourcesView } from "../features/sources/SourcesView";
import { ChannelsView } from "../features/channels/ChannelsView";
import { FavoritesView } from "../features/favorites/FavoritesView";
import { RecentsView } from "../features/recents/RecentsView";
import { SettingsView } from "../features/settings/SettingsView";
import { VideoPlayer } from "../features/player/VideoPlayer";
import { tauriInvoke } from "../lib/tauri";
import { detectDefaultLocale, LOCALE_SETTING_KEY, resolveLocale, t, type Locale } from "../lib/i18n";
import type { Channel, Setting } from "../types/api";

type View = "channels" | "favorites" | "recents" | "sources" | "settings";
type FocusZone = "nav" | "content";

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("sources");
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
  const [channelList, setChannelList] = useState<Channel[]>([]);
  const [locale, setLocale] = useState<Locale>(detectDefaultLocale());
  const [focusedNavIndex, setFocusedNavIndex] = useState(0);
  const [hoveredNavKey, setHoveredNavKey] = useState<View | null>(null);
  const [focusZone, setFocusZone] = useState<FocusZone>("nav");
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const loadLocale = async () => {
      try {
        const settings = await tauriInvoke<Setting[]>("get_settings");
        const localeSetting = settings.find((s) => s.key === LOCALE_SETTING_KEY);
        setLocale(resolveLocale(localeSetting?.value));
      } catch {
        setLocale(detectDefaultLocale());
      }
    };
    void loadLocale();
  }, []);

  const handlePlay = (ch: Channel, allChannels?: Channel[]) => {
    void tauriInvoke("mark_recent_watched", { channelId: ch.id }).catch(() => undefined);
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
  const hoveredNavIndex = hoveredNavKey ? navItems.findIndex((item) => item.key === hoveredNavKey) : -1;
  const activeViewIndex = navItems.findIndex((item) => item.key === activeView);
  const navVisualActiveIndex =
    focusZone === "nav"
      ? hoveredNavIndex >= 0
        ? hoveredNavIndex
        : focusedNavIndex
      : activeViewIndex;

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
    setHoveredNavKey(null);
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
    const dispatchContentKey = (key: string): boolean => {
      const contentEvent = new CustomEvent("tv-content-key", {
        detail: { key, view: activeView },
        cancelable: true,
      });
      // dispatchEvent returns false when preventDefault() is called by listeners.
      return !window.dispatchEvent(contentEvent);
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      // Avoid handling the same key twice when a focused component already handled it.
      if (event.defaultPrevented) return;
      if (isTypingTarget()) return;
      if (focusZone === "nav") {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusNavByIndex(focusedNavIndex + 1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusNavByIndex(focusedNavIndex - 1);
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const selected = navItems[focusedNavIndex];
          if (selected) {
            activateView(selected.key);
          }
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setFocusZone("content");
        }
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const handledByContent = dispatchContentKey(event.key);
        if (!handledByContent) {
          (document.activeElement as HTMLElement | null)?.blur();
          setFocusZone("nav");
        }
        return;
      }
      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowRight" ||
        event.key === "Enter" ||
        event.key === " " ||
        event.key === "f" ||
        event.key === "F" ||
        event.key === "Delete" ||
        event.key === "Backspace" ||
        event.key === "r" ||
        event.key === "R"
      ) {
        event.preventDefault();
        void dispatchContentKey(event.key);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [activeView, focusZone, focusedNavIndex, navItems, playingChannel]);

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
            ref={(node) => {
              navButtonRefs.current[index] = node;
            }}
            onClick={() => activateView(item.key)}
            onFocus={() => {
              setFocusedNavIndex(index);
              setFocusZone("nav");
            }}
            onMouseEnter={() => setHoveredNavKey(item.key)}
            onMouseLeave={() => setHoveredNavKey((prev) => (prev === item.key ? null : prev))}
            style={{
              ...navBtnStyle,
              ...(index === navVisualActiveIndex ? navBtnActiveStyle : null),
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

const mainStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
};
