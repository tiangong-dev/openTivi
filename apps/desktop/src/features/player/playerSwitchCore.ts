import type { Channel } from "../../types/api";

export type SwitchDirection = -1 | 1;
export type PlayerSlot = 0 | 1 | 2; // 0=prev(n-1), 1=active(n), 2=next(n+1)

export function resolveCurrentPlaybackChannelId(
  slotChannelIds: [number | null, number | null, number | null],
  activeSlot: PlayerSlot,
  fallbackChannelId: number,
): number {
  return slotChannelIds[activeSlot] ?? fallbackChannelId;
}

export function getPrevSlot(): 0 {
  return 0;
}

export function getNextSlot(): 2 {
  return 2;
}

export function getAdjacentChannel(
  channels: Channel[],
  baseChannelId: number,
  direction: SwitchDirection,
): Channel | null {
  if (channels.length === 0) return null;
  const idx = channels.findIndex((c) => c.id === baseChannelId);
  if (idx === -1) return null;
  const nextIdx = (idx + direction + channels.length) % channels.length;
  return channels[nextIdx] ?? null;
}

export function shouldLoadInStandby(
  standbyChannelId: number | null,
  targetChannelId: number,
): boolean {
  return standbyChannelId !== targetChannelId;
}

export function buildNeighborWarmPlan(
  channels: Channel[],
  baseChannelId: number,
  preferredDirection: SwitchDirection,
): { predicted: Channel | null; warmTargets: Channel[] } {
  const predicted = getAdjacentChannel(channels, baseChannelId, preferredDirection);
  const opposite = getAdjacentChannel(channels, baseChannelId, preferredDirection === 1 ? -1 : 1);

  const warmTargets: Channel[] = [];
  if (predicted) warmTargets.push(predicted);
  if (opposite && (!predicted || opposite.id !== predicted.id)) {
    warmTargets.push(opposite);
  }

  return { predicted, warmTargets };
}
