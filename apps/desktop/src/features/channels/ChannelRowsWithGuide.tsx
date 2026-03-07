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
  const nowTitle = snapshot.now?.title ?? tr(locale, "No data", "暂无");
  const nextTitle = snapshot.next?.title ?? tr(locale, "No data", "暂无");

  const nowStart = parseXmltvDate(snapshot.now?.startAt ?? "");
  const nowEnd = parseXmltvDate(snapshot.now?.endAt ?? "");
  const nextStart = parseXmltvDate(snapshot.next?.startAt ?? "");
  const nextEnd = parseXmltvDate(snapshot.next?.endAt ?? "");
  const currentTs = Date.now();

  const nowDuration = durationMs(nowStart, nowEnd);
  const nextDuration = durationMs(nextStart, nextEnd);

  const total = nowDuration + nextDuration;
  const nowRatio = total > 0 ? nowDuration / total : snapshot.now ? 0.6 : 0.4;
  const nowWidthPercent = Math.round(clamp(nowRatio, 0.25, 0.8) * 100);
  const nextWidthPercent = 100 - nowWidthPercent;

  let progressPercent = 0;
  if (nowStart !== null && nowEnd !== null && nowEnd > nowStart) {
    progressPercent = clamp((currentTs - nowStart) / (nowEnd - nowStart), 0, 1) * 100;
  }

  const timelineStart = snapshot.now?.startAt ?? snapshot.next?.startAt;
  const timelineEnd = snapshot.next?.endAt ?? snapshot.now?.endAt;

  return (
    <div style={timelineContainerStyle}>
      <div style={timelineHeaderStyle}>
        <span>{tr(locale, "Timeline", "时间轴")}</span>
        {timelineStart && timelineEnd ? (
          <span>
            {formatTime(timelineStart)} - {formatTime(timelineEnd)}
          </span>
        ) : null}
      </div>

      <div style={timelineTrackStyle}>
        <div
          style={{
            ...segmentStyle,
            width: `${snapshot.next ? nowWidthPercent : 100}%`,
            borderRight: snapshot.next ? "1px solid #1d4ed8" : "none",
            backgroundColor: "#2563eb33",
          }}
          title={nowTitle}
        >
          <div style={segmentLabelStyle}>
            {tr(locale, "Now", "当前")} · {nowTitle}
          </div>
          <div style={progressTrackStyle}>
            <div style={{ ...progressFillStyle, width: `${progressPercent}%` }} />
          </div>
        </div>

        {snapshot.next ? (
          <div
            style={{
              ...segmentStyle,
              width: `${nextWidthPercent}%`,
              backgroundColor: "#11182788",
            }}
            title={nextTitle}
          >
            <div style={segmentLabelStyle}>
              {tr(locale, "Next", "下一档")} · {nextTitle}
            </div>
          </div>
        ) : null}
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

const timelineContainerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const timelineHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 10,
  color: "var(--text-secondary)",
};

const timelineTrackStyle: React.CSSProperties = {
  display: "flex",
  height: 30,
  border: "1px solid var(--border)",
  borderRadius: 6,
  overflow: "hidden",
};

const segmentStyle: React.CSSProperties = {
  minWidth: 0,
  padding: "4px 6px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 2,
};

const segmentLabelStyle: React.CSSProperties = {
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const progressTrackStyle: React.CSSProperties = {
  height: 3,
  backgroundColor: "#1f2937",
  borderRadius: 9999,
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  backgroundColor: "var(--accent)",
};
