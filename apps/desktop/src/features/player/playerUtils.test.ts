import { describe, expect, it } from "vitest";

import { inferPlaybackKindFromUrl, parseXmltvDate } from "./playerUtils";

describe("playerUtils.parseXmltvDate", () => {
  it("parses xmltv timestamps without timezone as local time", () => {
    const actual = parseXmltvDate("20260312083000");
    const expected = new Date(2026, 2, 12, 8, 30, 0).getTime();
    expect(actual).toBe(expected);
  });

  it("parses xmltv timestamps with timezone offset", () => {
    const actual = parseXmltvDate("20260312083000 +0800");
    const expected = Date.parse("2026-03-12T08:30:00+08:00");
    expect(actual).toBe(expected);
  });
});

describe("playerUtils.inferPlaybackKindFromUrl", () => {
  it("recognizes hls urls beyond plain .m3u8 suffixes", () => {
    expect(inferPlaybackKindFromUrl("https://example.com/live?type=hls&id=1")).toBe("hls");
    expect(inferPlaybackKindFromUrl("https://example.com/play?output=m3u8")).toBe("hls");
  });

  it("recognizes mpegts query hints", () => {
    expect(inferPlaybackKindFromUrl("https://example.com/live?type=mpegts")).toBe("mpegts");
  });
});
