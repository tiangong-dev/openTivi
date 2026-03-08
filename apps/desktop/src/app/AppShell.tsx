import { useEffect, useState } from "react";
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
        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => { setActiveView(item.key); setPlayingChannel(null); }}
            style={{
              ...navBtnStyle,
              backgroundColor:
                activeView === item.key ? "var(--bg-tertiary)" : "transparent",
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
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
};
