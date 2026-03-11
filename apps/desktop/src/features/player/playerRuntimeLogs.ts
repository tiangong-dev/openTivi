interface RuntimeLogEntryData {
  slot?: number;
  channelId?: number;
  prewarm?: boolean;
  streamUrl?: string;
  kind?: string;
  source?: string;
  initialKind?: string;
  resolvedKind?: string;
  changed?: boolean;
  fromKind?: string | null;
  toKind?: string;
  reason?: string;
}

interface RuntimeLogEntry {
  ts?: string;
  component?: string;
  event?: string;
  data?: RuntimeLogEntryData;
}

export function formatRuntimeLogEntry(raw: string): string {
  let parsed: RuntimeLogEntry;
  try {
    parsed = JSON.parse(raw) as RuntimeLogEntry;
  } catch {
    return raw;
  }

  const event = parsed.event;
  const data = parsed.data ?? {};
  const slot = typeof data.slot === "number" ? `slot ${data.slot}` : "slot ?";
  const channel = typeof data.channelId === "number" ? `ch ${data.channelId}` : "ch ?";
  const mode = data.prewarm ? "prewarm" : "active";

  if (event === "playback_kind_initial") {
    return `${slot} ${channel} ${mode}: initial ${data.kind ?? "unknown"} (${data.source ?? "unknown"})`;
  }
  if (event === "playback_kind_probe") {
    return `${slot} ${channel} ${mode}: probed ${data.resolvedKind ?? "unknown"}${data.changed ? `, was ${data.initialKind ?? "unknown"}` : ""}`;
  }
  if (event === "playback_kind_corrected") {
    return `${slot} ${channel} ${mode}: corrected ${data.fromKind ?? "unknown"} -> ${data.toKind ?? "unknown"}`;
  }
  if (event === "playback_kind_correction_skipped") {
    return `${slot} ${channel} ${mode}: correction skipped ${data.fromKind ?? "unknown"} -> ${data.toKind ?? "unknown"} (${data.reason ?? "unknown"})`;
  }
  if (event === "slot_ready") {
    return `${slot} ${channel} ${mode}: ready`;
  }

  return raw;
}
