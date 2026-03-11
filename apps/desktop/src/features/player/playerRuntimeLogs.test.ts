import { describe, expect, it } from "vitest";

import { formatRuntimeLogEntry } from "./playerRuntimeLogs";

describe("playerRuntimeLogs.formatRuntimeLogEntry", () => {
  it("formats initial playback kind entries", () => {
    const entry = JSON.stringify({
      event: "playback_kind_initial",
      data: {
        slot: 2,
        channelId: 101,
        prewarm: true,
        kind: "native",
        source: "url-infer",
      },
    });

    expect(formatRuntimeLogEntry(entry)).toBe(
      "slot 2 ch 101 prewarm: initial native (url-infer)",
    );
  });

  it("formats probed playback kind changes", () => {
    const entry = JSON.stringify({
      event: "playback_kind_probe",
      data: {
        slot: 1,
        channelId: 8,
        prewarm: false,
        initialKind: "native",
        resolvedKind: "hls",
        changed: true,
      },
    });

    expect(formatRuntimeLogEntry(entry)).toBe(
      "slot 1 ch 8 active: probed hls, was native",
    );
  });

  it("formats correction skipped entries", () => {
    const entry = JSON.stringify({
      event: "playback_kind_correction_skipped",
      data: {
        slot: 1,
        channelId: 8,
        prewarm: false,
        fromKind: "native",
        toKind: "hls",
        reason: "slot_already_active_and_ready",
      },
    });

    expect(formatRuntimeLogEntry(entry)).toBe(
      "slot 1 ch 8 active: correction skipped native -> hls (slot_already_active_and_ready)",
    );
  });

  it("falls back to raw text for unknown events or invalid json", () => {
    const unknown = JSON.stringify({ event: "other_event", data: { slot: 0 } });

    expect(formatRuntimeLogEntry(unknown)).toBe(unknown);
    expect(formatRuntimeLogEntry("not-json")).toBe("not-json");
  });
});
