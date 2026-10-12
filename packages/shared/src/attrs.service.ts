import { Context, Data, Effect, Layer, Option, Queue, Schema, Stream } from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { NoteDoc } from "./note/doc";
import { PropRecordRepo } from "./prop-record.repo";
import { YSchema } from "./y-schema";
import { EffectOption } from "./effect/effect-option";
import { LibOption } from "./effect/option";

export type ValueState<V, I = V> = Data.TaggedEnum<{
  Unset: {};
  Valid: { readonly value: V };
  Invalid: { readonly value?: I };
}>;

export const ValueState = Data.taggedEnum<ValueStateCases>();

interface ValueStateCases extends Data.TaggedEnum.WithGenerics<2> {
  readonly taggedEnum: ValueState<this["A"], this["B"]>;
}

type ValByTag = {
  [K in AttrsSchema.PropValTag]: (typeof AttrsSchema.PropVal.cases)[K]["Type"];
};

export type Entry<Tag extends AttrsSchema.PropValTag = AttrsSchema.PropValTag> = {
  [K in Tag]: {
    readonly def: PropRecordRepo.Def<K>;
    readonly value: ValueState<ValByTag[K], AttrsSchema.PropVal>;
  };
}[Tag];

export class Service extends Context.Service<Service>()("Attrs.Service", {
  make: Effect.sync(() => ({
    initializeProp,
    initializeEnumOption,
    watch,
    watchProps,
    setProp,
    clearProp,
    setPropType,
    setPropDefault,
    clearPropDefault,
  })),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export class SelfAssignmentError extends Data.TaggedError("Attrs.SelfAssignmentError")<{
  readonly propId: AttrsSchema.NoteId;
}> {}

function watch(opts: { readonly doc: Y.Doc }) {
  const { attrs } = NoteDoc.fromDoc(opts);

  return changes(opts.doc).pipe(
    Stream.mapEffect(() =>
      YSchema.exportLoose(attrs).pipe(Effect.map((attrs) => ({ doc: opts.doc, attrs }))),
    ),
  );
}

function watchProps<E, R>(opts: {
  readonly doc: Y.Doc;
  readonly defs: Stream.Stream<readonly PropRecordRepo.Def[], E, R>;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });

  return Stream.zipLatestWith(opts.defs, changes(opts.doc), (defs) => defs).pipe(
    Stream.mapEffect((defs) =>
      Effect.gen(function* () {
        const props = yield* attrs.pipe(YSchema.findMap("props"));

        return yield* Effect.forEach(defs, (def) => readEntry({ props, def }));
      }),
    ),
  );
}

function changes(doc: Y.Doc) {
  const map = doc.getMap("attrs");

  return Stream.callback<void>((queue) => {
    const emit = () => Queue.offerUnsafe(queue, undefined);

    return Effect.acquireRelease(
      Effect.sync(() => {
        map.observeDeep(emit);
        emit();
      }),
      () => Effect.sync(() => map.unobserveDeep(emit)).pipe(Effect.andThen(Queue.end(queue))),
    );
  });
}

const readEntry = Effect.fn("Attrs.readEntry")(function* <K extends AttrsSchema.PropValTag>(opts: {
  readonly props: Option.Option<
    YSchema.Cursor<typeof AttrsSchema.Props.Type, typeof AttrsSchema.Props>
  >;
  readonly def: PropRecordRepo.Def<K>;
}): Effect.fn.Return<Entry<K>> {
  const decode = Schema.decodeEffect(getPropValSchema(opts.def.prop_type));

  const state: ValueState<ValByTag[K], AttrsSchema.PropVal> = yield* opts.props.pipe(
    LibOption.mapEffect(YSchema.find({ propId: opts.def.id })),
    Effect.map(Option.flatten),
    EffectOption.traverse((selection) => {
      return decode(selection.value).pipe(
        Effect.map((value) => ValueState.Valid({ value })),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed(ValueState.Invalid({ value: selection.value })),
        ),
      );
    }),
    Effect.map(Option.getOrElse(() => ValueState.Unset())),
    Effect.catchTag("YSchemaError", () =>
      Effect.succeed(ValueState.Invalid<never, AttrsSchema.PropVal>({})),
    ),
  );

  return { def: opts.def, value: state } satisfies Entry<K>;
});

