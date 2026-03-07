import { useEffect, useState } from "react";
import { tauriInvoke } from "../../lib/tauri";
import { getErrorMessage } from "../../lib/errors";
import type { RecentChannel } from "../../types/api";

interface Props {
  onPlay: (channel: RecentChannel) => void;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "yesterday";
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function RecentsView({ onPlay }: Props) {
  const [channels, setChannels] = useState<RecentChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadRecents = async () => {
    try {
      const list = await tauriInvoke<RecentChannel[]>("list_recents", { limit: 100 });
      setChannels(list);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  useEffect(() => {
    loadRecents();
  }, []);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
        Recently Watched · {channels.length} channels
      </div>

      {error && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

      {channels.length === 0 && !error && (
        <div style={{ color: "var(--text-secondary)", marginTop: 24, textAlign: "center" }}>
          No recently watched channels.
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {channels.map((ch) => (
          <div
            key={ch.id}
            style={rowStyle}
            onClick={() => onPlay(ch)}
          >
            {ch.logoUrl ? (
              <img
                src={ch.logoUrl}
                alt=""
                style={{ width: 32, height: 32, borderRadius: 4, objectFit: "contain", flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div style={{ width: 32, height: 32, flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ch.name}
              </div>
              {ch.groupName && (
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{ch.groupName}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
              {formatRelativeTime(ch.lastWatchedAt)}
            </div>
            <span style={badgeStyle}>{ch.playCount}×</span>
            <button
              onClick={(e) => { e.stopPropagation(); onPlay(ch); }}
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
  cursor: "pointer",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-secondary)",
  backgroundColor: "var(--bg-tertiary)",
  padding: "2px 6px",
  borderRadius: 8,
  whiteSpace: "nowrap",
};
