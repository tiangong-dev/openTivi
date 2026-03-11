import { useEffect, useState } from "react";

import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, RecentChannel } from "../../types/api";
import { ChannelRowsWithGuide } from "../channels/ChannelRowsWithGuide";

interface Props {
  locale: Locale;
  onPlay?: (channel: Channel) => void;
}

export function RecentsView({ locale, onPlay }: Props) {
  const [items, setItems] = useState<RecentChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRecents = async () => {
    try {
      const list = await tauriInvoke<RecentChannel[]>("list_recents", { limit: 200 });
      setItems(list);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  useEffect(() => {
    void loadRecents();
  }, []);

  const toggleFavorite = async (ch: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: !ch.isFavorite } });
      void loadRecents();
    } catch (_) {}
  };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <h2 style={{ margin: 0 }}>{t(locale, "recents.title")}</h2>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
      {!error && items.length === 0 && (
        <div style={{ color: "var(--text-secondary)" }}>
          {t(locale, "recents.empty")}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <ChannelRowsWithGuide
          items={items}
          locale={locale}
          onPlay={onPlay}
          onToggleFavorite={toggleFavorite}
          keyboardNavigationEnabled
          active
          renderMeta={(ch) => (
            <>
              {t(locale, "recents.played")} {ch.playCount} · {t(locale, "recents.lastWatched")} {formatRelativeTime(ch.lastWatchedAt, locale)}
            </>
          )}
        />
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string, locale: Locale): string {
  const now = Date.now();
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;

  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return t(locale, "recents.justNow");
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return t(locale, "recents.minutesAgo", { minutes: mins });
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return t(locale, "recents.hoursAgo", { hours });
  }
  if (diffSec < 172800) return t(locale, "recents.yesterday");
  const days = Math.floor(diffSec / 86400);
  return t(locale, "recents.daysAgo", { days });
}
