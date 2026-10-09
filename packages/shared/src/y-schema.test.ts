import { describe, expect, it } from "vite-plus/test";
import { Effect, Option, Record, Result, Schema } from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { YSchema } from "./y-schema";

function fixture() {
  const doc = new Y.Doc();
  const map = doc.getMap<unknown>("attrs");
  const attrs = YSchema.make({ schema: AttrsSchema.Attrs, map });

  return { doc, map, attrs };
}

const example = (doc: Y.Doc, targets: AttrsSchema.TargetFilter | undefined) =>
  Effect.gen(function* () {
    const attrs = YSchema.make({ schema: AttrsSchema.Attrs, map: doc.getMap("attrs") });

    const prop = yield* attrs.pipe(
      YSchema.upsert("_tag", "prop"),
      Effect.flatMap(YSchema.expect("prop")),
    );

    const link = yield* prop.pipe(
      YSchema.upsert("prop_type", "link"),
      Effect.flatMap(YSchema.expect("link")),
    );

    if (targets === undefined) yield* link.pipe(YSchema.clear("prop_targets"));
    else yield* link.pipe(YSchema.set("prop_targets", targets));

    return link;
  });

describe("YSchema bound selections", () => {
  it("initializes a discriminator in a single-variant schema", () => {
    const doc = new Y.Doc();

    try {
      const map = doc.getMap<unknown>("record");

      const record = YSchema.make({
        schema: Schema.TaggedStruct("note", {
          category: Schema.Literal("personal"),
          text: Schema.String,
        }),
        map,
      });

      expect(Effect.runSync(YSchema.find(record, "_tag"))).toEqual(Option.none());
      const note = Effect.runSync(YSchema.upsert(record, "_tag", "note"));
      const personal = Effect.runSync(note.pipe(YSchema.upsert("category", "personal")));
      Effect.runSync(YSchema.set(personal, "text", "hello"));
      const found = Option.getOrThrow(Effect.runSync(personal.pipe(YSchema.find("text"))));
      expect(Effect.runSync(YSchema.expect(found, "hello")).value).toBe("hello");
    } finally {
      doc.destroy();
    }
  });

  it("runs the sandbox flow without requiring a complete record", () => {
    const { doc, map, attrs } = fixture();

    try {
      const link = Effect.runSync(example(doc, []));
      expect(link.value).toBe("link");
      expect(map.get("_tag")).toBe("prop");
      expect(map.toJSON()).toMatchObject({ prop_type: "link", prop_targets: [] });
      const targets = Effect.runSync(link.pipe(YSchema.find("prop_targets")));
      expect(Option.getOrThrow(targets).value).toEqual([]);
      expect(Effect.runSync(attrs.pipe(YSchema.find("builtin")))).toEqual(Option.none());
      Effect.runSync(example(doc, undefined));
      expect(map.has("prop_targets")).toBe(false);
    } finally {
      doc.destroy();
    }
  });

  it("keeps existing tags and narrows the cursor through a manual value check", () => {
    const { doc, map, attrs } = fixture();

    try {
      map.set("_tag", "prop");
      map.set("prop_type", "bool");
      const prop = Effect.runSync(attrs.pipe(YSchema.upsert("_tag", "note")));

      if (prop.value !== "prop") throw new Error("Expected prop");
      const bool = Effect.runSync(prop.pipe(YSchema.upsert("prop_type", "link")));

      expect(
        Result.isFailure(Effect.runSync(Effect.result(bool.pipe(YSchema.expect("link"))))),
      ).toBe(true);

      if (bool.value !== "bool") throw new Error("Expected bool");

      const written = Effect.runSync(
        bool.pipe(YSchema.set("prop_default", AttrsSchema.PropVal.cases.bool.make({ val: false }))),
      );

      expect(written.value).toEqual(AttrsSchema.PropVal.cases.bool.make({ val: false }));
      expect(map.get("prop_type")).toBe("bool");
      expect(map.get("prop_default")).toEqual(AttrsSchema.PropVal.cases.bool.make({ val: false }));
    } finally {
      doc.destroy();
    }
  });

  it("preserves malformed existing values during upsert and allows set to repair them", () => {
    const { doc, map, attrs } = fixture();

    try {
      map.set("_tag", 42);

      for (const operation of [
        attrs.pipe(YSchema.find("_tag"), Effect.asVoid),
        attrs.pipe(YSchema.upsert("_tag", "prop"), Effect.asVoid),
      ]) {
        expect(Result.isFailure(Effect.runSync(Effect.result(operation)))).toBe(true);
        expect(map.get("_tag")).toBe(42);
      }

      const repaired = Effect.runSync(attrs.pipe(YSchema.set("_tag", "prop")));
      const bool = Effect.runSync(repaired.pipe(YSchema.set("prop_type", "bool")));
      map.set("prop_default", AttrsSchema.PropVal.cases.text.make({ val: "wrong" }));
      Effect.runSync(
        bool.pipe(YSchema.set("prop_default", AttrsSchema.PropVal.cases.bool.make({ val: true }))),
      );
      expect(map.get("prop_default")).toEqual(AttrsSchema.PropVal.cases.bool.make({ val: true }));
    } finally {
      doc.destroy();
    }
  });

  it("rejects stale selections before reading or writing", () => {
    const { doc, map } = fixture();

    try {
      const link = Effect.runSync(example(doc, []));
      map.set("prop_type", "bool");
      expect(
        Result.isFailure(Effect.runSync(Effect.result(link.pipe(YSchema.set("prop_targets", []))))),
      ).toBe(true);
      expect(
        Result.isFailure(Effect.runSync(Effect.result(link.pipe(YSchema.find("prop_targets"))))),
      ).toBe(true);
      expect(map.get("prop_targets")).toEqual([]);
      map.set("_tag", "note");
      expect(
        Result.isFailure(Effect.runSync(Effect.result(YSchema.clear(link, "prop_targets")))),
      ).toBe(true);
      expect(map.has("prop_targets")).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it("retains filter validation and does not replace values after a failed write", () => {
    const { doc, map } = fixture();

    try {
      const link = Effect.runSync(example(doc, []));

      const invalid: AttrsSchema.Filter = [
        Schema.TaggedStruct("cmp", { val: AttrsSchema.FilterCmp }).make({
          val: [["prop", AttrsSchema.NoteId.make("priority")], "invalid", true],
        }),
      ];

      // @ts-expect-error target filters exclude invalid comparisons
      const badWrite = link.pipe(YSchema.set("prop_targets", invalid));
      expect(Result.isFailure(Effect.runSync(Effect.result(badWrite)))).toBe(true);
      expect(map.get("prop_targets")).toEqual([]);
      // @ts-expect-error exercise the runtime guard for callers without typechecking
      const clearingRequired = link.pipe(YSchema.clear("_tag"));
      expect(Result.isFailure(Effect.runSync(Effect.result(clearingRequired)))).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it("separates target comparisons recursively from general filters", () => {
    const id = AttrsSchema.NoteId.make("priority");
    const cmp = Schema.TaggedStruct("cmp", { val: AttrsSchema.FilterCmp });
    const and = Schema.TaggedStruct("and", { val: AttrsSchema.Filter });
    const or = Schema.TaggedStruct("or", { val: AttrsSchema.Filter });
    const invalid = cmp.make({ val: [["prop", id], "invalid", true] });
    const exists = cmp.make({ val: [["prop", id], "exists", true] });
    const valid = [and.make({ val: [or.make({ val: [exists] })] })];

    expect(Schema.decodeUnknownSync(AttrsSchema.TargetFilter)(valid)).toEqual(valid);

    const forms = [
      [invalid],
      [and.make({ val: [invalid] })],
      [and.make({ val: [or.make({ val: [invalid] })] })],
    ];

    for (const filter of forms) {
      expect(Schema.decodeUnknownSync(AttrsSchema.Filter)(filter)).toEqual(filter);
      expect(Result.isFailure(Schema.decodeUnknownResult(AttrsSchema.TargetFilter)(filter))).toBe(
        true,
      );
      // @ts-expect-error nested invalid expressions also cannot be written to a target filter
      const target: AttrsSchema.TargetFilter = filter;
      void target;
    }

    const date = cmp.make({ val: ["date", "=", "2026-10-09"] });
    expect(Schema.decodeUnknownSync(AttrsSchema.TargetFilter)([date])).toEqual([date]);
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(AttrsSchema.TargetFilter)([
          { ...date, val: ["date", "=", "2026-02-30"] },
        ]),
      ),
    ).toBe(true);
  });

  it("encodes writes and decodes reads through the field codec", () => {
    const doc = new Y.Doc();

    try {
      const map = doc.getMap<unknown>("counts");

      const counts = YSchema.make({
        schema: Schema.Struct({ count: Schema.NumberFromString }),
        map,
      });

      const written = Effect.runSync(counts.pipe(YSchema.set("count", 42)));
      expect(written.value).toBe(42);
      expect(map.get("count")).toBe("42");
      const found = Effect.runSync(counts.pipe(YSchema.find("count")));
      expect(Option.getOrThrow(found).value).toBe(42);
    } finally {
      doc.destroy();
    }
  });

  it("can bind a nested shared map independently", () => {
    const doc = new Y.Doc();

    try {
      const map = new Y.Map<unknown>();
      doc.getMap("attrs").set("props", map);

      const props = YSchema.make({
        schema: Schema.Record(AttrsSchema.NoteId, AttrsSchema.PropVal),
        map,
      });

      Effect.runSync(
        props.pipe(
          YSchema.set(
            AttrsSchema.NoteId.make("priority"),
            AttrsSchema.PropVal.cases.text.make({ val: "High" }),
          ),
        ),
      );
      expect(
        Option.getOrThrow(
          Effect.runSync(props.pipe(YSchema.find(AttrsSchema.NoteId.make("priority")))),
        ).value,
      ).toEqual(AttrsSchema.PropVal.cases.text.make({ val: "High" }));
      expect(
        Result.isFailure(
          Effect.runSync(
            Effect.result(
              props.pipe(
                // @ts-expect-error malformed callers must still fail at runtime
                YSchema.set("", AttrsSchema.PropVal.cases.text.make({ val: "invalid key" })),
              ),
            ),
          ),
        ),
      ).toBe(true);
      expect(map.has("")).toBe(false);
    } finally {
      doc.destroy();
    }
  });
  it("mounts schema-declared maps and exports a plain JSON snapshot", () => {
    const { doc, map, attrs } = fixture();

    try {
      expect(Effect.runSync(attrs.pipe(YSchema.findMap("props")))).toEqual(Option.none());
      expect(map.has("props")).toBe(false);
      const note = Effect.runSync(attrs.pipe(YSchema.set("_tag", "note")));
      const props = Effect.runSync(note.pipe(YSchema.upsertMap("props")));
      const high = AttrsSchema.PropVal.cases.text.make({ val: "High" });
      Effect.runSync(
        props.pipe(YSchema.set({ propId: AttrsSchema.NoteId.make("priority") }, high)),
      );

      expect(map.get("props")).toBeInstanceOf(Y.Map);
      const snapshot = Effect.runSync(attrs.pipe(YSchema.toJSON));

      const decoded = AttrsSchema.Attrs.members[0].make({
        props: { [AttrsSchema.NoteId.make("priority")]: high },
      });

      expect(snapshot).toEqual(Record.remove(decoded, "builtin"));
      expect(Schema.decodeUnknownSync(AttrsSchema.Attrs)(snapshot)).toEqual(decoded);
      expect(Effect.runSync(note.pipe(YSchema.find("props")))).toMatchObject({
        value: { value: { priority: high } },
      });

      // Exported atomic entries must not alias values stored in Yjs.
      const exported = Schema.decodeUnknownSync(
        Schema.Struct({
          props: Schema.Record(Schema.String, Schema.Unknown),
        }),
      )(snapshot);

      const mounted = map.get("props");

      if (!(mounted instanceof Y.Map)) throw new Error("Expected props map");
      expect(exported.props.priority).not.toBe(mounted.get("priority"));
      expect(Option.getOrThrow(Effect.runSync(note.pipe(YSchema.findMap("props"))))).toBeDefined();
    } finally {
      doc.destroy();
    }
  });

  it("mounts nested maps on set and rejects cursors after their parent is replaced", () => {
    const doc = new Y.Doc();

    try {
      const schema = Schema.Struct({
        settings: YSchema.Map(
          Schema.Struct({
            counters: Schema.optionalKey(
              YSchema.Map(Schema.Struct({ count: Schema.NumberFromString })),
            ),
          }),
        ),
      });

      const map = doc.getMap<unknown>("attrs");
      const attrs = YSchema.make({ schema, map });
      Effect.runSync(attrs.pipe(YSchema.set("settings", { counters: { count: 1 } })));
      const settings = Effect.runSync(attrs.pipe(YSchema.upsertMap("settings")));
      const counters = Effect.runSync(YSchema.upsertMap(settings, "counters"));
      Effect.runSync(counters.pipe(YSchema.set("count", 42)));
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual({
        settings: { counters: { count: "42" } },
      });
      expect(Effect.runSync(attrs.pipe(YSchema.exportStrict))).toEqual({
        settings: { counters: { count: 42 } },
      });
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).toEqual({
        settings: { counters: { count: 42 } },
      });
      const mounted = map.get("settings");
      expect(mounted).toBeInstanceOf(Y.Map);

      if (!(mounted instanceof Y.Map)) throw new Error("Expected settings map");
      expect(mounted.get("counters")).toBeInstanceOf(Y.Map);
      const child = mounted.get("counters");

      if (!(child instanceof Y.Map)) throw new Error("Expected counters map");
      expect(child.get("count")).toBe("42");

      Effect.runSync(attrs.pipe(YSchema.set("settings", { counters: { count: 7 } })));

      for (const operation of [
        counters.pipe(YSchema.find("count"), Effect.asVoid),
        counters.pipe(YSchema.set("count", 8), Effect.asVoid),
        counters.pipe(YSchema.toJSON, Effect.asVoid),
        counters.pipe(YSchema.exportLoose, Effect.asVoid),
        counters.pipe(YSchema.exportStrict, Effect.asVoid),
      ]) {
        expect(Result.isFailure(Effect.runSync(Effect.result(operation)))).toBe(true);
      }

      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual({
        settings: { counters: { count: "7" } },
      });
    } finally {
      doc.destroy();
    }
  });

  it("preserves invalid snapshots and permits individual entry repairs", () => {
    const { doc, map, attrs } = fixture();

    try {
      map.set("_tag", 42);
      const child = new Y.Map<unknown>();
      map.set("props", child);
      child.set("broken", "invalid value");
      const props = Effect.runSync(attrs.pipe(YSchema.upsertMap("props")));
      const snapshot = Effect.runSync(attrs.pipe(YSchema.toJSON));
      expect(snapshot).toEqual({ _tag: 42, props: { broken: "invalid value" } });
      expect(Result.isFailure(Schema.decodeUnknownResult(AttrsSchema.Attrs)(snapshot))).toBe(true);
      expect(
        Result.isFailure(
          Effect.runSync(
            Effect.result(props.pipe(YSchema.find({ propId: AttrsSchema.NoteId.make("broken") }))),
          ),
        ),
      ).toBe(true);
      Effect.runSync(
        props.pipe(
          YSchema.set(
            { propId: AttrsSchema.NoteId.make("broken") },
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
          ),
        ),
      );
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual({
        _tag: 42,
        props: { broken: AttrsSchema.PropVal.cases.number.make({ val: 7 }) },
      });
      expect(snapshot).toEqual({ _tag: 42, props: { broken: "invalid value" } });

      const incompatible = { saved: "keep me" };
      map.set("props", incompatible);
      expect(
        Result.isFailure(Effect.runSync(Effect.result(attrs.pipe(YSchema.upsertMap("props"))))),
      ).toBe(true);
      expect(map.get("props")).toBe(incompatible);
    } finally {
      doc.destroy();
    }
  });

  it("retains map declarations after narrowing to a rule", () => {
    const { doc, map, attrs } = fixture();

    try {
      const rule = Effect.runSync(
        attrs.pipe(YSchema.upsert("_tag", "rule"), Effect.flatMap(YSchema.expect("rule"))),
      );

      Effect.runSync(rule.pipe(YSchema.upsertMap("props")));
      const expects = Effect.runSync(rule.pipe(YSchema.upsertMap("rule_expects")));
      Effect.runSync(
        expects.pipe(
          YSchema.set(
            { propId: AttrsSchema.NoteId.make("priority") },
            AttrsSchema.RuleExpectation.cases.required.make({}),
          ),
        ),
      );
      Effect.runSync(rule.pipe(YSchema.set("rule_targets", [])));
      expect(map.get("rule_expects")).toBeInstanceOf(Y.Map);
      expect(map.get("rule_targets")).toEqual([]);
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual(
        Record.remove(
          AttrsSchema.Attrs.members[3].make({
            props: {},
            rule_targets: [],
            rule_expects: {
              [AttrsSchema.NoteId.make("priority")]:
                AttrsSchema.RuleExpectation.cases.required.make({}),
            },
          }),
          "builtin",
        ),
      );
      const optional = AttrsSchema.RuleExpectation.cases.optional.make({});
      Effect.runSync(
        expects.pipe(YSchema.set({ propId: AttrsSchema.NoteId.make("priority") }, optional)),
      );
      expect(Effect.runSync(rule.pipe(YSchema.exportStrict))).toEqual(
        AttrsSchema.Attrs.members[3].make({
          props: {},
          rule_targets: [],
          rule_expects: { [AttrsSchema.NoteId.make("priority")]: optional },
        }),
      );
      const mounted = map.get("rule_expects");

      if (!(mounted instanceof Y.Map)) throw new Error("Expected expectations map");
      mounted.set("legacy", { required: true });
      expect(Result.isFailure(Effect.runSync(Effect.result(rule.pipe(YSchema.exportStrict))))).toBe(
        true,
      );
      expect(Effect.runSync(rule.pipe(YSchema.exportLoose)).rule_expects).toEqual({
        priority: optional,
      });
      map.set("_tag", "note");
      expect(
        Result.isFailure(
          Effect.runSync(
            Effect.result(
              expects.pipe(
                YSchema.set(
                  { propId: AttrsSchema.NoteId.make("priority") },
                  AttrsSchema.RuleExpectation.cases.optional.make({}),
                ),
              ),
            ),
          ),
        ),
      ).toBe(true);
    } finally {
      doc.destroy();
    }
  });

  it("merges independent entries in mounted maps across replicas", () => {
    const first = new Y.Doc();
    const second = new Y.Doc();

    try {
      const firstAttrs = YSchema.make({ schema: AttrsSchema.Attrs, map: first.getMap("attrs") });
      const firstProps = Effect.runSync(firstAttrs.pipe(YSchema.upsertMap("props")));
      Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
      const secondAttrs = YSchema.make({ schema: AttrsSchema.Attrs, map: second.getMap("attrs") });
      const secondProps = Effect.runSync(secondAttrs.pipe(YSchema.upsertMap("props")));
      Effect.runSync(
        firstProps.pipe(
          YSchema.set(
            { propId: AttrsSchema.NoteId.make("priority") },
            AttrsSchema.PropVal.cases.text.make({ val: "High" }),
          ),
        ),
      );
      Effect.runSync(
        secondProps.pipe(
          YSchema.set(
            { propId: AttrsSchema.NoteId.make("archived") },
            AttrsSchema.PropVal.cases.bool.make({ val: true }),
          ),
        ),
      );
      Y.applyUpdate(first, Y.encodeStateAsUpdate(second));
      Y.applyUpdate(second, Y.encodeStateAsUpdate(first));
      expect(Effect.runSync(firstAttrs.pipe(YSchema.toJSON))).toEqual(
        Effect.runSync(secondAttrs.pipe(YSchema.toJSON)),
      );
      expect(Effect.runSync(firstAttrs.pipe(YSchema.toJSON))).toEqual({
        props: {
          priority: AttrsSchema.PropVal.cases.text.make({ val: "High" }),
          archived: AttrsSchema.PropVal.cases.bool.make({ val: true }),
        },
      });
    } finally {
      first.destroy();
      second.destroy();
    }
  });

  it("keeps named keys through selections and clears dictionary entries", () => {
    const { doc, attrs } = fixture();

    try {
      const value = AttrsSchema.PropVal.cases.number.make({ val: 123 });

      const written = Effect.runSync(
        attrs.pipe(
          YSchema.upsertMap("props"),
          Effect.flatMap(YSchema.set({ propId: AttrsSchema.NoteId.make("foobar") }, value)),
        ),
      );

      expect(written.value).toEqual(value);
      expect(
        Option.getOrThrow(
          Effect.runSync(written.pipe(YSchema.find({ propId: AttrsSchema.NoteId.make("foobar") }))),
        ).value,
      ).toEqual(value);
      expect(Effect.runSync(written.pipe(YSchema.toJSON))).toEqual({ foobar: value });
      Effect.runSync(written.pipe(YSchema.clear({ propId: AttrsSchema.NoteId.make("foobar") })));
      expect(
        Effect.runSync(written.pipe(YSchema.find({ propId: AttrsSchema.NoteId.make("foobar") }))),
      ).toEqual(Option.none());
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual({ props: {} });
      // @ts-expect-error external callers can supply a malformed named key
      const wrongKey = written.pipe(YSchema.set({ noteId: "foobar" }, value));
      expect(Result.isFailure(Effect.runSync(Effect.result(wrongKey)))).toBe(true);
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual({ props: {} });
    } finally {
      doc.destroy();
    }
  });

  it("exports loose fields independently and leaves corrupt Yjs data untouched", () => {
    const { doc, map, attrs } = fixture();

    try {
      map.set("_tag", 42);
      map.set("builtin", true);
      map.set("prop_type", "bool");
      map.set("prop_default", AttrsSchema.PropVal.cases.text.make({ val: "old default" }));
      map.set("rule_targets", "broken");
      map.set("unknown", "discarded");
      const props = new Y.Map<unknown>();
      map.set("props", props);
      const value = AttrsSchema.PropVal.cases.number.make({ val: 7 });
      props.set("good", value);
      props.set("bad", { val: 1 });
      props.set("infinite", { ...value, val: Infinity });
      const raw = Effect.runSync(attrs.pipe(YSchema.toJSON));
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).toEqual({
        builtin: true,
        prop_type: "bool",
        prop_default: AttrsSchema.PropVal.cases.text.make({ val: "old default" }),
        props: { good: value },
      });
      expect(
        Result.isFailure(Effect.runSync(Effect.result(attrs.pipe(YSchema.exportStrict)))),
      ).toBe(true);
      expect(Effect.runSync(attrs.pipe(YSchema.toJSON))).toEqual(raw);
      map.set("props", "broken");
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).not.toHaveProperty("props");
    } finally {
      doc.destroy();
    }
  });

  it("strict export defaults missing shared fields and enforces property defaults", () => {
    const { doc, map, attrs } = fixture();

    try {
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).toEqual({});
      expect(Effect.runSync(attrs.pipe(YSchema.exportStrict))).toEqual(
        AttrsSchema.Attrs.members[0].make({}),
      );
      expect(map.toJSON()).toEqual({});
      map.set("_tag", "prop");
      expect(
        Result.isFailure(Effect.runSync(Effect.result(attrs.pipe(YSchema.exportStrict)))),
      ).toBe(true);
      map.set("props", new Y.Map());
      map.set("prop_type", "bool");
      map.set("prop_default", AttrsSchema.PropVal.cases.text.make({ val: "wrong kind" }));
      expect(
        Result.isFailure(Effect.runSync(Effect.result(attrs.pipe(YSchema.exportStrict)))),
      ).toBe(true);
      const value = AttrsSchema.PropVal.cases.bool.make({ val: false });
      map.set("prop_default", value);
      expect(Effect.runSync(attrs.pipe(YSchema.exportStrict))).toEqual(
        AttrsSchema.Attrs.members[1].cases.bool.make({ props: {}, prop_default: value }),
      );
    } finally {
      doc.destroy();
    }
  });

  it("decodes exports with transforms and preserves whole-union checks after narrowing", () => {
    const doc = new Y.Doc();

    try {
      const map = doc.getMap<unknown>("attrs");

      const variants = Schema.TaggedUnion({
        note: { amount: Schema.NumberFromString.check(Schema.isFinite()) },
        rule: { amount: Schema.NumberFromString.check(Schema.isFinite()) },
      });

      const schema = variants.check(Schema.makeFilter((value) => value.amount > 0));

      const attrs = YSchema.make({ schema, map });
      map.set("_tag", "note");
      map.set("amount", "42");
      const note = Effect.runSync(attrs.pipe(YSchema.upsert("_tag", "note")));
      expect(Effect.runSync(note.pipe(YSchema.exportStrict))).toEqual(
        variants.cases.note.make({ amount: 42 }),
      );
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).toEqual(
        variants.cases.note.make({ amount: 42 }),
      );
      expect(map.get("amount")).toBe("42");
      map.set("amount", "-1");
      expect(
        Result.isFailure(Effect.runSync(Effect.result(attrs.pipe(YSchema.exportStrict)))),
      ).toBe(true);
      expect(Result.isFailure(Effect.runSync(Effect.result(note.pipe(YSchema.exportStrict))))).toBe(
        true,
      );
      expect(Effect.runSync(note.pipe(YSchema.exportLoose))).toEqual(
        variants.cases.note.make({ amount: -1 }),
      );
      map.set("amount", "not a number");
      expect(Effect.runSync(attrs.pipe(YSchema.exportLoose))).not.toHaveProperty("amount");
    } finally {
      doc.destroy();
    }
  });
});

