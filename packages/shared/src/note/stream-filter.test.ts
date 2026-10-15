import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { PaneSchema } from "./pane.schema";
import { StreamFilter } from "./stream-filter";
import { StreamSettings } from "./stream-settings";

const Comparison = Schema.TaggedStruct("cmp", { val: AttrsSchema.FilterCmp });

const And = Schema.TaggedStruct("and", { val: Schema.Array(AttrsSchema.FilterExpr) });

const Or = Schema.TaggedStruct("or", { val: Schema.Array(AttrsSchema.FilterExpr) });

describe("StreamFilter conversion", () => {
  it("requires an enum parent and round-trips ownership through nested filters", () => {
    const type = PaneSchema.StreamFilterType.cases.enum_option.make({
      enum_parent: AttrsSchema.NoteId.make("priority"),
    });

    const filter = { ...StreamSettings.defaults(type).filter, search: "high" };
    const attrs = StreamFilter.toAttrs(filter);

    expect(attrs.slice(0, 3).map(({ val }) => val)).toEqual([
      ["_tag", "=", "owned"],
      ["owned_type", "=", "enum_option"],
      ["owned_parent", "=", "priority"],
    ]);
    expect(StreamFilter.fromAttrs([And.make({ val: attrs })])).toEqual(filter);
    expect(
      Schema.decodeSync(PaneSchema.StreamSettings.fields.filter)(
        Schema.encodeSync(PaneSchema.StreamSettings.fields.filter)(filter),
      ),
    ).toEqual(filter);
    const encoded = Schema.encodeSync(PaneSchema.StreamFilterType)(type);
    expect(() => {
      return Schema.decodeUnknownSync(PaneSchema.StreamFilterType)({
        ...encoded,
        enum_parent: undefined,
      });
    }).toThrow();
    expect(() => {
      return Schema.decodeUnknownSync(PaneSchema.StreamFilterType)({
        ...encoded,
        enum_parent: "",
      });
    }).toThrow();
  });

  it("does not mark a decoded default type as modified", () => {
    const settings = StreamSettings.defaults(PaneSchema.StreamFilterType.cases.notes.make({}));

    const decoded = Schema.decodeSync(PaneSchema.StreamSettings)(
      Schema.encodeSync(PaneSchema.StreamSettings)(settings),
    );

    expect(StreamSettings.changedFilters(decoded.filter)).toEqual([]);
    expect(Schema.decodeUnknownSync(PaneSchema.StreamSettings.fields.filter)({}).type).toEqual(
      settings.filter.type,
    );
  });

  it("preserves sorting for an equal type and resets it when the tag changes", () => {
    const current: StreamSettings.Settings = {
      ...StreamSettings.defaults(PaneSchema.StreamFilterType.cases.pages.make({})),
      sort: "date",
    };

    const decoded = Schema.decodeSync(PaneSchema.StreamSettings)(
      Schema.encodeSync(PaneSchema.StreamSettings)(current),
    );

    expect(StreamSettings.changeFilter(current, decoded.filter)).toMatchObject({
      typeChanged: false,
      settings: { sort: "date" },
    });
    expect(
      StreamSettings.changeFilter(current, {
        ...decoded.filter,
        type: PaneSchema.StreamFilterType.cases.prop.make({}),
      }),
    ).toMatchObject({ typeChanged: true, settings: { sort: "updated" } });
  });

  it.each(["notes", "pages", "prop", "rule"] as const)("round-trips a %s pane filter", (type) => {
    const filter: StreamSettings.Filter = {
      type: PaneSchema.StreamFilterType.cases[type].make({}),
      search: "sleep log",
      date: "2026-10-09",
      backlinksTo: "sleep-log",
      linksFrom: "daily-log",
      props: {},
    };

    const attrs = StreamFilter.toAttrs(filter);

    expect(Schema.decodeUnknownSync(AttrsSchema.TargetFilter)(attrs)).toEqual(attrs);
    expect(attrs.map(({ val }) => val)).toEqual([
      ["_tag", "=", type === "prop" || type === "rule" ? type : "note"],
      ...(type === "prop" || type === "rule" ? [] : [["title", "exists", type === "pages"]]),
      ["body", "contains", "sleep log"],
      ["date", "=", "2026-10-09"],
      [["link", "->", "sleep-log"], "exists", true],
      [["link", "<-", "daily-log"], "exists", true],
    ]);
    expect(StreamFilter.fromAttrs(attrs)).toEqual(filter);
  });

  it.each(["notes", "pages", "prop", "rule"] as const)(
    "round-trips a minimal %s filter",
    (type) => {
      const filter = StreamSettings.defaults(
        PaneSchema.StreamFilterType.cases[type].make({}),
      ).filter;

      expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(filter))).toEqual(filter);
    },
  );

  it("preserves an empty search without adding unset fields", () => {
    const filter: StreamSettings.Filter = {
      type: PaneSchema.StreamFilterType.cases.notes.make({}),
      search: "",
      props: {},
    };

    expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(filter))).toEqual(filter);
  });

  it("flattens AND groups, skips unsupported comparisons and uses the last supported value", () => {
    const propId = AttrsSchema.NoteId.make("priority");

    const expressions = [
      Comparison.make({ val: ["_tag", "=", "prop"] }),
      Comparison.make({ val: ["body", "contains", "old"] }),
      And.make({
        val: [
          And.make({
            val: StreamFilter.toAttrs({
              type: PaneSchema.StreamFilterType.cases.pages.make({}),
              search: "new",
            }),
          }),
          Comparison.make({
            val: [["prop", propId], "=", AttrsSchema.PropVal.cases.number.make({ val: 2 })],
          }),
          Comparison.make({ val: [["prop", propId], "exists", true] }),
          Comparison.make({ val: [["prop", propId], "invalid", true] }),
          Or.make({
            val: StreamFilter.toAttrs({
              type: PaneSchema.StreamFilterType.cases.notes.make({}),
              search: "ignored",
            }),
          }),
        ],
      }),
    ];

    const filter = StreamFilter.fromAttrs(expressions);

    expect(filter).toEqual({
      type: PaneSchema.StreamFilterType.cases.pages.make({}),
      search: "new",
      props: {
        ...StreamSettings.propFilters({}),
        [propId]: AttrsSchema.PropVal.cases.number.make({ val: 2 }),
      },
    });
    expect(Schema.decodeUnknownSync(PaneSchema.StreamSettings.fields.filter)(filter)).toEqual(
      filter,
    );
  });

  it("falls back to notes when no supported comparisons remain", () => {
    expect(StreamFilter.fromAttrs([])).toEqual({
      type: PaneSchema.StreamFilterType.cases.notes.make({}),
      props: {},
    });
    expect(StreamFilter.fromAttrs([Or.make({ val: [] })])).toEqual({
      type: PaneSchema.StreamFilterType.cases.notes.make({}),
      props: {},
    });
  });

  it("round-trips every property value kind through attrs and URL encoding", () => {
    const filter: StreamSettings.Filter = {
      type: PaneSchema.StreamFilterType.cases.pages.make({}),
      props: {
        [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
        [AttrsSchema.NoteId.make("important")]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
        [AttrsSchema.NoteId.make("title")]: AttrsSchema.PropVal.cases.text.make({ val: "test" }),
        [AttrsSchema.NoteId.make("hours")]: AttrsSchema.PropVal.cases.number.make({ val: 7 }),
        [AttrsSchema.NoteId.make("priority")]: AttrsSchema.PropVal.cases.enum.make({
          val: AttrsSchema.NoteId.make("high"),
        }),
        [AttrsSchema.NoteId.make("assignee")]: AttrsSchema.PropVal.cases.link.make({
          val: AttrsSchema.NoteId.make("person"),
        }),
      },
    };

    expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(filter))).toEqual(filter);
    const codec = PaneSchema.StreamSettings.fields.filter;
    expect(Schema.decodeSync(codec)(Schema.encodeSync(codec)(filter))).toEqual(filter);
  });

  it("keeps a cleared default cleared through attrs and URL encoding", () => {
    const defaults = StreamSettings.defaults(
      PaneSchema.StreamFilterType.cases.notes.make({}),
    ).filter;

    expect(StreamSettings.changedProps(defaults)).toEqual([]);
    const codec = PaneSchema.StreamSettings.fields.filter;
    const decoded = Schema.decodeSync(codec)(Schema.encodeSync(codec)(defaults));
    expect(StreamSettings.changedProps(decoded)).toEqual([]);

    const cleared = StreamSettings.changePropFilter(defaults, {
      propId: BuiltinAttrs.archivedId,
      value: undefined,
    });

    expect(StreamSettings.propFilters(cleared)).toEqual({});
    expect(StreamSettings.changedProps(cleared)).toEqual([BuiltinAttrs.archivedId]);
    expect(StreamFilter.fromAttrs(StreamFilter.toAttrs(cleared))).toEqual(cleared);
    expect(Schema.decodeSync(codec)(Schema.encodeSync(codec)(cleared))).toEqual(cleared);
  });
});
