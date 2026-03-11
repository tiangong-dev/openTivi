import type { EpgProgram } from "../../types/api";

export type PlaybackKind = "hls" | "mpegts" | "native";

export function parseXmltvDate(raw: string): number | null {
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

export function formatTime(value: string): string {
  const ts = parseXmltvDate(value);
  if (ts === null) return value;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatNetworkSpeed(bitsPerSecond: number): string {
  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
  }
  return `${(bitsPerSecond / 1_000).toFixed(1)} Kbps`;
}

export function getGuidePrograms(programs: EpgProgram[]): EpgProgram[] {
  const now = Date.now();
  const upcoming = programs.filter((p) => {
    const end = parseXmltvDate(p.endAt);
    return end !== null && end >= now - 15 * 60 * 1000;
  });
  return (upcoming.length > 0 ? upcoming : programs).slice(0, 12);
}

export function toProxyUrl(originalUrl: string, port: number): string {
  return `http://127.0.0.1:${port}/stream?url=${encodeURIComponent(originalUrl)}`;
}

function isHls(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("format=m3u8");
}

function isMpegTs(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.endsWith(".ts") || lower.includes("container=ts");
}

export function getPlaybackKind(url: string): PlaybackKind {
  if (isHls(url)) return "hls";
  if (isMpegTs(url)) return "mpegts";
  return "native";
}
