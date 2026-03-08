import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { t, type Locale } from "../../lib/i18n";
import type { Channel } from "../../types/api";
import { ChannelRowsWithGuide } from "./ChannelRowsWithGuide";

interface Props {
  locale: Locale;
  favoritesOnly?: boolean;
  onPlay?: (channel: Channel, allChannels?: Channel[]) => void;
}

export function ChannelsView({ locale, favoritesOnly = false, onPlay }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadChannels = async () => {
    try {
      const list = await tauriInvoke<Channel[]>("list_channels", {
        query: {
          groupName: selectedGroup,
          search: search || undefined,
          favoritesOnly,
          limit: 500,
          offset: 0,
        },
      });
      setChannels(list);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const loadGroups = async () => {
    try {
      const g = await tauriInvoke<string[]>("list_groups", {});
      setGroups(g);
    } catch (_) {}
  };

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    loadChannels();
  }, [selectedGroup, search, favoritesOnly]);

  const toggleFavorite = async (ch: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: !ch.isFavorite } });
      loadChannels();
    } catch (_) {}
  };

  return (
    <div style={{ padding: 24, display: "flex", gap: 16, height: "100%" }}>
      {/* Group sidebar */}
      {groups.length > 0 && (
        <div style={{ width: 180, flexShrink: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            {t(locale, "channels.groups")}
          </div>
          <button
            onClick={() => setSelectedGroup(null)}
            style={{
              ...groupBtnStyle,
              backgroundColor: selectedGroup === null ? "var(--bg-tertiary)" : "transparent",
            }}
          >
            {t(locale, "channels.all")}
          </button>
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              style={{
                ...groupBtnStyle,
                backgroundColor: selectedGroup === g ? "var(--bg-tertiary)" : "transparent",
              }}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {/* Channel list */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <input
          style={searchStyle}
          placeholder={t(locale, "channels.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}

        {channels.length === 0 && !error && (
          <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
            {t(locale, "channels.emptyPrefix")}<b>{t(locale, "channels.emptySources")}</b>{t(locale, "channels.emptySuffix")}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
          <ChannelRowsWithGuide
            items={channels}
            locale={locale}
            onPlay={onPlay}
            onToggleFavorite={toggleFavorite}
          />
        </div>
      </div>
    </div>
  );
}

const groupBtnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 10px",
  border: "none",
  color: "var(--text-primary)",
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  borderRadius: 4,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const searchStyle: React.CSSProperties = {
  padding: "8px 10px",
  backgroundColor: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: 14,
};

