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
                <GuideTimeline snapshot={snapshot} locale={locale} />
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

function GuideTimeline({ snapshot, locale }: { snapshot: ChannelEpgSnapshot; locale: Locale }) {
  const nowStart = parseXmltvDate(snapshot.now?.startAt ?? "");
  const nowEnd = parseXmltvDate(snapshot.now?.endAt ?? "");
  const nextStart = parseXmltvDate(snapshot.next?.startAt ?? "");
  const nextEnd = parseXmltvDate(snapshot.next?.endAt ?? "");

  const nowDuration = durationMs(nowStart, nowEnd);
  const nextDuration = durationMs(nextStart, nextEnd);
  const totalDuration = nowDuration + nextDuration;

  const fallbackNow = snapshot.now ? 0.62 : 0.5;
  const rawNowRatio = totalDuration > 0 ? nowDuration / totalDuration : fallbackNow;
  const nowRatio = snapshot.next ? rawNowRatio : 1;
  const nowWidth = `${Math.round(nowRatio * 100)}%`;
  const nextWidth = `${100 - Math.round(nowRatio * 100)}%`;

  let progress = 0;
  if (nowStart !== null && nowEnd !== null && nowEnd > nowStart) {
    progress = clamp((Date.now() - nowStart) / (nowEnd - nowStart), 0, 1);
  }
  const currentMarker = clamp(nowRatio * progress, 0, 1);
  const splitMarker = snapshot.next ? clamp(nowRatio, 0, 1) : null;

  return (
    <div style={timelineStyle}>
      <div
        style={{
          ...timelineSegmentStyle,
          width: nowWidth,
          background: "linear-gradient(180deg, #1d4ed855 0%, #1d4ed822 100%)",
          borderRight: snapshot.next ? "1px solid #1f2937" : "none",
        }}
        title={snapshot.now?.title ?? ""}
      >
        <div
          style={{
            ...timelineProgressStyle,
            width: `${Math.round(progress * 100)}%`,
          }}
        />
        <div style={timelineTextStyle}>
          {tr(locale, "Now", "当前")} · {snapshot.now?.title ?? tr(locale, "No guide", "暂无节目")}
        </div>
      </div>
      {snapshot.next ? (
        <div
          style={{
            ...timelineSegmentStyle,
            width: nextWidth,
            backgroundColor: "#111827aa",
          }}
          title={snapshot.next.title}
        >
          <div style={timelineTextStyle}>
            {tr(locale, "Next", "下一档")} · {snapshot.next.title}
          </div>
        </div>
      ) : null}
      {splitMarker !== null ? (
        <div style={{ ...timelineSplitStyle, left: `${(splitMarker * 100).toFixed(2)}%` }}>
          {snapshot.next?.startAt ? (
            <div style={timelineSplitLabelStyle}>{formatTime(snapshot.next.startAt)}</div>
          ) : null}
        </div>
      ) : null}
      {snapshot.now ? <div style={{ ...timelineCursorStyle, left: `${(currentMarker * 100).toFixed(2)}%` }} /> : null}
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

function durationMs(start: number | null, end: number | null): number {
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

const timelineStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "stretch",
  height: 28,
  overflow: "hidden",
  border: "1px solid var(--border)",
  borderRadius: 6,
  backgroundColor: "#0b1220",
};

const timelineSegmentStyle: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  padding: "0 8px 4px 8px",
  overflow: "hidden",
};

const timelineTextStyle: React.CSSProperties = {
  position: "relative",
  zIndex: 1,
  fontSize: 11,
  textAlign: "left",
  width: "100%",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const timelineProgressStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  bottom: 0,
  backgroundColor: "#2563eb2f",
};

const timelineSplitStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 0,
  borderLeft: "1px solid #cbd5e1aa",
  pointerEvents: "none",
};

const timelineSplitLabelStyle: React.CSSProperties = {
  position: "absolute",
  top: 1,
  left: 3,
  fontSize: 9,
  color: "#cbd5e1",
  whiteSpace: "nowrap",
  opacity: 0.8,
};

const timelineCursorStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  backgroundColor: "var(--accent)",
  pointerEvents: "none",
};
