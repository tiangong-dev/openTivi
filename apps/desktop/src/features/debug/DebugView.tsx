import { useCallback, useEffect, useMemo, useState } from "react";

import { t, type Locale } from "../../lib/i18n";
import { tauriInvoke } from "../../lib/tauri";

interface Props {
  locale: Locale;
}

type RuntimeLogRecord = {
  ts?: string;
  component?: string;
  event?: string;
  data?: Record<string, unknown>;
};

type SwitchRequest = {
  ts: number;
  nextChannelId: number | null;
};

type SlotReady = {
  ts: number;
  channelId: number | null;
  isActiveSlot: boolean;
};

type PrimaryProbe = {
  hit: boolean | null;
  sinceMs: number | null;
};

type DebugMetrics = {
  totalSwitches: number;
  warmHitTrue: number;
  warmHitFalse: number;
  warmHitRatio: number;
  avgProbeSinceMs: number | null;
  avgActivationLatencyMs: number | null;
  p95ActivationLatencyMs: number | null;
  avgReadyLatencyMs: number | null;
  p95ReadyLatencyMs: number | null;
};

const POLL_INTERVAL_MS = 1500;
const MAX_LOG_LINES = 2000;
const MATCH_WINDOW_MS = 10_000;

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseRuntimeLog(line: string): RuntimeLogRecord | null {
  try {
    return JSON.parse(line) as RuntimeLogRecord;
  } catch {
    return null;
  }
}

