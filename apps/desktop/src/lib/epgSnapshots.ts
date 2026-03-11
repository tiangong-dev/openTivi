import type { Channel } from "../types/api";

export function buildSnapshotRequestChannelIds(
  channels: Channel[],
  focusedIndex: number,
  windowSize: number,
): number[] {
  if (channels.length === 0 || windowSize <= 0) {
    return [];
  }

  if (channels.length <= windowSize) {
    return channels.map((channel) => channel.id);
  }

  const normalizedIndex = Math.max(0, Math.min(focusedIndex, channels.length - 1));
  const halfWindow = Math.floor(windowSize / 2);
  let start = Math.max(0, normalizedIndex - halfWindow);
  let end = Math.min(channels.length, start + windowSize);

  if (end - start < windowSize) {
    start = Math.max(0, end - windowSize);
  }

  return channels.slice(start, end).map((channel) => channel.id);
}
