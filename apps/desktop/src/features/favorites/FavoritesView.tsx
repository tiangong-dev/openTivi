import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { tr, type Locale } from "../../lib/i18n";
import type { Channel } from "../../types/api";
import { ChannelRowsWithGuide } from "../channels/ChannelRowsWithGuide";

interface Props {
  locale: Locale;
  onPlay?: (channel: Channel, allChannels?: Channel[]) => void;
}

export function FavoritesView({ locale, onPlay }: Props) {
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
        {tr(locale, "Favorites", "收藏")} · {channels.length} {tr(locale, "channels", "频道")}
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

      {channels.length === 0 && !error && (
        <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
          {tr(locale, "No favorites yet. Star channels from the ", "暂无收藏。请在")}<b>{tr(locale, "Channels", "频道")}</b>{tr(locale, " view.", "中收藏频道。")}
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <ChannelRowsWithGuide
          items={channels}
          locale={locale}
          onPlay={onPlay}
          onToggleFavorite={unfavorite}
        />
      </div>
    </div>
  );
}
