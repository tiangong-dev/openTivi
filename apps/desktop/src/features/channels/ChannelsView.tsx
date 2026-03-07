import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import type { Channel } from "../../types/api";

interface Props {
  onPlay?: (channel: Channel) => void;
}

export function ChannelsView({ onPlay }: Props) {
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
  }, [selectedGroup, search]);

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
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>Groups</div>
          <button
            onClick={() => setSelectedGroup(null)}
            style={{
              ...groupBtnStyle,
              backgroundColor: selectedGroup === null ? "var(--bg-tertiary)" : "transparent",
            }}
          >
            All
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <input
          style={searchStyle}
          placeholder="Search channels..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}

        {channels.length === 0 && !error && (
          <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
            No channels. Go to <b>Sources</b> to import an M3U or Xtream source.
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
          {channels.map((ch) => (
            <div
              key={ch.id}
              style={channelRowStyle}
              onDoubleClick={() => onPlay?.(ch)}
            >
              {ch.logoUrl && (
                <img
                  src={ch.logoUrl}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
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
                onClick={() => toggleFavorite(ch)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: ch.isFavorite ? "#f59e0b" : "var(--text-secondary)" }}
              >
                {ch.isFavorite ? "★" : "☆"}
              </button>
              <button
                onClick={() => onPlay?.(ch)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--accent)" }}
              >
                ▶
              </button>
            </div>
          ))}
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

const channelRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
  cursor: "default",
};
