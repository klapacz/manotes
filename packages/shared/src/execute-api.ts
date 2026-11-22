import { RecordSchema } from "./record.schema";
import { Array, DateTime, Effect, Match, Option, Record, Result, Schema, Stream } from "effect";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import { initProseMirrorDoc, updateYFragment } from "y-prosemirror";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { EventRepo } from "./event.repo";
import { EventSchema } from "./event.schema";
import { PlainDateString } from "./temporal.schema";
import { toLocalDateString } from "./temporal/utils";
import { Materializer } from "./materializer.service";
import { RecordRepo } from "./record.repo";
import { RECORD_SCHEMA } from "./prosemirror/app-schema";
import { getProsemirrorXmlFragment } from "./prosemirror/yjs";
import { EditDocument } from "./edit-document";
import { BacklinkLabels } from "./backlink-labels";
import { CliList } from "./list";
import { PropDef } from "./prop-def.service";
import { PropRecordRepo } from "./prop-record.repo";
import { RuleRecord } from "./rule-record.service";
import { Attrs } from "./attrs.service";
import { ExecuteProps } from "./execute-props";
import { EffectOption } from "./effect/effect-option";

const CreateNoteInit = Schema.TaggedStruct("note", {
  id: Schema.optionalKey(RecordSchema.Id),
});

const CreatePresetInit = Schema.TaggedStruct("preset", {
  id: Schema.optionalKey(RecordSchema.Id),
  preset_filter: AttrsSchema.Filter,
  preset_default: Schema.optionalKey(Schema.Boolean),
});

const CreatePropInit = Schema.Union([
  createPropInit(AttrsSchema.PropVal.cases.text),
  createPropInit(AttrsSchema.PropVal.cases.number),
  createPropInit(AttrsSchema.PropVal.cases.bool),
  createPropInit(AttrsSchema.PropVal.cases.enum),
  createPropInit(AttrsSchema.PropVal.cases.link).mapFields((fields) => ({
    ...fields,
    prop_targets: Schema.optionalKey(AttrsSchema.TargetFilter),
  })),
]).pipe(Schema.toTaggedUnion("prop_type"));

const CreateRuleInit = Schema.TaggedStruct("rule", {
  id: Schema.optionalKey(RecordSchema.Id),
  rule_targets: AttrsSchema.TargetFilter,
  rule_storage: Schema.optionalKey(AttrsSchema.RuleStorage),
  rule_expects: Schema.optionalKey(Schema.Record(RecordSchema.Id, AttrsSchema.RuleExpectation)),
});

const CreateOwnedInit = Schema.TaggedStruct("owned", {
  id: Schema.optionalKey(RecordSchema.Id),
  owned_type: Schema.Literal("enum_option"),
  owned_parent: RecordSchema.Id,
});

export const CreateInit = Schema.Union([
  CreateNoteInit,
  CreatePresetInit,
  CreatePropInit,
  CreateRuleInit,
  CreateOwnedInit,
]);

export type CreateInit = typeof CreateInit.Type;

const AppendOp = Schema.Struct({
  kind: Schema.Literal("body.append"),
  markdown: Schema.String,
});

const DateOp = Schema.Struct({
  kind: Schema.Literal("date.set"),
  date: Schema.String,
});

const ReplaceOp = Schema.Struct({
  kind: Schema.Literal("body.replace"),
  text: Schema.String,
  with: Schema.String,
  occurrence: Schema.optionalKey(
    Schema.Union([Schema.Literal("all"), Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))]),
  ),
});

const PresetFilterSetOp = Schema.Struct({
  kind: Schema.Literal("preset_filter.set"),
  value: AttrsSchema.Filter,
});

const PresetDefaultSetOp = Schema.Struct({
  kind: Schema.Literal("preset_default.set"),
  value: Schema.Boolean,
});

const PropTypeSetOp = Schema.Struct({
  kind: Schema.Literal("prop_type.set"),
  value: AttrsSchema.PropValTag,
});

const PropDefaultSetOp = Schema.Struct({
  kind: Schema.Literal("prop_default.set"),
  value: AttrsSchema.PropVal,
});

