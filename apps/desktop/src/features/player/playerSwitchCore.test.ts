import { describe, expect, it } from "vitest";

import type { Channel } from "../../types/api";
import {
  buildNeighborWarmPlan,
  getAdjacentChannel,
  getPrevSlot,
  getNextSlot,
  resolveCurrentPlaybackChannelId,
} from "./playerSwitchCore";

function buildChannel(id: number): Channel {
  return {
    id,
    sourceId: 1,
    name: `CH-${id}`,
    streamUrl: `https://example.com/${id}.m3u8`,
    isFavorite: false,
  };
}

describe("playerSwitchCore", () => {
  it("resolves current playback channel id from active slot first", () => {
    const resolved = resolveCurrentPlaybackChannelId([101, 102, 103], 1, 999);
    expect(resolved).toBe(102);
  });

  it("falls back to incoming channel id when slot is empty", () => {
    const resolved = resolveCurrentPlaybackChannelId([101, null, 103], 1, 999);
    expect(resolved).toBe(999);
  });

  it("returns prev and next slot numbers relative to active slot", () => {
    expect(getPrevSlot(1)).toBe(0);
    expect(getNextSlot(1)).toBe(2);
    expect(getPrevSlot(0)).toBe(2);
    expect(getNextSlot(0)).toBe(1);
    expect(getPrevSlot(2)).toBe(1);
    expect(getNextSlot(2)).toBe(0);
  });

  it("finds adjacent channel with wrap-around", () => {
    const channels = [buildChannel(1), buildChannel(2), buildChannel(3)];
    expect(getAdjacentChannel(channels, 1, -1)?.id).toBe(3);
    expect(getAdjacentChannel(channels, 3, 1)?.id).toBe(1);
  });

  it("returns null when base channel does not exist", () => {
    const channels = [buildChannel(1), buildChannel(2)];
    expect(getAdjacentChannel(channels, 404, 1)).toBeNull();
  });

  it("builds deduplicated neighbor warm plan", () => {
    const channels = [buildChannel(1), buildChannel(2)];
    const plan = buildNeighborWarmPlan(channels, 1, 1);
    expect(plan.predicted?.id).toBe(2);
    expect(plan.warmTargets.map((item) => item.id)).toEqual([2]);
  });
});