const getPropValSchema = <K extends AttrsSchema.PropValTag>(prop_type: K) => {
  const cases: {
    readonly [Tag in AttrsSchema.PropValTag]: Schema.ConstraintDecoder<ValByTag[Tag]>;
  } = AttrsSchema.PropVal.cases;

  const schema: Schema.ConstraintDecoder<ValByTag[K]> = cases[prop_type];

  return schema;
};

const setProp = Effect.fn("Attrs.setProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly recordId: AttrsSchema.NoteId;
  readonly propId: AttrsSchema.NoteId;
  readonly value: AttrsSchema.PropVal;
}) {
  if (opts.recordId === opts.propId) {
    return yield* Effect.fail(new SelfAssignmentError({ propId: opts.propId }));
  }

  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const props = yield* attrs.pipe(YSchema.upsertMap("props"));
  yield* props.pipe(YSchema.set({ propId: opts.propId }, opts.value));
});

const clearProp = Effect.fn("Attrs.clearProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly propId: AttrsSchema.NoteId;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const props = yield* attrs.pipe(YSchema.findMap("props"));

  if (Option.isSome(props)) {
    yield* props.value.pipe(YSchema.clear({ propId: opts.propId }));
  }
});

const initializeProp = Effect.fn("Attrs.initializeProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly defaultValue?: AttrsSchema.PropVal;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const prop = yield* attrs.pipe(YSchema.set("_tag", "prop"));
  yield* prop.pipe(YSchema.set("prop_type", opts.defaultValue?._tag ?? "bool"));

  if (opts.defaultValue !== undefined) {
    yield* prop.pipe(YSchema.set("prop_default", opts.defaultValue));
  }

  yield* prop.pipe(YSchema.upsertMap("props"));
});

const initializeEnumOption = Effect.fn("Attrs.initializeEnumOption")(function* (opts: {
  readonly doc: Y.Doc;
  readonly enum_parent: AttrsSchema.NoteId;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const owned = yield* attrs.pipe(YSchema.set("_tag", "owned"));
  yield* owned.pipe(YSchema.set("owned_type", "enum_option"));
  yield* owned.pipe(YSchema.set("owned_parent", opts.enum_parent));
  yield* owned.pipe(YSchema.upsertMap("props"));
});

const setPropDefault = Effect.fn("Attrs.setPropDefault")(function* (opts: {
  readonly doc: Y.Doc;
  readonly value: AttrsSchema.PropVal;
}) {
  const prop = yield* editablePropAttrs({ doc: opts.doc });
  yield* prop.pipe(YSchema.set("prop_default", opts.value));
});

const setPropType = Effect.fn("Attrs.setPropType")(function* (opts: {
  readonly doc: Y.Doc;
  readonly type: AttrsSchema.PropValTag;
}) {
  const prop = yield* editablePropAttrs({ doc: opts.doc });
  // Changing the definition never converts or removes defaults or assignments.
  yield* prop.pipe(YSchema.set("prop_type", opts.type));
});

const clearPropDefault = Effect.fn("Attrs.clearPropDefault")(function* (opts: {
  readonly doc: Y.Doc;
}) {
  const prop = yield* editablePropAttrs(opts);
  yield* prop.pipe(YSchema.clear("prop_default"));
});

const editablePropAttrs = Effect.fn("Attrs.editablePropAttrs")(function* (opts: {
  readonly doc: Y.Doc;
}) {
  const { attrs } = NoteDoc.fromDoc(opts);

  return yield* attrs.pipe(
    YSchema.find("_tag"),
    Effect.flatMap(Effect.fromOption),
    Effect.flatMap(YSchema.expect("prop")),
  );
});

export * as Attrs from "./attrs.service";
