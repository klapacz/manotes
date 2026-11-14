import { RecordSchema } from "./record.schema";
import { Array, DateTime, Effect, flow, Option, Schema, Stream } from "effect";
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

export type UpdateOp = EditDocument.Edit | { readonly kind: "date.set"; readonly date: string };

export type CreateOp = Extract<UpdateOp, { readonly kind: "body.append" | "date.set" }>;

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

        // Resolve metadata separately; only body edits go through Yjs.
        const resolved = yield* resolveOps(ops);
        const date = Option.filter(resolved.date, (date) => date !== record.date);

        // Match the same backlink labels shown in exported Markdown.
        const bodyUpdate = yield* createBodyUpdate(
          record.materializedYUpdate,
          resolved.bodyEdits,
          BacklinkLabels.buildCache(backlinks),
        );

        // No effective change means no events and no updated-at change.
        if (bodyUpdate === null && Option.isNone(date)) return;

        const createdAt = yield* DateTime.now;
        let upToLocalSeq = record.lastEventLocalSeq;

        if (bodyUpdate !== null) {
          const event = yield* eventRepo.create({
            recordId: id,
            type: "update",
            payload: bodyUpdate,
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

        // Reuse production derivation for content, title, text, and backlinks.
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

    // Scripts can be plain JavaScript, so enforce the narrower creation API at runtime too.
    if (ops.some((op) => op.kind !== "body.append" && op.kind !== "date.set")) {
      return yield* Effect.fail(
        new Error("createRecord only accepts body.append and date.set ops"),
      );
    }

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
        const bodyUpdate = yield* createInitialUpdate(resolved.bodyEdits);
        const createdAt = yield* DateTime.now;
        yield* eventRepo.create({ recordId: id, type: "update", payload: bodyUpdate, createdAt });

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
    editRecord: (id, ops, signal) => Effect.runPromise(editRecord(id, ops), { signal }),
    createRecord: (id, ops, signal) => Effect.runPromise(createRecord(id, ops), { signal }),
  } satisfies Api;
});

const resolveOps = Effect.fn("ExecuteApi.resolveOps")(function* (ops: readonly UpdateOp[]) {
  const date = yield* Array.findLast(ops, (op) => op.kind === "date.set").pipe(
    Option.map((op) => op.date),
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: flow(Schema.decodeUnknownEffect(PlainDateString), Effect.asSome),
    }),
  );

  const bodyEdits = Array.filter(ops, (op) => op.kind !== "date.set");

  return { date, bodyEdits };
});

const createInitialUpdate = Effect.fn("ExecuteApi.createInitialUpdate")(function* (
  edits: readonly EditDocument.Edit[],
) {
  // Creation must persist the empty paragraph too; a date event alone has no body.
  const doc = yield* Effect.try({
    try: () => {
      return EditDocument.apply(
        RECORD_SCHEMA.node("doc", null, [RECORD_SCHEMA.node("paragraph")]),
        edits,
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

  return Y.encodeStateAsUpdate(yDoc);
}, Effect.scoped);

const createBodyUpdate = Effect.fn("ExecuteApi.createBodyUpdate")(function* (
  snapshot: Uint8Array<ArrayBufferLike> | null,
  edits: readonly EditDocument.Edit[],
  labels: ReadonlyMap<RecordSchema.Id, string>,
) {
  if (edits.length === 0) return null;

  // Only encoded bytes leave this scope; the private Yjs document is destroyed
  // before the caller persists any events, including when editing fails.
  const yDoc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (yDoc) => Effect.sync(() => yDoc.destroy()),
  );

  if (snapshot !== null) Y.applyUpdate(yDoc, snapshot);
  const fragment = getProsemirrorXmlFragment(yDoc);
  const { doc, meta } = initProseMirrorDoc(fragment, RECORD_SCHEMA);

  const updated = yield* Effect.try({
    try: () => EditDocument.apply(doc, edits, { backlinkLabel: (id) => labels.get(id) }),
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  });

  // Empty Yjs updates still have bytes. Document equality also catches edits
  // that cancel each other out.
  if (updated.eq(doc)) return null;

  const stateVector = Y.encodeStateVector(yDoc);
  updateYFragment(yDoc, fragment, updated, meta);

  return Y.encodeStateAsUpdate(yDoc, stateVector);
}, Effect.scoped);

export * as ExecuteApi from "./execute-api.ts";
