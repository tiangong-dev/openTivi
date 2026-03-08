import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { t, type Locale } from "../../lib/i18n";
import {
  DEFAULT_GUIDE_WINDOW_MINUTES,
  GUIDE_WINDOW_MINUTES_SETTING_KEY,
  resolveGuideWindowMinutes,
} from "../../lib/settings";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, ChannelEpgSnapshot, Setting } from "../../types/api";

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
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [guideWindowMinutes, setGuideWindowMinutes] = useState(DEFAULT_GUIDE_WINDOW_MINUTES);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [domFocusedIndex, setDomFocusedIndex] = useState<number | null>(null);
  const [hoveredChannelId, setHoveredChannelId] = useState<number | null>(null);
  const [isContentZoneActive, setIsContentZoneActive] = useState(false);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pendingPlayTimerRef = useRef<number | null>(null);
  const lastConfirmAtRef = useRef(0);

  const channelIds = useMemo(() => items.map((c) => c.id), [items]);
  const timelineWindow = useMemo(() => {
    const step = 30 * 60 * 1000;
    const start = Math.floor(nowTs / step) * step;
    return { start, end: start + guideWindowMinutes * 60 * 1000 };
  }, [nowTs, guideWindowMinutes]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (items.length === 0) {
      setFocusedIndex(0);
      setDomFocusedIndex(null);
      return;
    }
    setFocusedIndex((prev) => Math.min(prev, items.length - 1));
  }, [items.length]);

  useEffect(() => {
    let cancelled = false;
    const loadGuideWindowSetting = async () => {
      try {
        const list = await tauriInvoke<Setting[]>("get_settings");
        if (cancelled) return;
        const raw = list.find((s) => s.key === GUIDE_WINDOW_MINUTES_SETTING_KEY)?.value;
        setGuideWindowMinutes(resolveGuideWindowMinutes(raw));
      } catch {
        if (!cancelled) {
          setGuideWindowMinutes(DEFAULT_GUIDE_WINDOW_MINUTES);
        }
      }
    };
    void loadGuideWindowSetting();
    return () => {
      cancelled = true;
    };
  }, []);

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
          query: {
            channelIds,
            windowStartTs: timelineWindow.start,
            windowEndTs: timelineWindow.end,
          },
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
  }, [channelIds, timelineWindow.start, timelineWindow.end]);

  useEffect(() => {
    return () => {
      if (pendingPlayTimerRef.current !== null) {
        window.clearTimeout(pendingPlayTimerRef.current);
        pendingPlayTimerRef.current = null;
      }
    };
  }, []);

  const clearPendingPlay = () => {
    if (pendingPlayTimerRef.current !== null) {
      window.clearTimeout(pendingPlayTimerRef.current);
      pendingPlayTimerRef.current = null;
    }
  };

  const schedulePlay = (channel: T) => {
    clearPendingPlay();
    pendingPlayTimerRef.current = window.setTimeout(() => {
      pendingPlayTimerRef.current = null;
      onPlay?.(channel, items);
    }, 220);
  };

  const triggerFavorite = (channel: T) => {
    clearPendingPlay();
    onToggleFavorite?.(channel);
  };

  const focusRowByIndex = (nextIndex: number) => {
    if (items.length === 0) return;
    const wrapped = ((nextIndex % items.length) + items.length) % items.length;
    setFocusedIndex(wrapped);
    const rowNode = rowRefs.current[wrapped];
    rowNode?.focus();
    rowNode?.scrollIntoView({ block: "nearest" });
  };

  const handleConfirm = (channel: T) => {
    const now = Date.now();
    if (now - lastConfirmAtRef.current < 280 && onToggleFavorite) {
      triggerFavorite(channel);
      lastConfirmAtRef.current = 0;
      return;
    }
    lastConfirmAtRef.current = now;
    schedulePlay(channel);
  };

  useEffect(() => {
    const onZoneChange = (event: Event) => {
      const detail = (event as CustomEvent<{ zone?: string; view?: string }>).detail;
      const inThisView = !detail?.view || ["channels", "favorites", "recents"].includes(detail.view);
      setIsContentZoneActive(detail?.zone === "content" && inThisView);
      if (detail?.zone === "nav" && inThisView) {
        setDomFocusedIndex(null);
      }
    };
    const onFocusContent = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      if (detail?.view && !["channels", "favorites", "recents"].includes(detail.view)) {
        return;
      }
      if (items.length === 0) return;
      focusRowByIndex(focusedIndex);
    };
    const onContentKey = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; view?: string }>).detail;
      if (detail?.view && !["channels", "favorites", "recents"].includes(detail.view)) {
        return;
      }
      const key = detail?.key;
      if (!key || items.length === 0) return;
      if (key === "ArrowDown") {
        event.preventDefault();
        focusRowByIndex(focusedIndex + 1);
        return;
      }
      if (key === "ArrowUp") {
        event.preventDefault();
        focusRowByIndex(focusedIndex - 1);
        return;
      }
      const current = items[focusedIndex];
      if (!current) return;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        handleConfirm(current);
        return;
      }
      if ((key === "f" || key === "F") && onToggleFavorite) {
        event.preventDefault();
        triggerFavorite(current);
      }
    };
    window.addEventListener("tv-focus-zone", onZoneChange as EventListener);
    window.addEventListener("tv-focus-content", onFocusContent as EventListener);
    window.addEventListener("tv-content-key", onContentKey as EventListener);
    return () => {
      window.removeEventListener("tv-focus-zone", onZoneChange as EventListener);
      window.removeEventListener("tv-focus-content", onFocusContent as EventListener);
      window.removeEventListener("tv-content-key", onContentKey as EventListener);
    };
  }, [focusedIndex, items, onPlay, onToggleFavorite]);

  return (
    <>
      {items.map((ch, index) => {
        const snapshot = snapshots[ch.id];
        const isActive =
          hoveredChannelId === ch.id || (isContentZoneActive && domFocusedIndex === index);
        return (
          <div key={ch.id} style={{ borderBottom: "1px solid var(--border)" }}>
            <div
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
              role="button"
              tabIndex={0}
              data-tv-focusable={focusedIndex === index ? "true" : undefined}
              style={{ ...rowStyle, ...(isActive ? rowActiveStyle : null) }}
              onClick={() => schedulePlay(ch)}
              onDoubleClick={() => {
                if (onToggleFavorite) {
                  triggerFavorite(ch);
                }
              }}
              onFocus={() => {
                setFocusedIndex(index);
                setDomFocusedIndex(index);
              }}
              onBlur={() => {
                setDomFocusedIndex((prev) => (prev === index ? null : prev));
              }}
              onMouseEnter={() => setHoveredChannelId(ch.id)}
              onMouseLeave={() => setHoveredChannelId((prev) => (prev === ch.id ? null : prev))}
            >
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
              {onToggleFavorite ? (
                <span
                  style={{
                    fontSize: 16,
                    color: ch.isFavorite ? "#f59e0b" : "var(--text-secondary)",
                    width: 20,
                    textAlign: "center",
                  }}
                >
                  {ch.isFavorite ? "★" : "☆"}
                </span>
              ) : null}
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
              <span style={{ fontSize: 13, color: "var(--accent)" }}>
                ▶
              </span>
            </div>

            <div style={guideInlineStyle}>
              {snapshot && ((snapshot.timelinePrograms?.length ?? 0) > 0 || snapshot.now || snapshot.next) ? (
                <GuideTimeline
                  snapshot={snapshot}
                  locale={locale}
                  currentTs={nowTs}
                  windowStart={timelineWindow.start}
                  windowEnd={timelineWindow.end}
                />
              ) : (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  {loading
                    ? t(locale, "guide.loading")
                    : t(locale, "guide.noData")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function GuideTimeline({
  snapshot,
  locale,
  currentTs,
  windowStart,
  windowEnd,
}: {
  snapshot: ChannelEpgSnapshot;
  locale: Locale;
  currentTs: number;
  windowStart: number;
  windowEnd: number;
}) {
  const range = windowEnd - windowStart;
  const currentRatio = range > 0 ? clamp((currentTs - windowStart) / range, 0, 1) : 0;
  const timelinePrograms =
    (snapshot.timelinePrograms?.length ?? 0) > 0
      ? snapshot.timelinePrograms
      : [snapshot.now, snapshot.next].filter((program): program is NonNullable<typeof program> => Boolean(program));
  const segments = timelinePrograms
    .map((program, index) => {
      const start = parseXmltvDate(program.startAt);
      const end = parseXmltvDate(program.endAt);
      const block = calcBlock(start, end, windowStart, windowEnd);
      if (!block) return null;
      const isCurrent = start !== null && end !== null && start <= currentTs && currentTs < end;
      return { key: `${program.startAt}-${program.endAt}-${index}`, program, block, isCurrent };
    })
    .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment));
  const currentProgram = timelinePrograms.find((program) => {
    const start = parseXmltvDate(program.startAt);
    const end = parseXmltvDate(program.endAt);
    return start !== null && end !== null && start <= currentTs && currentTs < end;
  });
  const splitPoints = timelinePrograms
    .map((program, index) => {
      if (range <= 0) return null;
      const start = parseXmltvDate(program.startAt);
      if (start === null) return null;
      const ratio = clamp((start - windowStart) / range, 0, 1);
      if (ratio <= 0 || ratio >= 1) return null;
      return {
        key: `${program.startAt}-${index}`,
        ratio,
        label: formatTime(program.startAt),
      };
    })
    .filter((point): point is NonNullable<typeof point> => Boolean(point))
    .sort((a, b) => a.ratio - b.ratio)
    .filter((point, index, list) => index === 0 || Math.abs(point.ratio - list[index - 1].ratio) > 0.003);
  const progressBlock = currentProgram
    ? calcBlock(parseXmltvDate(currentProgram.startAt), currentTs, windowStart, windowEnd)
    : null;

  return (
    <div style={timelineWrapStyle}>
      {splitPoints.map((point) => (
        <div key={`label-${point.key}`} style={{ ...timelineSplitLabelStyle, left: `${(point.ratio * 100).toFixed(2)}%` }}>
          {point.label}
        </div>
      ))}
      <div style={timelineStyle}>
        {segments.map((segment) => (
          <div
            key={segment.key}
            style={{
              ...timelineSegmentStyle,
              left: `${(segment.block.left * 100).toFixed(2)}%`,
              width: `${(segment.block.width * 100).toFixed(2)}%`,
              background: segment.isCurrent ? "linear-gradient(180deg, #1d4ed855 0%, #1d4ed822 100%)" : "#111827aa",
              borderLeft: "1px solid #1f2937",
            }}
            title={segment.program.title ?? ""}
          >
            <div style={timelineTextStyle}>
              {segment.program.title || t(locale, "guide.noProgram")}
            </div>
          </div>
        ))}
        {splitPoints.map((point) => (
          <div key={`line-${point.key}`} style={{ ...timelineSplitStyle, left: `${(point.ratio * 100).toFixed(2)}%` }} />
        ))}
        {progressBlock ? (
          <div
            style={{
              ...timelineProgressStyle,
              left: `${(progressBlock.left * 100).toFixed(2)}%`,
              width: `${(progressBlock.width * 100).toFixed(2)}%`,
            }}
          />
        ) : null}
        <div style={{ ...timelineCursorStyle, left: `${(currentRatio * 100).toFixed(2)}%` }} />
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function calcBlock(
  start: number | null,
  end: number | null,
  windowStart: number,
  windowEnd: number,
): { left: number; width: number } | null {
  if (start === null || end === null || end <= start) return null;
  const clippedStart = Math.max(start, windowStart);
  const clippedEnd = Math.min(end, windowEnd);
  if (clippedEnd <= clippedStart) return null;
  const range = windowEnd - windowStart;
  if (range <= 0) return null;
  return {
    left: clamp((clippedStart - windowStart) / range, 0, 1),
    width: clamp((clippedEnd - clippedStart) / range, 0, 1),
  };
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
  borderRadius: 4,
  cursor: "pointer",
  outline: "none",
};

const rowActiveStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-tertiary)",
  boxShadow: "inset 0 0 0 1px var(--accent)",
};

const guideInlineStyle: React.CSSProperties = {
  padding: "10px 8px 8px 46px",
};

const timelineWrapStyle: React.CSSProperties = {
  position: "relative",
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
  position: "absolute",
  top: 0,
  bottom: 0,
  padding: "0 8px 4px 8px",
  display: "flex",
  alignItems: "center",
  minWidth: 0,
  overflow: "hidden",
  zIndex: 1,
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
  top: 0,
  bottom: 0,
  backgroundColor: "#2563eb2f",
  pointerEvents: "none",
  zIndex: 0,
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
  top: -9,
  fontSize: 9,
  color: "#cbd5e1",
  whiteSpace: "nowrap",
  opacity: 0.8,
  transform: "translateX(4px)",
  pointerEvents: "none",
  zIndex: 3,
};

const timelineCursorStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 2,
  backgroundColor: "var(--accent)",
  pointerEvents: "none",
};
