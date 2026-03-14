import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import type { Channel } from "../../types/api";
import { EmptyState, Notice, PageView, SectionLabel } from "../../components/ui";
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
    const previous = channels;
    setChannels((prev) => prev.filter((item) => item.id !== ch.id));
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: false } });
      void loadFavorites();
    } catch (e) {
      setChannels(previous);
      setError(getErrorMessage(e));
    }
  };

  return (
    <PageView style={{ gap: "var(--space-2)" }}>
      <SectionLabel style={{ marginBottom: 0 }}>
        {t(locale, "favorites.title")} · {channels.length} {t(locale, "favorites.channelsUnit")}
      </SectionLabel>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {channels.length === 0 && !error && (
        <EmptyState
          description={(
            <>
              {t(locale, "favorites.emptyPrefix")}<b>{t(locale, "favorites.emptyChannels")}</b>{t(locale, "favorites.emptySuffix")}
            </>
          )}
        />
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        <ChannelRowsWithGuide
          items={channels}
          locale={locale}
          onPlay={onPlay}
          onToggleFavorite={unfavorite}
          keyboardNavigationEnabled
          active
        />
      </div>
    </PageView>
  );
}
