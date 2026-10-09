import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "../attrs.schema";
import { PaneSchema } from "./pane.schema";
import { StreamFilter } from "./stream-filter";
import type { StreamSettings } from "./stream-settings";

const Comparison = Schema.TaggedStruct("cmp", { val: AttrsSchema.FilterCmp });

const And = Schema.TaggedStruct("and", { val: Schema.Array(AttrsSchema.FilterExpr) });

const Or = Schema.TaggedStruct("or", { val: Schema.Array(AttrsSchema.FilterExpr) });

describe("StreamFilter conversion", () => {
  it.each(["notes", "pages"] as const)("round-trips a %s pane filter", (type) => {
    const filter: StreamSettings.Filter = {
      type,
      search: "sleep log",
      date: "2026-10-09",
      backlinksTo: "sleep-log",
      linksFrom: "daily-log",
    };

    const attrs = StreamFilter.toAttrs(filter);

    expect(Schema.decodeUnknownSync(AttrsSchema.TargetFilter)(attrs)).toEqual(attrs);
    expect(attrs.map(({ val }) => val)).toEqual([
      ["_tag", "=", "note"],
      ["title", "exists", type === "pages"],
      ["body", "contains", "sleep log"],
      ["date", "=", "2026-10-09"],
      [["link", "->", "sleep-log"], "exists", true],
      [["link", "<-", "daily-log"], "exists", true],
    ]);
    expect(StreamFilter.fromAttrs(attrs)).toEqual(filter);
  });

  it.each(["notes", "pages"] as const)("round-trips a minimal %s filter", (type) => {
    const filter = { type };
    expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(filter))).toEqual(filter);
  });

  it("preserves an empty search without adding unset fields", () => {
    const filter: StreamSettings.Filter = { type: "notes", search: "" };
    expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(filter))).toEqual(filter);
  });

  it("flattens AND groups, skips unsupported comparisons and uses the last supported value", () => {
    const propId = AttrsSchema.NoteId.make("priority");

    const expressions = [
      Comparison.make({ val: ["_tag", "=", "prop"] }),
      Comparison.make({ val: ["body", "contains", "old"] }),
      And.make({
        val: [
          And.make({ val: StreamFilter.toAttrs({ type: "pages", search: "new" }) }),
          Comparison.make({
            val: [["prop", propId], "=", AttrsSchema.PropVal.cases.number.make({ val: 2 })],
          }),
          Comparison.make({ val: [["prop", propId], "exists", true] }),
          Comparison.make({ val: [["prop", propId], "invalid", true] }),
          Or.make({ val: StreamFilter.toAttrs({ type: "notes", search: "ignored" }) }),
        ],
      }),
    ];

    const filter = StreamFilter.fromAttrs(expressions);

    expect(filter).toEqual({ type: "pages", search: "new" });
    expect(Schema.decodeUnknownSync(PaneSchema.StreamSettings.fields.filter)(filter)).toEqual(
      filter,
    );
  });

  it("falls back to notes when no supported comparisons remain", () => {
    expect(StreamFilter.fromAttrs([])).toEqual({ type: "notes" });
    expect(StreamFilter.fromAttrs([Or.make({ val: [] })])).toEqual({ type: "notes" });
  });
});
