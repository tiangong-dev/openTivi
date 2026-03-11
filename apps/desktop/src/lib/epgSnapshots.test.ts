import { describe, expect, it } from "vitest";

import type { Channel } from "../types/api";
import { buildSnapshotRequestChannelIds } from "./epgSnapshots";

function makeChannels(count: number): Channel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    sourceId: 1,
    name: `Channel ${index + 1}`,
    streamUrl: `http://example.com/${index + 1}.m3u8`,
    isFavorite: false,
  }));
}

describe("buildSnapshotRequestChannelIds", () => {
  it("returns all ids when the list is smaller than the window", () => {
    expect(buildSnapshotRequestChannelIds(makeChannels(3), 1, 10)).toEqual([1, 2, 3]);
  });

  it("centers the request window around the focused index", () => {
    expect(buildSnapshotRequestChannelIds(makeChannels(10), 5, 4)).toEqual([4, 5, 6, 7]);
  });

  it("clamps to the beginning of the list", () => {
    expect(buildSnapshotRequestChannelIds(makeChannels(10), 0, 4)).toEqual([1, 2, 3, 4]);
  });

  it("clamps to the end of the list", () => {
    expect(buildSnapshotRequestChannelIds(makeChannels(10), 9, 4)).toEqual([7, 8, 9, 10]);
  });
});
