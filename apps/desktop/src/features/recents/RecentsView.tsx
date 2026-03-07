import { useEffect, useState } from "react";

import { getErrorMessage } from "../../lib/errors";
import { tr, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";
import type { Channel, RecentChannel } from "../../types/api";

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

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <h2 style={{ margin: 0 }}>{tr(locale, "Recents", "最近观看")}</h2>
      {error && <div style={{ color: "var(--danger)" }}>{error}</div>}
      {!error && items.length === 0 && (
        <div style={{ color: "var(--text-secondary)" }}>
          {tr(locale, "No recently watched channels yet.", "还没有最近观看记录。")}
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {items.map((ch) => (
          <div key={ch.id} style={rowStyle} onDoubleClick={() => onPlay?.(ch)}>
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
                {ch.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                {tr(locale, "Played", "播放次数")} {ch.playCount} · {tr(locale, "Last watched", "上次观看")}{" "}
                {formatRelativeTime(ch.lastWatchedAt, locale)}
              </div>
            </div>
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
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 8px",
  borderBottom: "1px solid var(--border)",
};

function formatRelativeTime(iso: string, locale: Locale): string {
  const now = Date.now();
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;

  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return tr(locale, "just now", "刚刚");
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return tr(locale, `${mins} min ago`, `${mins} 分钟前`);
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return tr(locale, `${hours}h ago`, `${hours} 小时前`);
  }
  if (diffSec < 172800) return tr(locale, "yesterday", "昨天");
  const days = Math.floor(diffSec / 86400);
  return tr(locale, `${days}d ago`, `${days} 天前`);
}