const PropDefaultClearOp = Schema.Struct({
  kind: Schema.Literal("prop_default.clear"),
});

const PropTargetsSetOp = Schema.Struct({
  kind: Schema.Literal("prop_targets.set"),
  value: AttrsSchema.TargetFilter,
});

const PropTargetsClearOp = Schema.Struct({
  kind: Schema.Literal("prop_targets.clear"),
});

const RuleStorageSetOp = Schema.Struct({
  kind: Schema.Literal("rule_storage.set"),
  value: AttrsSchema.RuleStorage,
});

const RuleTargetsSetOp = Schema.Struct({
  kind: Schema.Literal("rule_targets.set"),
  value: AttrsSchema.TargetFilter,
});

const RuleExpectsSetOp = Schema.Struct({
  kind: Schema.Literal("rule_expects.set"),
  propId: RecordSchema.Id,
  value: AttrsSchema.RuleExpectation,
});

const RuleExpectsClearOp = Schema.Struct({
  kind: Schema.Literal("rule_expects.clear"),
  propId: RecordSchema.Id,
});

const AttrEditOp = Schema.Union([
  PresetFilterSetOp,
  PresetDefaultSetOp,
  PropTypeSetOp,
  PropDefaultSetOp,
  PropDefaultClearOp,
  PropTargetsSetOp,
  PropTargetsClearOp,
  RuleStorageSetOp,
  RuleTargetsSetOp,
  RuleExpectsSetOp,
  RuleExpectsClearOp,
]);

type AttrOp = ExecuteProps.Op | typeof AttrEditOp.Type;

export const CreateOp = Schema.Union([AppendOp, DateOp, ExecuteProps.SetOp]);

export type CreateOp = typeof CreateOp.Type;

export const UpdateOp = Schema.Union([CreateOp, ReplaceOp, ExecuteProps.ClearOp, AttrEditOp]);

export type UpdateOp = typeof UpdateOp.Type;

