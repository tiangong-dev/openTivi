import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import { tr, type Locale } from "../../lib/i18n";
import type { Channel, EpgProgram } from "../../types/api";

interface Props {
  locale: Locale;
  favoritesOnly?: boolean;
  onPlay?: (channel: Channel, allChannels?: Channel[]) => void;
}

export function ChannelsView({ locale, favoritesOnly = false, onPlay }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [epgPrograms, setEpgPrograms] = useState<EpgProgramTimelineItem[]>([]);
  const [epgLoading, setEpgLoading] = useState(false);
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

  useEffect(() => {
    if (channels.length === 0) {
      setSelectedChannelId(null);
      setEpgPrograms([]);
      return;
    }
    const exists = channels.some((c) => c.id === selectedChannelId);
    if (!exists) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) {
      setEpgPrograms([]);
      return;
    }
    let cancelled = false;
    const loadEpg = async () => {
      setEpgLoading(true);
      try {
        const list = await tauriInvoke<EpgProgram[]>("get_channel_epg", {
          query: { channelId: selectedChannelId },
        });
        if (cancelled) return;
        const now = Date.now();
        const filtered = list
          .map((p) => ({
            ...p,
            startTs: parseXmltvDate(p.startAt),
            endTs: parseXmltvDate(p.endAt),
          }))
          .filter((p) => p.startTs !== null && p.endTs !== null)
          .map((p) => ({ ...p, startTs: p.startTs as number, endTs: p.endTs as number }))
          .filter((p) => p.endTs >= now - 60 * 60 * 1000)
          .slice(0, 24);
        setEpgPrograms(filtered);
      } catch (_) {
        if (!cancelled) {
          setEpgPrograms([]);
        }
      } finally {
        if (!cancelled) {
          setEpgLoading(false);
        }
      }
    };
    void loadEpg();
    return () => {
      cancelled = true;
    };
  }, [selectedChannelId]);

  const toggleFavorite = async (ch: Channel) => {
    try {
      await tauriInvoke("set_favorite", { input: { channelId: ch.id, favorite: !ch.isFavorite } });
      loadChannels();
    } catch (_) {}
  };

  const selectedChannel = channels.find((c) => c.id === selectedChannelId) ?? null;

  return (
    <div style={{ padding: 24, display: "flex", gap: 16, height: "100%" }}>
      {/* Group sidebar */}
      {groups.length > 0 && (
        <div style={{ width: 180, flexShrink: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
            {tr(locale, "Groups", "分组")}
          </div>
          <button
            onClick={() => setSelectedGroup(null)}
            style={{
              ...groupBtnStyle,
              backgroundColor: selectedGroup === null ? "var(--bg-tertiary)" : "transparent",
            }}
          >
            {tr(locale, "All", "全部")}
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
          placeholder={tr(locale, "Search channels...", "搜索频道...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}

        {channels.length === 0 && !error && (
          <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
            {tr(locale, "No channels. Go to ", "暂无频道。请前往")}<b>{tr(locale, "Sources", "源")}</b>{tr(locale, " to import an M3U or Xtream source.", "导入 M3U 或 Xtream 源。")}
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
          {channels.map((ch) => (
            <div
              key={ch.id}
              style={{
                ...channelRowStyle,
                backgroundColor: selectedChannelId === ch.id ? "var(--bg-tertiary)" : "transparent",
              }}
              onClick={() => setSelectedChannelId(ch.id)}
              onDoubleClick={() => onPlay?.(ch, channels)}
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
                onClick={() => onPlay?.(ch, channels)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--accent)" }}
              >
                ▶
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* EPG timeline panel */}
      <div style={timelinePanelStyle}>
        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          {tr(locale, "Timeline", "时间线")}
        </div>
        {selectedChannel ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {selectedChannel.name}
            </div>
            <TimelineStrip programs={epgPrograms} locale={locale} />
            {epgLoading && (
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {tr(locale, "Loading guide...", "正在加载节目单...")}
              </div>
            )}
            {!epgLoading && epgPrograms.length === 0 && (
              <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                {tr(locale, "No guide data for this channel.", "当前频道暂无节目单数据。")}
              </div>
            )}
            {!epgLoading && epgPrograms.length > 0 && (
              <div style={{ marginTop: 8, overflowY: "auto", flex: 1 }}>
                {epgPrograms.slice(0, 12).map((p) => {
                  const now = Date.now();
                  const isCurrent = p.startTs <= now && now < p.endTs;
                  return (
                    <div
                      key={p.id}
                      style={{
                        ...epgRowStyle,
                        borderColor: isCurrent ? "var(--accent)" : "var(--border)",
                        backgroundColor: isCurrent ? "#2563eb22" : "transparent",
                      }}
                    >
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        {formatTime(p.startTs)} - {formatTime(p.endTs)}
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.title}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
            {tr(locale, "Select a channel to view guide.", "选择频道以查看节目单。")}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineStrip({ programs, locale }: { programs: EpgProgramTimelineItem[]; locale: Locale }) {
  const now = Date.now();
  const windowStart = now - 30 * 60 * 1000;
  const windowEnd = now + 3.5 * 60 * 60 * 1000;
  const span = windowEnd - windowStart;
  const visible = programs.filter((p) => p.endTs > windowStart && p.startTs < windowEnd);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
        <span>{formatTime(windowStart)}</span>
        <span>{tr(locale, "Now", "现在")}</span>
        <span>{formatTime(windowEnd)}</span>
      </div>
      <div style={timelineStripStyle}>
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: 2,
            left: `${((now - windowStart) / span) * 100}%`,
            backgroundColor: "var(--accent)",
            zIndex: 3,
          }}
        />
        {visible.map((p) => {
          const start = Math.max(p.startTs, windowStart);
          const end = Math.min(p.endTs, windowEnd);
          const left = ((start - windowStart) / span) * 100;
          const width = Math.max(1.5, ((end - start) / span) * 100);
          return (
            <div
              key={`t-${p.id}`}
              title={`${p.title} (${formatTime(p.startTs)} - ${formatTime(p.endTs)})`}
              style={{
                position: "absolute",
                left: `${left}%`,
                width: `${width}%`,
                top: 2,
                bottom: 2,
                borderRadius: 4,
                backgroundColor: "#2563eb55",
                border: "1px solid #2563ebaa",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                fontSize: 10,
                color: "#eaf2ff",
                padding: "2px 4px",
              }}
            >
              {p.title}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseXmltvDate(raw: string): number | null {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/);
  if (!match) {
    const fallback = Date.parse(raw);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const [, y, mo, d, h, mi, s, offset] = match;
  const tz = offset ? `${offset.slice(0, 3)}:${offset.slice(3)}` : "Z";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`;
  const ts = Date.parse(iso);
  return Number.isNaN(ts) ? null : ts;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface EpgProgramTimelineItem extends EpgProgram {
  startTs: number;
  endTs: number;
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

const timelinePanelStyle: React.CSSProperties = {
  width: 360,
  maxWidth: "38vw",
  minWidth: 280,
  border: "1px solid var(--border)",
  borderRadius: 8,
  backgroundColor: "var(--bg-secondary)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const timelineStripStyle: React.CSSProperties = {
  position: "relative",
  height: 42,
  border: "1px solid var(--border)",
  borderRadius: 6,
  backgroundColor: "var(--bg-tertiary)",
  overflow: "hidden",
};

const epgRowStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
  marginBottom: 6,
};
