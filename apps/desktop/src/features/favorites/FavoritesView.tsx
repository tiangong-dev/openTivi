import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import type { Channel } from "../../types/api";

interface Props {
  onPlay: (channel: Channel) => void;
}

export function FavoritesView({ onPlay }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadFavorites = async () => {
    try {
      const list = await tauriInvoke<Channel[]>("list_favorites");
      setChannels(list);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  useEffect(() => {
    loadFavorites();
  }, []);

  const unfavorite = async (ch: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: false } });
      loadFavorites();
    } catch (_) {}
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        Favorites · {channels.length} channels
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

      {channels.length === 0 && !error && (
        <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
          No favorites yet. Star channels from the <b>Channels</b> view.
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {channels.map((ch) => (
          <div
            key={ch.id}
            style={rowStyle}
            onClick={() => onPlay(ch)}
          >
            {ch.logoUrl ? (
              <img
                src={ch.logoUrl}
                alt=""
                style={{ width: 32, height: 32, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div style={{ width: 32, height: 32, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ch.channelNumber && <span style={{ color: "var(--text-secondary)", marginRight: 8 }}>{ch.channelNumber}</span>}
                {ch.name}
              </div>
              {ch.groupName && (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ch.groupName}</div>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); unfavorite(ch); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#f59e0b" }}
            >
              ★
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(ch); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--accent)" }}
            >
              ▶
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  cursor: "pointer",
};
