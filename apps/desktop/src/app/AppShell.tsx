import { useState } from "react";
import { SourcesView } from "../features/sources/SourcesView";
import { ChannelsView } from "../features/channels/ChannelsView";
import { VideoPlayer } from "../features/player/VideoPlayer";
import type { Channel } from "../types/api";

type View = "channels" | "favorites" | "recents" | "sources" | "settings";

const NAV_ITEMS: { key: View; label: string }[] = [
  { key: "channels", label: "Channels" },
  { key: "favorites", label: "Favorites" },
  { key: "recents", label: "Recents" },
  { key: "sources", label: "Sources" },
  { key: "settings", label: "Settings" },
];

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("sources");
  const [playingChannel, setPlayingChannel] = useState<Channel | null>(null);

  const handlePlay = (ch: Channel) => {
    setPlayingChannel(ch);
  };

  const renderView = () => {
    switch (activeView) {
      case "sources":
        return <SourcesView />;
      case "channels":
        return <ChannelsView onPlay={handlePlay} />;
      case "favorites":
        return <ChannelsView onPlay={handlePlay} />;
      case "recents":
        return <Placeholder name="Recents" />;
      case "settings":
        return <Placeholder name="Settings" />;
    }
  };

  return (
    <>
      <nav style={sidebarStyle}>
        {NAV_ITEMS.map((item) => (
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
            onClose={() => setPlayingChannel(null)}
          />
        ) : (
          renderView()
        )}
      </main>
    </>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ padding: 24, color: "var(--text-secondary)" }}>
      {name} — coming soon
    </div>
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


