import { Option, Predicate, Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "../attrs.schema";
import { PaneSchema } from "./pane.schema";
import { StreamSettings } from "./stream-settings";
import { Filters } from "./filters";
import { RecordSearch } from "./search";

const expr = AttrsSchema.makeFilterExpr;

const parent = AttrsSchema.RecordId.make("priority");

describe("canonical stream settings", () => {
  it("defaults missing filters while preserving an explicit empty array", () => {
    const decode = Schema.decodeUnknownSync(PaneSchema.Pane);
    expect(decode(PaneSchema.make.stream({}))).toMatchObject(StreamSettings.defaultPreset);
    expect(decode(PaneSchema.make.stream({ filter: [] }))).toMatchObject({ filter: [] });
    expect(Schema.decodeUnknownSync(RecordSearch.Schema)({}).panes[0]).toMatchObject(
      StreamSettings.defaultPreset,
    );
    expect(() => {
      return decode(JSON.parse('{"_tag":"stream","filter":{"type":{"_tag":"notes"}}}'));
    }).toThrow();
  });

  it("round-trips nested expressions and source in URLs", () => {
    const schema = Schema.fromJsonString(RecordSearch.Schema);

    const value = Schema.decodeUnknownSync(RecordSearch.Schema)({
      panes: [
        PaneSchema.make.stream({
          filter: [
            expr.or({ val: [Filters.namedTypes.notes.make(), Filters.enumOptions.make(parent)] }),
          ],
          source: PaneSchema.Source.cases.prop.make({ id: parent }),
        }),
      ],
    });

    expect(Schema.decodeSync(schema)(Schema.encodeSync(schema)(value))).toEqual(value);
  });

  it("recognizes the complete ordered enum parent group", () => {
    const options = Filters.enumOptions.make(parent);
    expect(Filters.enumOptions.match(options)).toEqual(Result.succeed(parent));

    if (!Predicate.isTagged(options, "and")) throw new Error("Expected enum group");

    const unmatched = [
      Filters.namedTypes.notes.make(),
      expr.and({ val: [options] }),
      expr.and({ val: [...options.val, Filters.aliases.unarchived.make()] }),
      expr.and({ val: [...options.val].reverse() }),
      expr.and({ val: [options, options.val[1]!, options.val[2]!] }),
    ];

    for (const expression of unmatched) {
      expect(Filters.enumOptions.match(expression)).toEqual(Result.fail(expression));
    }
  });

  it("derives display defaults and ignores OR branches when prefilling", () => {
    expect(StreamSettings.changedDisplay(StreamSettings.defaultPreset)).toEqual([]);
    expect(StreamSettings.changedDisplay(StreamSettings.presets.pages)).toEqual(["sort"]);
    expect(
      StreamSettings.requiredComparisons([
        Filters.namedTypes.notes.make(),
        expr.or({ val: [expr.cmp({ val: ["date", "=", "2026-10-15"] })] }),
      ]),
    ).toEqual([
      ["_tag", "=", "note"],
      ["title", "exists", false],
    ]);
  });

  it("retains invalid in stream filters but rejects it in saved target filters", () => {
    const filter = [expr.and({ val: [expr.cmp({ val: [["prop", parent], "invalid", true] })] })];
    expect(Schema.decodeSync(AttrsSchema.Filter)(filter)).toEqual(filter);
    expect(() => Schema.decodeUnknownSync(AttrsSchema.TargetFilter)(filter)).toThrow();
  });

  it("reads the first required values and skips OR branches", () => {
    const optional = expr.or({
      val: [
        expr.cmp({ val: ["body", "contains", "optional"] }),
        expr.cmp({ val: ["date", "=", "2026-10-14"] }),
        expr.cmp({ val: ["_tag", "=", "prop"] }),
      ],
    });

    const filter = [
      optional,
      expr.and({
        val: [
          Filters.namedTypes.notes.make(),
          expr.cmp({ val: ["body", "contains", "alpha"] }),
          expr.cmp({ val: ["date", "=", "2026-10-15"] }),
        ],
      }),
      expr.cmp({ val: ["body", "contains", "beta"] }),
    ];

    expect(StreamSettings.firstSearch(filter)).toEqual(Option.some("alpha"));
    expect(StreamSettings.firstDate(filter)).toEqual(Option.some("2026-10-15"));
    expect(StreamSettings.firstTag(filter)).toEqual(Option.some("note"));

    for (const empty of [[], [optional]]) {
      expect(StreamSettings.firstSearch(empty)).toEqual(Option.none());
      expect(StreamSettings.firstDate(empty)).toEqual(Option.none());
      expect(StreamSettings.firstTag(empty)).toEqual(Option.none());
    }
  });

  it("collects required outgoing targets in order and exposes the first one", () => {
    const other = AttrsSchema.RecordId.make("other");

    const filter = [
      expr.or({ val: [expr.cmp({ val: [["link", "->", other], "exists", true] })] }),
      expr.cmp({ val: [["link", "<-", other], "exists", true] }),
      expr.and({ val: [expr.cmp({ val: [["link", "->", parent], "exists", true] })] }),
      expr.cmp({ val: [["link", "->", other], "exists", true] }),
    ];

    expect(StreamSettings.linksTo(filter)).toEqual([parent, other]);
    expect(StreamSettings.firstLinkTo(filter)).toEqual(Option.some(parent));
    expect(StreamSettings.linksTo([])).toEqual([]);
    expect(StreamSettings.firstLinkTo([])).toEqual(Option.none());
  });
});
