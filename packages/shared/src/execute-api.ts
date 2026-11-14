import { RecordSchema } from "./record.schema";
import { Array, DateTime, Effect, Option, Result, Schema, Stream } from "effect";
import { nanoid } from "nanoid";
import * as Y from "yjs";
import { initProseMirrorDoc, updateYFragment } from "y-prosemirror";
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

export const CreateOp = Schema.Union([AppendOp, DateOp, ExecuteProps.SetOp]);

export type CreateOp = typeof CreateOp.Type;

export const UpdateOp = Schema.Union([CreateOp, ReplaceOp, ExecuteProps.ClearOp]);

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
    id: RecordSchema.Id | undefined,
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

        // Date stays separate; body and props share the Yjs update.
        const resolved = yield* resolveOps(ops);
        const date = Option.filter(resolved.date, (date) => date !== record.date);

        // Match the same backlink labels shown in exported Markdown.
        const update = yield* createUpdate({
          recordId: id,
          snapshot: record.materializedYUpdate,
          body: resolved.body,
          prop: resolved.prop,
          backlinkLabels: BacklinkLabels.buildCache(backlinks),
        });

        // Body/date no-ops are skipped; requested prop operations produce an update.
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
    requestedId: RecordSchema.Id | undefined,
    ops: readonly CreateOp[],
  ) {
    const id = yield* Schema.decodeUnknownEffect(RecordSchema.CreateId)(requestedId ?? nanoid());

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
          body: resolved.body,
          prop: resolved.prop,
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
    createRecord: (id, ops, signal) => {
      return Effect.runPromise(
        createRecord(id, ops).pipe(Effect.provideService(Attrs.Service, attrs)),
        { signal },
      );
    },
  } satisfies Api;
});

const resolveOps = Effect.fn("ExecuteApi.resolveOps")(function* (ops: readonly UpdateOp[]) {
  const [dates, remaining] = Array.partition(ops, (op) => {
    if (op.kind === "date.set") return Result.succeed(op.date);

    return Result.fail(op);
  });

  const [prop, body] = Array.partition(remaining, (op) => {
    if (op.kind === "prop.set" || op.kind === "prop.clear") return Result.succeed(op);

    return Result.fail(op);
  });

  const date = yield* Effect.succeed(Array.last(dates)).pipe(
    EffectOption.traverse(Schema.decodeUnknownEffect(PlainDateString)),
  );

  return { date, body, prop };
});

const createInitialUpdate = Effect.fn("ExecuteApi.createInitialUpdate")(function* (opts: {
  readonly recordId: RecordSchema.Id;
  readonly body: readonly EditDocument.Edit[];
  readonly prop: readonly ExecuteProps.Op[];
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

  for (const op of opts.prop) {
    yield* ExecuteProps.apply({ doc: yDoc, recordId: opts.recordId, op });
  }

  return Y.encodeStateAsUpdate(yDoc);
}, Effect.scoped);

const createUpdate = Effect.fn("ExecuteApi.createUpdate")(function* (opts: {
  readonly recordId: RecordSchema.Id;
  readonly snapshot: RecordRepo.MaterializedYUpdate;
  readonly body: readonly EditDocument.Edit[];
  readonly prop: readonly ExecuteProps.Op[];
  readonly backlinkLabels: ReadonlyMap<RecordSchema.Id, string>;
}) {
  if (opts.body.length === 0 && opts.prop.length === 0) return null;

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

  // Preserve body-only no-op handling; requested prop operations still run.
  if (!bodyChanged && opts.prop.length === 0) return null;

  const stateVector = Y.encodeStateVector(yDoc);

  if (bodyChanged) updateYFragment(yDoc, fragment, updated, meta);

  for (const op of opts.prop) {
    yield* ExecuteProps.apply({ doc: yDoc, recordId: opts.recordId, op });
  }

  return Y.encodeStateAsUpdate(yDoc, stateVector);
}, Effect.scoped);

export * as ExecuteApi from "./execute-api.ts";