export type Api = {
  readonly list: (
    options?: RecordRepo.ListOpts,
    signal?: AbortSignal,
  ) => Promise<ReadonlyArray<CliList.Item>>;
  readonly listProps: (signal?: AbortSignal) => Promise<readonly PropRecordRepo.Def[]>;
  readonly editRecord: (
    id: RecordSchema.Id,
    ops: readonly UpdateOp[],
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly createRecord: (
    init: CreateInit,
    ops: readonly CreateOp[],
    signal?: AbortSignal,
  ) => Promise<RecordSchema.Id>;
};

export const makeApi = Effect.fn("ExecuteApi.makeApi")(function* () {
  const db = yield* DB.Service;
  const recordRepo = yield* RecordRepo.Service;
  const eventRepo = yield* EventRepo.Service;
  const materializer = yield* Materializer.Service;
  const defs = yield* PropDef.Service;
  const ruleRecords = yield* RuleRecord.Service;
  const attrs = yield* Attrs.Service;

  const listProps = Effect.fn("ExecuteApi.listProps")(function* () {
    yield* materializer.catchUp();

    return yield* defs
      .reactiveDefs()
      .pipe(Effect.flatMap(Stream.runHead), Effect.flatMap(Effect.fromOption));
  });

  const editRecord = Effect.fn("ExecuteApi.editRecord")(function* (
    id: RecordSchema.Id,
    ops: readonly UpdateOp[],
  ) {
    // Read, edit, and save in one SQLite transaction. A concurrent writer cannot
    // slip between a separate stale check and the insert; a lock conflict fails.
    yield* db.transaction(
      Effect.gen(function* () {
        // Include events left by an interrupted command before taking the snapshot.
        yield* materializer.materializeRecordUpTo({
          recordId: id,
          upToLocalSeq: yield* eventRepo.getMaxLocalSeq(),
        });
        const found = yield* recordRepo.findByIdWithBacklinks(id);

        if (Option.isNone(found)) return yield* Effect.fail(new Error(`Record not found: ${id}`));
        const { record, backlinks } = found.value;

        // Date stays separate; body and attrs share the Yjs update.
        const resolved = yield* resolveOps(ops);
        const date = Option.filter(resolved.date, (date) => date !== record.date);

        // Match the same backlink labels shown in exported Markdown.
        const update = yield* createUpdate({
          recordId: id,
          snapshot: record.materializedYUpdate,
          body: resolved.body,
          attr: resolved.attr,
          backlinkLabels: BacklinkLabels.buildCache(backlinks),
        });

        // Body/date no-ops are skipped; requested attr operations produce an update.
        if (update === null && Option.isNone(date)) return;

        const createdAt = yield* DateTime.now;
        let upToLocalSeq = record.lastEventLocalSeq;

        if (update !== null) {
          const event = yield* eventRepo.create({
            recordId: id,
            type: "update",
            payload: update,
            createdAt,
          });

          upToLocalSeq = event.localSeq;
        }

        if (Option.isSome(date)) {
          const event = yield* eventRepo.create({
            recordId: id,
            type: "date",
            payload: yield* EventSchema.encodeDatePayload({ date: date.value }),
            createdAt,
          });

          upToLocalSeq = event.localSeq;
        }

        // Reuse production derivation for body, attrs, and backlinks.
        // The next editRecord call sees this update even before Markdown is written.
        yield* materializer.materializeRecordUpTo({ recordId: id, upToLocalSeq });
      }),
    );
  });

  const createRecord = Effect.fn("ExecuteApi.createRecord")(function* (
    init: CreateInit,
    ops: readonly CreateOp[],
  ) {
    const id = yield* Schema.decodeEffect(RecordSchema.CreateId)(init.id ?? nanoid());

    return yield* db.transaction(
      Effect.gen(function* () {
        // An existing record may still be represented only by unmaterialized events.
        yield* materializer.materializeRecordUpTo({
          recordId: id,
          upToLocalSeq: yield* eventRepo.getMaxLocalSeq(),
        });
        const existing = yield* recordRepo.findById(id);

        if (Option.isSome(existing)) {
          return yield* Effect.fail(new Error(`Record already exists: ${id}`));
        }

        const resolved = yield* resolveOps(ops);

        const update = yield* createInitialUpdate({
          recordId: id,
          init,
          body: resolved.body,
          attr: resolved.attr,
        });

        const createdAt = yield* DateTime.now;
        yield* eventRepo.create({ recordId: id, type: "update", payload: update, createdAt });

        const date = Option.getOrElse(resolved.date, () => toLocalDateString(createdAt));

        const event = yield* eventRepo.create({
          recordId: id,
          type: "date",
          payload: yield* EventSchema.encodeDatePayload({ date }),
          createdAt,
        });

        yield* materializer.materializeRecordUpTo({ recordId: id, upToLocalSeq: event.localSeq });

        return id;
      }),
    );
  });

  return {
    list: (options?: RecordRepo.ListOpts, signal?: AbortSignal) => {
      return Effect.runPromise(
        materializer
          .catchUp()
          .pipe(
            Effect.andThen(CliList.list(options)),
            Effect.provideService(RecordRepo.Service, recordRepo),
            Effect.provideService(PropDef.Service, defs),
            Effect.provideService(RuleRecord.Service, ruleRecords),
          ),
        { signal },
      );
    },
    listProps: (signal?: AbortSignal) => Effect.runPromise(listProps(), { signal }),
    editRecord: (id, ops, signal) => {
      return Effect.runPromise(
        editRecord(id, ops).pipe(Effect.provideService(Attrs.Service, attrs)),
        { signal },
      );
    },
    createRecord: (init, ops, signal) => {
      return Effect.runPromise(
        createRecord(init, ops).pipe(Effect.provideService(Attrs.Service, attrs)),
        { signal },
      );
    },
  } satisfies Api;
});

function createPropInit<
  const Tag extends AttrsSchema.PropValTag,
  const Value extends Schema.Constraint,
>(value: Schema.TaggedStruct<Tag, { readonly val: Value }>) {
  return Schema.TaggedStruct("prop", {
    id: Schema.optionalKey(RecordSchema.Id),
    prop_type: value.fields._tag,
    prop_default: Schema.optionalKey(value),
    prop_targets: Schema.optionalKey(Schema.Never),
  });
}

const resolveOps = Effect.fn("ExecuteApi.resolveOps")(function* (ops: readonly UpdateOp[]) {
  const [dates, remaining] = Array.partition(ops, (op) => {
    if (op.kind === "date.set") return Result.succeed(op.date);

    return Result.fail(op);
  });

  const [body, attr] = Array.partition(remaining, (op) => {
    if (op.kind === "body.append" || op.kind === "body.replace") return Result.succeed(op);

    return Result.fail(op);
  });

  const date = yield* Effect.succeed(Array.last(dates)).pipe(
    EffectOption.traverse(Schema.decodeUnknownEffect(PlainDateString)),
  );

  return { date, body, attr };
});

const initializeAttrs = Effect.fn("ExecuteApi.initializeAttrs")(function* (opts: {
  readonly doc: Y.Doc;
  readonly init: CreateInit;
}) {
  const attrs = yield* Attrs.Service;

  yield* Match.value(opts.init).pipe(
    Match.tag("note", () => Effect.void),
    Match.tag("preset", (init) => {
      return Effect.gen(function* () {
        yield* attrs.initializePreset({ doc: opts.doc, filter: init.preset_filter });

        if (init.preset_default !== undefined) {
          yield* attrs.setPresetDefault({ doc: opts.doc, value: init.preset_default });
        }
      });
    }),
    Match.tag("prop", (init) => {
      return Effect.gen(function* () {
        yield* attrs.initializeProp({
          doc: opts.doc,
          type: init.prop_type,
          defaultValue: init.prop_default,
        });

        if (init.prop_type === "link" && init.prop_targets !== undefined) {
          yield* attrs.setPropTargets({ doc: opts.doc, targets: init.prop_targets });
        }
      });
    }),
    Match.tag("rule", (init) => {
      return Effect.gen(function* () {
        yield* attrs.initializeRule({ doc: opts.doc, targets: init.rule_targets });

        if (init.rule_storage !== undefined) {
          yield* attrs.setRuleStorage({ doc: opts.doc, storage: init.rule_storage });
        }

        if (init.rule_expects !== undefined) {
          for (const [propId, value] of Record.toEntries(init.rule_expects)) {
            yield* attrs.setRuleExpectation({
              doc: opts.doc,
              propId: RecordSchema.Id.make(propId),
              value,
            });
          }
        }
      });
    }),
    Match.tag("owned", (init) => {
      return attrs.initializeEnumOption({ doc: opts.doc, enum_parent: init.owned_parent });
    }),
    Match.exhaustive,
  );
});

const applyAttrOp = Effect.fn("ExecuteApi.applyAttrOp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly recordId: RecordSchema.Id;
  readonly op: AttrOp;
}) {
  const attrs = yield* Attrs.Service;

  yield* Match.value(opts.op).pipe(
    Match.when({ kind: "prop.set" }, (op) => {
      return ExecuteProps.apply({ doc: opts.doc, recordId: opts.recordId, op });
    }),
    Match.when({ kind: "prop.clear" }, (op) => {
      return ExecuteProps.apply({ doc: opts.doc, recordId: opts.recordId, op });
    }),
    Match.when({ kind: "preset_filter.set" }, (op) => {
      return attrs.setPresetFilter({ doc: opts.doc, filter: op.value });
    }),
    Match.when({ kind: "preset_default.set" }, (op) => {
      return attrs.setPresetDefault({ doc: opts.doc, value: op.value });
    }),
    Match.when({ kind: "prop_type.set" }, (op) => {
      return attrs.setPropType({ doc: opts.doc, type: op.value });
    }),
    Match.when({ kind: "prop_default.set" }, (op) => {
      return attrs.setPropDefault({ doc: opts.doc, value: op.value });
    }),
    Match.when({ kind: "prop_default.clear" }, () => {
      return attrs.clearPropDefault({ doc: opts.doc });
    }),
    Match.when({ kind: "prop_targets.set" }, (op) => {
      return attrs.setPropTargets({ doc: opts.doc, targets: op.value });
    }),
    Match.when({ kind: "prop_targets.clear" }, () => {
      return attrs.setPropTargets({ doc: opts.doc, targets: undefined });
    }),
    Match.when({ kind: "rule_storage.set" }, (op) => {
      return attrs.setRuleStorage({ doc: opts.doc, storage: op.value });
    }),
    Match.when({ kind: "rule_targets.set" }, (op) => {
      return attrs.setRuleTargets({ doc: opts.doc, targets: op.value });
    }),
    Match.when({ kind: "rule_expects.set" }, (op) => {
      return attrs.setRuleExpectation({ doc: opts.doc, propId: op.propId, value: op.value });
    }),
    Match.when({ kind: "rule_expects.clear" }, (op) => {
      return attrs.clearRuleExpectation({ doc: opts.doc, propId: op.propId });
    }),
    Match.exhaustive,
  );
});