// Compiled by vp check; never invoked. The assertions cover public API inference.
function typeChecks(attrs: YSchema.Cursor<AttrsSchema.Attrs, typeof AttrsSchema.Attrs>) {
  // @ts-expect-error writes need a record kind with this field in every remaining variant
  attrs.pipe(YSchema.set("prop_targets", []));
  const prop = Effect.runSync(attrs.pipe(YSchema.set("_tag", "prop")));
  const bool = Effect.runSync(prop.pipe(YSchema.set("prop_type", "bool")));
  // @ts-expect-error bool definitions cannot hold text defaults
  bool.pipe(YSchema.set("prop_default", AttrsSchema.PropVal.cases.text.make({ val: "wrong" })));
  // @ts-expect-error a field cannot use another field's value
  prop.pipe(YSchema.set("prop_type", "prop"));
  const link = Effect.runSync(prop.pipe(YSchema.set("prop_type", "link")));
  const rule = Effect.runSync(attrs.pipe(YSchema.set("_tag", "rule")));

  const validTarget: AttrsSchema.TargetFilter = [
    Schema.TaggedStruct("cmp", { val: AttrsSchema.TargetFilterCmp }).make({
      val: ["title", "exists", true],
    }),
  ];

  link.pipe(YSchema.set("prop_targets", validTarget));
  rule.pipe(YSchema.set("rule_targets", validTarget));

  const invalid = Schema.TaggedStruct("cmp", { val: AttrsSchema.FilterCmp }).make({
    val: [["prop", AttrsSchema.NoteId.make("priority")], "invalid", true],
  });

  // @ts-expect-error invalid comparisons cannot be used as property targets
  link.pipe(YSchema.set("prop_targets", [invalid]));
  // @ts-expect-error invalid comparisons cannot be used as rule targets
  rule.pipe(YSchema.set("rule_targets", [invalid]));
  // @ts-expect-error scopes belong only to link definitions
  bool.pipe(YSchema.find("prop_targets"));
  // @ts-expect-error required discriminator fields cannot be cleared
  attrs.pipe(YSchema.clear("_tag"));
  // @ts-expect-error unknown value tags are rejected
  prop.pipe(YSchema.set("prop_type", "unknown"));
  // @ts-expect-error a known bool selection cannot be a link selection
  bool.pipe(YSchema.expect("link"));
  // @ts-expect-error data-first writes reject incompatible field values too
  YSchema.set(bool, "prop_default", AttrsSchema.PropVal.cases.text.make({ val: "wrong" }));
  // @ts-expect-error data-first required fields cannot be cleared
  YSchema.clear(attrs, "_tag");
  const props = Effect.runSync(attrs.pipe(YSchema.upsertMap("props")));
  props.pipe(
    YSchema.set(
      { propId: AttrsSchema.NoteId.make("priority") },
      AttrsSchema.PropVal.cases.number.make({ val: 7 }),
    ),
  );
  // @ts-expect-error note IDs must use the shared branded ID
  props.pipe(YSchema.find({ propId: "priority" }));
  // @ts-expect-error referenced values also require note IDs
  AttrsSchema.PropVal.cases.link.make({ val: "unbranded" });
  // @ts-expect-error a property entry must be a tagged PropVal
  props.pipe(YSchema.set({ propId: AttrsSchema.NoteId.make("priority") }, 7));
  // @ts-expect-error dictionary keys use their declared argument name
  props.pipe(YSchema.find({ noteId: "priority" }));
  // @ts-expect-error named dictionary keys cannot be positional strings
  props.pipe(YSchema.find(AttrsSchema.NoteId.make("priority")));
  // @ts-expect-error named keys accept only one argument
  props.pipe(YSchema.clear({ propId: AttrsSchema.NoteId.make("priority"), extra: "wrong" }));
  // @ts-expect-error named keys are only supported for dictionary schemas
  YSchema.Map({ schema: Schema.Struct({ fixed: Schema.String }), key: "propId" });
  const loose = Effect.runSync(attrs.pipe(YSchema.exportLoose));

  const priority = loose.props?.[AttrsSchema.NoteId.make("priority")];
  const optionalNumber: number | undefined = priority?._tag === "number" ? priority.val : undefined;

  void optionalNumber;
  // @ts-expect-error a loose export does not guarantee required fields
  const full: AttrsSchema.Attrs = loose;
  void full;
  const strict: AttrsSchema.Attrs = Effect.runSync(attrs.pipe(YSchema.exportStrict));
  void strict;
  // @ts-expect-error prop_default is atomic JSON, not a mounted map
  bool.pipe(YSchema.upsertMap("prop_default"));
  // @ts-expect-error rule_expects is unavailable until the record kind is narrowed
  attrs.pipe(YSchema.upsertMap("rule_expects"));
}

void typeChecks;
