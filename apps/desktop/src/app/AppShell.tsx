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

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("sources");
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);
  const [channelList, setChannelList] = useState<Channel[]>([]);
  const [locale, setLocale] = useState<Locale>(detectDefaultLocale());
  const [focusedNavIndex, setFocusedNavIndex] = useState(0);
  const [hoveredNavKey, setHoveredNavKey] = useState<View | null>(null);
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  useEffect(() => {
    setFocusedNavIndex((prev) => Math.min(prev, navItems.length - 1));
  }, [navItems.length]);

  const activateView = (view: View) => {
    setActiveView(view);
    setPlayingChannel(null);
  };

  const focusNavByIndex = (nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, navItems.length - 1));
    setFocusedNavIndex(clamped);
    navButtonRefs.current[clamped]?.focus();
  };

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
            onFocus={() => setFocusedNavIndex(index)}
            onMouseEnter={() => setHoveredNavKey(item.key)}
            onMouseLeave={() => setHoveredNavKey((prev) => (prev === item.key ? null : prev))}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusNavByIndex(index + 1);
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                focusNavByIndex(index - 1);
                return;
              }
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activateView(item.key);
              }
            }}
            style={{
              ...navBtnStyle,
              ...(activeView === item.key || hoveredNavKey === item.key || focusedNavIndex === index ? navBtnActiveStyle : null),
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main style={mainStyle}>
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