const createInitialUpdate = Effect.fn("ExecuteApi.createInitialUpdate")(function* (opts: {
  readonly recordId: RecordSchema.Id;
  readonly init: CreateInit;
  readonly body: readonly EditDocument.Edit[];
  readonly attr: readonly AttrOp[];
}) {
  // Creation must persist the empty paragraph too; a date event alone has no body.
  const doc = yield* Effect.try({
    try: () => {
      return EditDocument.apply(
        RECORD_SCHEMA.node("doc", null, [RECORD_SCHEMA.node("paragraph")]),
        opts.body,
      );
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

  const yDoc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (yDoc) => Effect.sync(() => yDoc.destroy()),
  );

  const fragment = getProsemirrorXmlFragment(yDoc);
  const { meta } = initProseMirrorDoc(fragment, RECORD_SCHEMA);
  updateYFragment(yDoc, fragment, doc, meta);

  yield* initializeAttrs({ doc: yDoc, init: opts.init });

  for (const op of opts.attr) {
    yield* applyAttrOp({ doc: yDoc, recordId: opts.recordId, op });
  }

  return Y.encodeStateAsUpdate(yDoc);
}, Effect.scoped);

const createUpdate = Effect.fn("ExecuteApi.createUpdate")(function* (opts: {
  readonly recordId: RecordSchema.Id;
  readonly snapshot: RecordRepo.MaterializedYUpdate;
  readonly body: readonly EditDocument.Edit[];
  readonly attr: readonly AttrOp[];
  readonly backlinkLabels: ReadonlyMap<RecordSchema.Id, string>;
}) {
  if (opts.body.length === 0 && opts.attr.length === 0) return null;

  // Only encoded bytes leave this scope; the private Yjs document is destroyed
  // before the caller persists any events, including when editing fails.
  const yDoc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (yDoc) => Effect.sync(() => yDoc.destroy()),
  );

  if (opts.snapshot !== null) Y.applyUpdate(yDoc, opts.snapshot);
  const fragment = getProsemirrorXmlFragment(yDoc);
  const { doc, meta } = initProseMirrorDoc(fragment, RECORD_SCHEMA);

  const updated = yield* Effect.try({
    try: () => {
      return EditDocument.apply(doc, opts.body, {
        backlinkLabel: (id) => opts.backlinkLabels.get(id),
      });
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

  const bodyChanged = !updated.eq(doc);

  // Preserve body-only no-op handling; requested attr operations still run.
  if (!bodyChanged && opts.attr.length === 0) return null;

  const stateVector = Y.encodeStateVector(yDoc);

  if (bodyChanged) updateYFragment(yDoc, fragment, updated, meta);

  for (const op of opts.attr) {
    yield* applyAttrOp({ doc: yDoc, recordId: opts.recordId, op });
  }

  return Y.encodeStateAsUpdate(yDoc, stateVector);
}, Effect.scoped);

export * as ExecuteApi from "./execute-api.ts";
