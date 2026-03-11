import { describe, expect, it } from "vitest";

import { parseXmltvDate } from "./playerUtils";

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
