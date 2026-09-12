import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PaneCursor } from "./pane.cursor";
import { PaneMake } from "./pane.make";
import { PaneSchema } from "./pane.schema";

const decodePane = Schema.decodeUnknownSync(PaneSchema.Pane);

describe("PaneCursor.inputMatches", () => {
  it("matches note inputs by note ID and ignores pane ID", () => {
    const pane = PaneSchema.Pane.cases.note.make({ paneId: "pane-a", id: "note-a" });

    expect(PaneCursor.inputMatches(PaneMake.note("note-a"))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneMake.note("note-b"))(pane)).toBe(false);
  });

  it("matches stream inputs with omitted defaults or explicit undefined fields", () => {
    const pane = PaneSchema.Pane.cases.stream.make({
      paneId: "pane-a",
      filter: { type: "notes" },
      sort: "date",
    });

    const explicitUndefined = {
      ...PaneMake.notes(),
      filter: {
        type: "notes",
        backlinksTo: undefined,
        linksFrom: undefined,
        date: undefined,
      },
    } satisfies PaneSchema.PaneInput;

    const omittedDefaults = {
      ...PaneMake.notes(),
      filter: { type: undefined },
      sort: undefined,
    } satisfies PaneSchema.PaneInput;

    expect(PaneCursor.inputMatches(explicitUndefined)(pane)).toBe(true);
    expect(PaneCursor.inputMatches(omittedDefaults)(pane)).toBe(true);
  });

  it("distinguishes stream filters and sort order", () => {
    const pane = PaneSchema.Pane.cases.stream.make({
      paneId: "pane-a",
      filter: { type: "notes", backlinksTo: "note-a" },
      sort: "date",
    });

    const differentSort = PaneSchema.Pane.cases.stream.make({
      paneId: "pane-b",
      filter: { type: "notes", backlinksTo: "note-a" },
      sort: "updated",
    });

    expect(PaneCursor.inputMatches(PaneMake.backlink("note-a"))(pane)).toBe(true);
    expect(PaneCursor.inputMatches(PaneMake.backlink("note-b"))(pane)).toBe(false);
    expect(PaneCursor.inputMatches(PaneMake.backlink("note-a"))(differentSort)).toBe(false);
  });
});

describe("PaneMake", () => {
  const inputs: ReadonlyArray<{ readonly name: string; readonly input: PaneSchema.PaneInput }> = [
    { name: "notes", input: PaneMake.notes() },
    { name: "note", input: PaneMake.note("note-a") },
    { name: "backlink", input: PaneMake.backlink("note-a") },
    { name: "outgoing", input: PaneMake.outgoing("note-a") },
    { name: "date", input: PaneMake.date("2026-09-12") },
  ];

  it.each(inputs)("$name leaves pane ID generation to schema decoding", ({ input }) => {
    expect(input).not.toHaveProperty("paneId");

    const pane = decodePane(input);

    expect(pane.paneId.length).toBeGreaterThan(0);
  });
});