function parseTsMillis(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function computeMetrics(records: RuntimeLogRecord[]): DebugMetrics {
  const switchRequested: SwitchRequest[] = [];
  const switchActivated: SwitchRequest[] = [];
  const slotReady: SlotReady[] = [];
  const probes: PrimaryProbe[] = [];

  for (const record of records) {
    const ts = parseTsMillis(record.ts);
    if (ts === null) continue;
    const data = record.data ?? {};
    if (record.component === "player" && record.event === "switch_requested") {
      switchRequested.push({
        ts,
        nextChannelId: toNumber(data.nextChannelId),
      });
      continue;
    }
    if (record.component === "player" && record.event === "switch_activated") {
      switchActivated.push({
        ts,
        nextChannelId: toNumber(data.nextChannelId),
      });
      continue;
    }
    if (record.component === "player" && record.event === "slot_ready") {
      slotReady.push({
        ts,
        channelId: toNumber(data.channelId),
        isActiveSlot: toBoolean(data.isActiveSlot) ?? false,
      });
      continue;
    }
    if (record.component === "prewarm_orchestrator" && record.event === "primary_report") {
      probes.push({
        hit: toBoolean(data.switch_probe_hit),
        sinceMs: toNumber(data.switch_probe_since_last_warm_ms),
      });
    }
  }

  const activationLatencies: number[] = [];
  const readyLatencies: number[] = [];
  let activatedCursor = 0;
  let readyCursor = 0;
  for (const requested of switchRequested) {
    while (
      activatedCursor < switchActivated.length &&
      switchActivated[activatedCursor].ts < requested.ts
    ) {
      activatedCursor += 1;
    }
    for (let i = activatedCursor; i < switchActivated.length; i += 1) {
      const candidate = switchActivated[i];
      if (candidate.ts - requested.ts > MATCH_WINDOW_MS) break;
      if (candidate.nextChannelId !== requested.nextChannelId) continue;
      activationLatencies.push(candidate.ts - requested.ts);
      activatedCursor = i + 1;
      break;
    }

    while (readyCursor < slotReady.length && slotReady[readyCursor].ts < requested.ts) {
      readyCursor += 1;
    }
    for (let i = readyCursor; i < slotReady.length; i += 1) {
      const candidate = slotReady[i];
      if (candidate.ts - requested.ts > MATCH_WINDOW_MS) break;
      if (!candidate.isActiveSlot) continue;
      if (candidate.channelId !== requested.nextChannelId) continue;
      readyLatencies.push(candidate.ts - requested.ts);
      readyCursor = i + 1;
      break;
    }
  }

  const warmHitTrue = probes.filter((item) => item.hit === true).length;
  const warmHitFalse = probes.filter((item) => item.hit === false).length;
  const warmHitTotal = warmHitTrue + warmHitFalse;
  const probeSinceValues = probes
    .map((item) => item.sinceMs)
    .filter((value): value is number => value !== null);

  return {
    totalSwitches: switchRequested.length,
    warmHitTrue,
    warmHitFalse,
    warmHitRatio: warmHitTotal > 0 ? warmHitTrue / warmHitTotal : 0,
    avgProbeSinceMs: average(probeSinceValues),
    avgActivationLatencyMs: average(activationLatencies),
    p95ActivationLatencyMs: percentile(activationLatencies, 95),
    avgReadyLatencyMs: average(readyLatencies),
    p95ReadyLatencyMs: percentile(readyLatencies, 95),
  };
}

function formatMs(value: number | null): string {
  return value === null ? "-" : `${Math.round(value)} ms`;
}

export function DebugView({ locale }: Props) {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const lines = await tauriInvoke<string[]>("get_runtime_logs", { limit: MAX_LOG_LINES });
      setLogs(lines);
      setError(null);
    } catch {
      setError(t(locale, "debug.panel.loadError"));
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    void loadLogs();
    const timer = setInterval(() => {
      void loadLogs();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadLogs]);

  const parsedRecords = useMemo(
    () => logs.map(parseRuntimeLog).filter((value): value is RuntimeLogRecord => value !== null),
    [logs],
  );
  const metrics = useMemo(() => computeMetrics(parsedRecords), [parsedRecords]);

  const clearLogs = async () => {
    try {
      await tauriInvoke("clear_runtime_logs");
      await loadLogs();
    } catch {
      setError(t(locale, "debug.panel.clearError"));
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>{t(locale, "debug.panel.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" style={btnStyle} onClick={() => void loadLogs()}>
            {t(locale, "debug.panel.refresh")}
          </button>
          <button type="button" style={btnStyle} onClick={() => void clearLogs()}>
            {t(locale, "debug.panel.clear")}
          </button>
        </div>
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      <div style={hintStyle}>
        {loading ? t(locale, "debug.panel.loading") : t(locale, "debug.panel.tip")}
      </div>

      <div style={gridStyle}>
        <MetricCard title={t(locale, "debug.metric.totalSwitches")} value={String(metrics.totalSwitches)} />
        <MetricCard
          title={t(locale, "debug.metric.hitRate")}
          value={`${(metrics.warmHitRatio * 100).toFixed(1)}%`}
          sub={`${metrics.warmHitTrue}/${metrics.warmHitTrue + metrics.warmHitFalse}`}
        />
        <MetricCard
          title={t(locale, "debug.metric.avgProbeSince")}
          value={formatMs(metrics.avgProbeSinceMs)}
        />
        <MetricCard
          title={t(locale, "debug.metric.avgActivationLatency")}
          value={formatMs(metrics.avgActivationLatencyMs)}
          sub={`P95 ${formatMs(metrics.p95ActivationLatencyMs)}`}
        />
        <MetricCard
          title={t(locale, "debug.metric.avgReadyLatency")}
          value={formatMs(metrics.avgReadyLatencyMs)}
          sub={`P95 ${formatMs(metrics.p95ReadyLatencyMs)}`}
        />
      </div>

      <div style={logContainerStyle}>
        <div style={logHeaderStyle}>
          {t(locale, "debug.panel.rawLog")} ({parsedRecords.length})
        </div>
        <pre style={logStyle}>{logs.slice(-120).join("\n")}</pre>
      </div>
    </div>
  );
}

function MetricCard({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricTitleStyle}>{title}</div>
      <div style={metricValueStyle}>{value}</div>
      {sub ? <div style={metricSubStyle}>{sub}</div> : null}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  height: "100%",
  overflow: "auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

const errorStyle: React.CSSProperties = {
  color: "var(--danger)",
  fontSize: 13,
};

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  backgroundColor: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const metricCardStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: 12,
  backgroundColor: "var(--bg-secondary)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const metricTitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

const metricValueStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  color: "var(--accent)",
};

const metricSubStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-secondary)",
};

const logContainerStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  overflow: "hidden",
  backgroundColor: "var(--bg-secondary)",
};

const logHeaderStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid var(--border)",
  fontSize: 12,
  color: "var(--text-secondary)",
};

const logStyle: React.CSSProperties = {
  margin: 0,
  padding: 10,
  fontSize: 11,
  lineHeight: 1.4,
  maxHeight: 360,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
