import { useEffect, useMemo, useState, type ReactNode } from "react";

import { tr, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, ChannelEpgSnapshot } from "../../types/api";

interface Props<T extends Channel = Channel> {
  items: T[];
  locale: Locale;
  onPlay?: (channel: T, allChannels?: T[]) => void;
  onToggleFavorite?: (channel: T) => void;
  renderMeta?: (channel: T) => ReactNode;
}

export function ChannelRowsWithGuide<T extends Channel>({
  items,
  locale,
  onPlay,
  onToggleFavorite,
  renderMeta,
}: Props<T>) {
  const [snapshots, setSnapshots] = useState<Record<number, ChannelEpgSnapshot>>({});
  const [loading, setLoading] = useState(false);

  const channelIds = useMemo(() => items.map((c) => c.id), [items]);

  useEffect(() => {
    if (channelIds.length === 0) {
      setSnapshots({});
      return;
    }
    let cancelled = false;
    const loadSnapshots = async () => {
      setLoading(true);
      try {
        const list = await tauriInvoke<ChannelEpgSnapshot[]>("get_channels_epg_snapshots", {
          query: { channelIds },
        });
        if (cancelled) return;
        const map: Record<number, ChannelEpgSnapshot> = {};
        for (const item of list) {
          map[item.channelId] = item;
        }
        setSnapshots(map);
      } catch {
        if (!cancelled) {
          setSnapshots({});
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [channelIds]);

  return (
    <>
      {items.map((ch) => {
        const snapshot = snapshots[ch.id];
        return (
          <div key={ch.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <div style={rowStyle} onDoubleClick={() => onPlay?.(ch, items)}>
              {ch.logoUrl && (
                <img
                  src={ch.logoUrl}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ch.channelNumber && <span style={{ color: "var(--text-secondary)", marginRight: 8 }}>{ch.channelNumber}</span>}
                  {ch.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {ch.groupName ?? "—"}
                  {renderMeta ? <span style={{ marginLeft: 8 }}>{renderMeta(ch)}</span> : null}
                </div>
              </div>
              {onToggleFavorite ? (
                <button
                  onClick={() => onToggleFavorite(ch)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: ch.isFavorite ? "#f59e0b" : "var(--text-secondary)" }}
                >
                  {ch.isFavorite ? "★" : "☆"}
                </button>
              ) : null}
              <button
                onClick={() => onPlay?.(ch, items)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--accent)" }}
              >
                ▶
              </button>
            </div>

            <div style={guideInlineStyle}>
              {snapshot?.now || snapshot?.next ? (
                <div style={guideHorizontalStyle}>
                  <GuideBlock
                    label={tr(locale, "Now", "当前")}
                    title={snapshot.now?.title}
                    startAt={snapshot.now?.startAt}
                    endAt={snapshot.now?.endAt}
                    active
                    locale={locale}
                  />
                  <GuideBlock
                    label={tr(locale, "Next", "下一档")}
                    title={snapshot.next?.title}
                    startAt={snapshot.next?.startAt}
                    endAt={snapshot.next?.endAt}
                    locale={locale}
                  />
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {loading
                    ? tr(locale, "Loading guide...", "正在加载节目单...")
                    : tr(locale, "No guide data.", "暂无节目单数据。")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function GuideBlock({
  label,
  title,
  startAt,
  endAt,
  active = false,
  locale,
}: {
  label: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  active?: boolean;
  locale: Locale;
}) {
  return (
    <div
      style={{
        ...guideBlockStyle,
        borderColor: active ? "var(--accent)" : "var(--border)",
        backgroundColor: active ? "#2563eb22" : "transparent",
      }}
    >
      <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
        {label}
        {startAt && endAt ? ` · ${formatTime(startAt)}-${formatTime(endAt)}` : ""}
      </div>
      <div style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {title ?? tr(locale, "No data", "暂无")}
      </div>
    </div>
  );
}

function formatTime(raw: string): string {
  const ts = parseXmltvDate(raw);
  if (ts === null) return raw;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
};

const guideInlineStyle: React.CSSProperties = {
  padding: "0 8px 8px 46px",
};

const guideHorizontalStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 6,
};

const guideBlockStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "4px 6px",
};
