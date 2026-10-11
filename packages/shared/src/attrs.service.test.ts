import { Effect, Predicate, Result, Schema, Stream, SubscriptionRef } from "effect";
import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { BuiltinAttrs } from "./builtin-attrs";
import { PropRecordRepo } from "./prop-record.repo";

describe("Attrs property editing", () => {
  it("watches local and synced definition defaults and releases its observer", async () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const map = doc.getMap("attrs");
    const observe = vi.spyOn(map, "observeDeep");
    const unobserve = vi.spyOn(map, "unobserveDeep");

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;
            yield* attrs.initializeProp({
              doc,
              defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            const pull = yield* Stream.toPull(attrs.watch({ doc }));
            const [initial] = yield* pull;
            expect(initial!.attrs).toEqual(
              AttrsSchema.PropAttrs.cases.bool.make({
                prop_type: "bool",
                prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
              }),
            );

            yield* attrs.setPropDefault({
              doc,
              value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            });
            const [local] = yield* pull;
            expect(local!.attrs).toMatchObject({
              prop_default: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            });

            Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
            yield* attrs.setPropDefault({
              doc: remote,
              value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
            const [synced] = yield* pull;
            expect(synced!.attrs).toEqual(initial!.attrs);

            const props = doc.getMap("attrs").get("props");
            expect(props).toBeInstanceOf(Y.Map);

            if (!(props instanceof Y.Map)) throw new Error("Missing props map");
            props.set("broken", "not a property value");
            const [invalid] = yield* pull;
            expect(invalid!.attrs).toEqual(initial!.attrs);
            expect(props.get("broken")).toBe("not a property value");

            map.set("prop_default", "broken default");
            const [invalidDefault] = yield* pull;
            expect(invalidDefault!.attrs.prop_type).toBe("bool");
            expect(invalidDefault!.attrs).not.toHaveProperty("prop_default");
            expect(map.get("prop_default")).toBe("broken default");

            yield* attrs.setPropDefault({
              doc,
              value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            const [replaced] = yield* pull;
            expect(replaced!.attrs).toEqual(initial!.attrs);

            props.delete("broken");
            const [recovered] = yield* pull;
            expect(recovered!.attrs).toEqual(initial!.attrs);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
      expect(observe).toHaveBeenCalledOnce();
      expect(unobserve).toHaveBeenCalledWith(observe.mock.calls[0]![0]);
    } finally {
      doc.destroy();
      remote.destroy();
    }
  });

  it("rejects wrong default value types and non-properties without changing Yjs", () => {
    const doc = new Y.Doc();

    try {
      Effect.runSync(
        Attrs.Service.use((attrs) =>
          Effect.gen(function* () {
            const original = Y.encodeStateAsUpdate(doc);
            expect(
              Result.isFailure(
                yield* Effect.result(
                  attrs.setPropDefault({
                    doc,
                    value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
                  }),
                ),
              ),
            ).toBe(true);
            expect(Y.encodeStateAsUpdate(doc)).toEqual(original);

            yield* attrs.initializeProp({
              doc,
              defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            const before = Y.encodeStateAsUpdate(doc);
            expect(
              Result.isFailure(
                yield* Effect.result(
                  attrs.setPropDefault({
                    doc,
                    value: AttrsSchema.PropVal.cases.text.make({ val: "wrong" }),
                  }),
                ),
              ),
            ).toBe(true);
            expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
    } finally {
      doc.destroy();
    }
  });

  it("decodes SQL cells and rejects incompatible defaults", () => {
    const row: typeof PropRecordRepo.ValidDef.Encoded = {
      id: "archived",
      title: "Archived",
      prop_type: "bool",
      prop_default: '{"_tag":"bool","val":false}',
    };

    const def = Schema.decodeSync(PropRecordRepo.ValidDef)(row);
    expect(def).toEqual({
      ...row,
      prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
    });
    expect(Schema.encodeSync(PropRecordRepo.ValidDef)(def)).toEqual(row);

    const decode = Schema.decodeUnknownResult(PropRecordRepo.ValidDef);
    expect(Result.isFailure(decode({ ...row, prop_type: null }))).toBe(true);
    const incompatible = { ...row, prop_default: '{"_tag":"number","val":1}' };
    expect(Result.isFailure(decode(incompatible))).toBe(true);
    expect(incompatible.prop_default).toBe('{"_tag":"number","val":1}');
  });

  it("preserves defaults and assignments when changing kind, and allows explicit replacement", () => {
    const doc = new Y.Doc();
    const propId = AttrsSchema.NoteId.make("hours");
    const original = AttrsSchema.PropVal.cases.bool.make({ val: false });

    try {
      Effect.runSync(
        Attrs.Service.use((attrs) =>
          Effect.gen(function* () {
            yield* attrs.initializeProp({ doc, defaultValue: original });
            yield* attrs.setProp({
              doc,
              recordId: AttrsSchema.NoteId.make("record"),
              propId,
              value: original,
            });
            yield* attrs.setPropType({ doc, type: "number" });
            const map = doc.getMap("attrs");
            expect(map.get("prop_type")).toBe("number");
            expect(map.get("prop_default")).toEqual(original);
            expect(map.toJSON().props[propId]).toEqual(original);

            const before = Y.encodeStateAsUpdate(doc);
            expect(
              Result.isFailure(
                yield* Effect.result(
                  attrs.setPropDefault({
                    doc,
                    // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction
                    value: { _tag: "number", val: Infinity },
                  }),
                ),
              ),
            ).toBe(true);
            expect(Y.encodeStateAsUpdate(doc)).toEqual(before);

            const value = AttrsSchema.PropVal.cases.number.make({ val: 7.5 });
            yield* attrs.setPropDefault({ doc, value });
            expect(map.get("prop_default")).toEqual(value);
            yield* attrs.clearPropDefault({ doc });
            expect(map.has("prop_default")).toBe(false);
            expect(map.toJSON().props[propId]).toEqual(original);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
    } finally {
      doc.destroy();
    }
  });

  it("ties each entry's value type to its definition", () => {
    expectTypeOf<Attrs.Entry<"bool">["value"]>()
      .extract<{ readonly _tag: "Valid" }>()
      .toEqualTypeOf<{
        readonly _tag: "Valid";
        readonly value: typeof AttrsSchema.PropVal.cases.bool.Type;
      }>();
    expectTypeOf<Attrs.Entry<"number">["value"]>()
      .extract<{ readonly _tag: "Valid" }>()
      .toEqualTypeOf<{
        readonly _tag: "Valid";
        readonly value: typeof AttrsSchema.PropVal.cases.number.Type;
      }>();
    expectTypeOf<{
      readonly def: PropRecordRepo.Def<"bool">;
      readonly value: {
        readonly _tag: "Valid";
        readonly value: typeof AttrsSchema.PropVal.cases.number.Type;
      };
    }>().not.toExtend<Attrs.Entry>();
  });

  it("observes initial, local and synced assignments, malformed values and map replacement", async () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const root = doc.getMap("attrs");
    const props = new Y.Map();
    const propId = AttrsSchema.NoteId.make("archived");
    const recordId = AttrsSchema.NoteId.make("note");
    const initial = AttrsSchema.PropVal.cases.bool.make({ val: false });

    const def: typeof PropRecordRepo.Defs.bool.Type = {
      id: propId,
      title: "Archived",
      prop_type: "bool",
      prop_default: initial,
    };

    root.set("props", props);
    props.set(propId, initial);
    props.set("unknown-property", "untouched");
    const observe = vi.spyOn(root, "observeDeep");
    const unobserve = vi.spyOn(root, "unobserveDeep");

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;

            const pull = yield* Stream.toPull(
              attrs.watchProps({ doc, defs: Stream.succeed([def]) }),
            );

            const [first] = yield* pull;
            expect(first).toEqual([{ def, value: Attrs.ValueState.Valid({ value: initial }) }]);
            const entry = first[0]!;

            if (Predicate.isTagged(entry.value, "Valid")) {
              expectTypeOf(entry.value.value).toEqualTypeOf<AttrsSchema.PropVal>();
            }

            yield* attrs.setProp({
              doc,
              recordId,
              propId,
              value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            });
            const [local] = yield* pull;
            expect(local[0]!.value).toEqual(
              Attrs.ValueState.Valid({
                value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
              }),
            );
            expect(first[0]!.value).toEqual(Attrs.ValueState.Valid({ value: initial }));

            Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
            remote.getMap<Y.Map<unknown>>("attrs").get("props")!.set(propId, initial);
            Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
            const [synced] = yield* pull;
            expect(synced[0]!.value).toEqual(Attrs.ValueState.Valid({ value: initial }));

            props.set(propId, "broken");
            const [malformed] = yield* pull;
            expect(malformed[0]!.value).toEqual(Attrs.ValueState.Invalid({}));
            expect(props.get(propId)).toBe("broken");

            yield* attrs.clearProp({ doc, propId });
            const [cleared] = yield* pull;
            expect(cleared).toEqual([{ def, value: Attrs.ValueState.Unset() }]);
            expect(props.get("unknown-property")).toBe("untouched");

            const replacement = new Y.Map();
            replacement.set(propId, initial);
            root.set("props", replacement);
            const [replaced] = yield* pull;
            expect(replaced[0]!.value).toEqual(Attrs.ValueState.Valid({ value: initial }));

            replacement.set(propId, null);
            const [invalid] = yield* pull;
            expect(invalid[0]!.value).toEqual(Attrs.ValueState.Invalid({}));
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );

      expect(observe).toHaveBeenCalledOnce();
      expect(unobserve).toHaveBeenCalledOnce();
      expect(unobserve).toHaveBeenCalledWith(observe.mock.calls[0]![0]);
    } finally {
      doc.destroy();
      remote.destroy();
    }
  });

  it("reacts to def changes and keeps wrong-kind assignments invalid", async () => {
    const doc = new Y.Doc();
    const propId = AttrsSchema.NoteId.make("archived");
    const initial = AttrsSchema.PropVal.cases.bool.make({ val: false });

    const def: typeof PropRecordRepo.Defs.bool.Type = {
      id: propId,
      title: "Archived",
      prop_type: "bool",
      prop_default: initial,
    };

    const props = new Y.Map();
    doc.getMap("attrs").set("props", props);
    props.set(propId, initial);

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;

            const defs = yield* SubscriptionRef.make<readonly PropRecordRepo.Def[]>([]);

            const pull = yield* Stream.toPull(
              attrs.watchProps({ doc, defs: SubscriptionRef.changes(defs) }),
            );

            expect(yield* pull).toEqual([[]]);

            yield* SubscriptionRef.set(defs, [def]);
            const [added] = yield* pull;
            expect(added).toEqual([{ def, value: Attrs.ValueState.Valid({ value: initial }) }]);

            const updated = {
              ...def,
              title: "Hidden",
              prop_default: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            };

            yield* SubscriptionRef.set(defs, [updated]);
            const [changed] = yield* pull;
            expect(changed).toEqual([
              { def: updated, value: Attrs.ValueState.Valid({ value: initial }) },
            ]);

            const text = AttrsSchema.PropVal.cases.text.make({ val: "false" });
            props.set(propId, text);
            const [invalid] = yield* pull;
            expect(invalid[0]!.value).toEqual(Attrs.ValueState.Invalid({ value: text }));

            const textDef = PropRecordRepo.Defs.text.make({
              id: propId,
              title: "Description",

              prop_type: "text",
              prop_default: null,
            });

            yield* SubscriptionRef.set(defs, [textDef]);
            const [retyped] = yield* pull;
            expect(retyped).toEqual([
              {
                def: textDef,
                value: Attrs.ValueState.Valid({
                  value: text,
                }),
              },
            ]);

            yield* SubscriptionRef.set(defs, []);
            expect(yield* pull).toEqual([[]]);
            expect(props.get(propId)).toEqual(text);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
    } finally {
      doc.destroy();
    }
  });

  it("reads and writes every property kind, leaving defaults unset and malformed numbers invalid", async () => {
    const doc = new Y.Doc();
    const recordId = AttrsSchema.NoteId.make("note");

    const values = [
      AttrsSchema.PropVal.cases.text.make({ val: "hello" }),
      AttrsSchema.PropVal.cases.number.make({ val: 7 }),
      AttrsSchema.PropVal.cases.bool.make({ val: false }),
      AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("choice") }),
      AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("linked-note") }),
    ];

    const defs = values.map((value) =>
      Schema.decodeSync(PropRecordRepo.ValidDef)({
        id: value._tag,
        title: value._tag,

        prop_type: value._tag,
        prop_default: JSON.stringify(value),
        prop_targets: null,
      }),
    );

    try {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;

            const pull = yield* Stream.toPull(
              attrs.watchProps({ doc, defs: Stream.succeed(defs) }),
            );

            const [initial] = yield* pull;
            expect(initial).toEqual(
              defs.map((def) => ({
                def,
                value: Attrs.ValueState.Unset(),
              })),
            );

            for (const value of values) {
              const propId = AttrsSchema.NoteId.make(value._tag);
              yield* attrs.setProp({ doc, recordId, propId, value });
              const [updated] = yield* pull;
              expect(updated.find((entry) => entry.def.id === propId)?.value).toEqual(
                Attrs.ValueState.Valid({ value }),
              );
            }

            const props = doc.getMap<Y.Map<unknown>>("attrs").get("props")!;
            const malformed = { ...values[1], val: Infinity };
            props.set("number", malformed);
            const [invalid] = yield* pull;
            expect(invalid.find((entry) => entry.def.id === "number")?.value).toEqual(
              Attrs.ValueState.Invalid({}),
            );
            expect(props.get("number")).toEqual(malformed);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
    } finally {
      doc.destroy();
    }
  });

  it("rejects assigning a property to its own def before changing the document", () => {
    const doc = new Y.Doc();
    const propId = BuiltinAttrs.archivedId;

    try {
      const result = Effect.runSync(
        Attrs.Service.use((attrs) =>
          attrs.setProp({
            doc,
            recordId: propId,
            propId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          }),
        ).pipe(Effect.provide(Attrs.Service.layer), Effect.result),
      );

      expect(Result.isFailure(result)).toBe(true);
      expect(doc.getMap("attrs").toJSON()).toEqual({});
    } finally {
      doc.destroy();
    }
  });

  it("clears malformed assignments without decoding them or creating missing maps", () => {
    const doc = new Y.Doc();
    const propId = AttrsSchema.NoteId.make("archived");

    try {
      Effect.runSync(
        Attrs.Service.use((attrs) =>
          Effect.gen(function* () {
            yield* attrs.clearProp({ doc, propId });
            expect(doc.getMap("attrs").toJSON()).toEqual({});

            const props = new Y.Map();
            doc.getMap("attrs").set("props", props);
            props.set(propId, "broken");
            yield* attrs.clearProp({ doc, propId });
            expect(props.has(propId)).toBe(false);
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      );
    } finally {
      doc.destroy();
    }
  });
});
