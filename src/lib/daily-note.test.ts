import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { formatDailyNoteTitle, suggestDailyNoteIds } from "./daily-note";

describe("suggestDailyNoteIds", () => {
  const referenceDate = new Temporal.PlainDate(2026, 3, 22);

  it("returns exact iso dates", () => {
    expect(suggestDailyNoteIds("2026-03-18", referenceDate)).toEqual([
      {
        id: "2026-03-18",
        title: formatDailyNoteTitle("2026-03-18"),
      },
    ]);
  });

  it("parses relative phrases with chrono", () => {
    expect(suggestDailyNoteIds("three days ago", referenceDate)).toEqual([
      {
        id: "2026-03-19",
        title: formatDailyNoteTitle("2026-03-19"),
      },
    ]);
  });
});
