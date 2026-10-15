import {
  Context,
  Data,
  Effect,
  Layer,
  Match,
  Option,
  Predicate,
  Queue,
  Record,
  Result,
  Schema,
  Stream,
  pipe,
} from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { NoteDoc } from "./note/doc";
import { PropRecordRepo } from "./prop-record.repo";
import { YSchema } from "./y-schema";
import { EffectOption } from "./effect/effect-option";
import { LibOption } from "./effect/option";
import { EffectStream } from "./effect/stream";
import { PropValidation } from "./prop-validation";

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

export type Defs = Readonly<Record<AttrsSchema.NoteId, PropRecordRepo.Def>>;

type SavedValues = {
  readonly top: Readonly<Record<AttrsSchema.NoteId, AttrsSchema.PropVal>>;
  readonly groups: Readonly<
    Record<AttrsSchema.NoteId, Readonly<Record<AttrsSchema.NoteId, AttrsSchema.PropVal>>>
  >;
};

export class Service extends Context.Service<Service>()("Attrs.Service", {
  make: Effect.sync(() => ({
    initializeProp,
    initializeEnumOption,
    initializeRule,
    setRuleStorage,
    setRuleTargets,
    setRuleExpectation,
    clearRuleExpectation,
    watch,
    watchProps,
    watchGroups,
    setProp,
    clearProp,
    setGroupProp,
    clearGroupProp,
    setPropType,
    setPropDefault,
    clearPropDefault,
    setPropTargets,
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

function watchGroups<E, R>(opts: {
  readonly doc: Y.Doc;
  readonly defs: Stream.Stream<Defs, E, R>;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });

  // Re-read saved data when definitions or any nested attrs value change.
  return Stream.zipLatestWith(opts.defs, changes(opts.doc), (defs) => defs).pipe(
    Stream.mapEffect((defs) =>
      readGroups({ attrs }).pipe(Effect.map((saved) => ({ saved, defs }))),
    ),
    // Replace scope subscriptions using the newly read values and definitions.
    Stream.switchMap(({ saved, defs }) =>
      watchSavedGroups({ saved, defs }).pipe(Stream.map((saved) => ({ saved, defs }))),
    ),
  );
}

const readGroups = Effect.fn("Attrs.readGroups")(function* (opts: {
  readonly attrs: YSchema.Cursor<AttrsSchema.Attrs, typeof AttrsSchema.Attrs>;
}) {
  const [top, groups] = yield* opts.attrs.pipe(
    YSchema.exportLoose,
    Effect.map((attrs) => attrs.props ?? {}),
    Effect.map(Record.filter(Predicate.isNotUndefined)),
    // Split scalar values from saved rule groups through the existing loose schema.
    Effect.map(
      Record.partition((value: AttrsSchema.PropVal | AttrsSchema.PropGroup) =>
        Match.value(value).pipe(
          Match.tag("group", (group) => Result.succeed(group)),
          Match.orElse((value) => Result.fail(value)),
        ),
      ),
    ),
  );

  return { top, groups: Record.map(groups, (group) => group.props) };
});

function watchSavedGroups(opts: { readonly saved: SavedValues; readonly defs: Defs }) {
  return EffectStream.zipLatestRecord({
    top: watchSavedProps({ props: opts.saved.top, defs: opts.defs }),
    groups: pipe(
      opts.saved.groups,
      Record.map((props) => watchSavedProps({ props, defs: opts.defs })),
      EffectStream.zipLatestRecord,
    ),
  });
}

function watchSavedProps(opts: {
  readonly props: Readonly<Record<AttrsSchema.NoteId, AttrsSchema.PropVal>>;
  readonly defs: Defs;
}) {
  return pipe(
    opts.props,
    // Build validation streams under the same prop IDs as the saved values.
    Record.map((value, propId) => watchProp({ value, def: Record.get(opts.defs, propId) })),
    EffectStream.zipLatestRecord,
  );
}

function watchProp(opts: {
  readonly value: AttrsSchema.PropVal;
  readonly def: Option.Option<PropRecordRepo.Def>;
}) {
  return Match.value(opts.def).pipe(
    // Preserve a supported value when its definition is unavailable.
    Match.tag("None", () => Stream.succeed(ValueState.Invalid({ value: opts.value }))),
    Match.tag("Some", ({ value: def }) =>
      Stream.fromEffect(validateValueType({ value: opts.value, def })).pipe(
        Stream.flatMap((state) =>
          Match.value(def).pipe(
            Match.when({ prop_type: "link" }, (def) =>
              PropValidation.watch({ state, targets: def.prop_targets ?? undefined }),
            ),
            Match.orElse(() => Stream.succeed(state)),
          ),
        ),
      ),
    ),
    Match.exhaustive,
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
  const state: ValueState<ValByTag[K], AttrsSchema.PropVal> = yield* opts.props.pipe(
    LibOption.mapEffect(YSchema.find({ id: opts.def.id })),
    Effect.map(Option.flatten),
    EffectOption.traverse((selection) => {
      if (Predicate.isTagged(selection.value, "group")) {
        return Effect.succeed(ValueState.Invalid<never, AttrsSchema.PropVal>({}));
      }

      return validateValueType({ value: selection.value, def: opts.def });
    }),
    Effect.map(Option.getOrElse(() => ValueState.Unset())),
    Effect.catchTag("YSchemaError", () =>
      Effect.succeed(ValueState.Invalid<never, AttrsSchema.PropVal>({})),
    ),
  );

  return { def: opts.def, value: state } satisfies Entry<K>;
});

const validateValueType = Effect.fn("Attrs.validateValueType")(function* <
  K extends AttrsSchema.PropValTag,
>(opts: { readonly value: AttrsSchema.PropVal; readonly def: PropRecordRepo.Def<K> }) {
  const decode = Schema.decodeEffect(getPropValSchema(opts.def.prop_type));

  return yield* decode(opts.value).pipe(
    Effect.map((value) => ValueState.Valid({ value })),
    // Keep supported values that no longer match their definition's type.
    Effect.catchTag("SchemaError", () => Effect.succeed(ValueState.Invalid({ value: opts.value }))),
  );
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
  yield* props.pipe(YSchema.set({ id: opts.propId }, opts.value));
});

const clearProp = Effect.fn("Attrs.clearProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly propId: AttrsSchema.NoteId;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const props = yield* attrs.pipe(YSchema.findMap("props"));

  if (Option.isSome(props)) {
    yield* props.value.pipe(YSchema.clear({ id: opts.propId }));
  }
});

const setGroupProp = Effect.fn("Attrs.setGroupProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly recordId: AttrsSchema.NoteId;
  readonly ruleId: AttrsSchema.NoteId;
  readonly propId: AttrsSchema.NoteId;
  readonly value: AttrsSchema.PropVal;
}) {
  if (opts.recordId === opts.propId)
    return yield* Effect.fail(new SelfAssignmentError({ propId: opts.propId }));

  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const props = yield* attrs.pipe(YSchema.upsertMap("props"));

  // Fails if this key already holds a scalar.
  const group = yield* props.pipe(YSchema.upsertMap({ id: opts.ruleId }));
  const tagged = yield* group.pipe(YSchema.upsert("_tag", "group"));
  const values = yield* tagged.pipe(YSchema.upsertMap("props"));

  yield* values.pipe(YSchema.set({ propId: opts.propId }, opts.value));
});

const clearGroupProp = Effect.fn("Attrs.clearGroupProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly ruleId: AttrsSchema.NoteId;
  readonly propId: AttrsSchema.NoteId;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const props = yield* attrs.pipe(YSchema.findMap("props"));

  if (Option.isNone(props)) return;

  const group = yield* props.value.pipe(YSchema.findMap({ id: opts.ruleId }));

  if (Option.isNone(group)) return;

  const values = yield* group.value.pipe(YSchema.findMap("props"));

  if (Option.isNone(values)) return;

  yield* values.value.pipe(YSchema.clear({ propId: opts.propId }));
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

const setPropTargets = Effect.fn("Attrs.setPropTargets")(function* (opts: {
  readonly doc: Y.Doc;
  readonly targets: AttrsSchema.TargetFilter | undefined;
}) {
  const prop = yield* editablePropAttrs({ doc: opts.doc });

  const link = yield* prop.pipe(
    YSchema.find("prop_type"),
    Effect.flatMap(Effect.fromOption),
    Effect.flatMap(YSchema.expect("link")),
  );

  if (opts.targets === undefined) {
    return yield* link.pipe(YSchema.clear("prop_targets"));
  }

  yield* link.pipe(YSchema.set("prop_targets", opts.targets));
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

const initializeRule = Effect.fn("Attrs.initializeRule")(function* (opts: {
  readonly doc: Y.Doc;
  readonly targets: AttrsSchema.TargetFilter;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const rule = yield* attrs.pipe(YSchema.set("_tag", "rule"));
  yield* rule.pipe(YSchema.set("rule_storage", AttrsSchema.RuleStorage.cases.top.make({})));
  yield* rule.pipe(YSchema.set("rule_targets", opts.targets));
  yield* rule.pipe(YSchema.upsertMap("rule_expects"));
  yield* rule.pipe(YSchema.upsertMap("props"));
});

const setRuleStorage = Effect.fn("Attrs.setRuleStorage")(function* (opts: {
  readonly doc: Y.Doc;
  readonly storage: AttrsSchema.RuleStorage;
}) {
  const rule = yield* editableRuleAttrs({ doc: opts.doc });
  yield* rule.pipe(YSchema.set("rule_storage", opts.storage));
});

const setRuleTargets = Effect.fn("Attrs.setRuleTargets")(function* (opts: {
  readonly doc: Y.Doc;
  readonly targets: AttrsSchema.TargetFilter;
}) {
  const rule = yield* editableRuleAttrs({ doc: opts.doc });
  yield* rule.pipe(YSchema.set("rule_targets", opts.targets));
});

const setRuleExpectation = Effect.fn("Attrs.setRuleExpectation")(function* (opts: {
  readonly doc: Y.Doc;
  readonly propId: AttrsSchema.NoteId;
  readonly value: AttrsSchema.RuleExpectation;
}) {
  const rule = yield* editableRuleAttrs({ doc: opts.doc });
  const expects = yield* rule.pipe(YSchema.upsertMap("rule_expects"));
  yield* expects.pipe(YSchema.set({ propId: opts.propId }, opts.value));
});

const clearRuleExpectation = Effect.fn("Attrs.clearRuleExpectation")(function* (opts: {
  readonly doc: Y.Doc;
  readonly propId: AttrsSchema.NoteId;
}) {
  const rule = yield* editableRuleAttrs({ doc: opts.doc });
  const expects = yield* rule.pipe(YSchema.findMap("rule_expects"));

  if (Option.isSome(expects)) {
    yield* expects.value.pipe(YSchema.clear({ propId: opts.propId }));
  }
});

const editableRuleAttrs = Effect.fn("Attrs.editableRuleAttrs")(function* (opts: {
  readonly doc: Y.Doc;
}) {
  const { attrs } = NoteDoc.fromDoc(opts);

  return yield* attrs.pipe(
    YSchema.find("_tag"),
    Effect.flatMap(Effect.fromOption),
    Effect.flatMap(YSchema.expect("rule")),
  );
});

export * as Attrs from "./attrs.service";
