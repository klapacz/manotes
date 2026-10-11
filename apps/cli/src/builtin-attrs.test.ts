import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs.service";
import { DB } from "@manotes/shared/db.service";
import { Tables } from "@manotes/shared/db.tables";
import { EventRepo } from "@manotes/shared/event.repo";
import { CommittedEvent } from "@manotes/shared/graph-sync/contract/messages";
import * as GraphSyncContext from "@manotes/shared/graph-sync/context";
import * as GraphSyncEncryption from "@manotes/shared/graph-sync/encryption/service";
import * as GraphSyncEventLog from "@manotes/shared/graph-sync/event-log.service";
import * as Materializer from "@manotes/shared/materializer.service";
import { NoteRepo } from "@manotes/shared/note.repo";
import { NoteDoc } from "@manotes/shared/note/doc";
import { ProsemirrorEncode } from "@manotes/shared/prosemirror/encode";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { YSchema } from "@manotes/shared/y-schema";
import { DateTime, Effect, Layer, Option, Scope, Stream, Struct } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

const createdAt = DateTime.makeUnsafe("2026-10-11T09:00:00Z");

describe("Archived builtin", () => {
  it("lists properties independently of their title and excludes them from notes and pages", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;

          const { doc } = yield* Effect.acquireRelease(
            Effect.sync(() => NoteDoc.make()),
            ({ doc }) => Effect.sync(() => doc.destroy()),
          );

          yield* attrs.initializeProp({
            doc,
            builtin: false,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          ProsemirrorEncode.initializeDocument({ doc, content: [{ type: "paragraph" }] });
          yield* events.create({
            noteId: "untitled-prop",
            type: "update",
            createdAt,
            payload: Y.encodeStateAsUpdate(doc),
          });
          yield* materializer.catchUp();

          expect((yield* notes.getById("untitled-prop")).title).toBeNull();

          const properties = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({ type: "prop", sort: "updated" })).pipe(
              Stream.runHead,
            ),
          );

          expect(properties.map(({ id }) => id)).toEqual(["untitled-prop"]);

          for (const type of ["notes", "pages"] as const) {
            expect(
              Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({ type, sort: "date" })).pipe(
                  Stream.runHead,
                ),
              ),
            ).toEqual([]);
          }
        }).pipe(Effect.provide(Attrs.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("blocks using invalid definitions until their default is corrected", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;
          const definitions = yield* PropRecordRepo.Service;

          const makeDoc = () =>
            Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );

          const save = (id: AttrsSchema.NoteId, doc: Y.Doc) =>
            events
              .create({
                noteId: id,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));

          const propId = AttrsSchema.NoteId.make("hours");
          const prop = yield* makeDoc();
          yield* attrs.initializeProp({
            doc: prop.doc,
            builtin: false,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          yield* save(propId, prop.doc);

          for (const [id, value] of [
            ["unset", undefined],
            ["old-value", AttrsSchema.PropVal.cases.bool.make({ val: false })],
            ["number", AttrsSchema.PropVal.cases.number.make({ val: 7.5 })],
          ] as const) {
            const note = yield* makeDoc();
            const recordId = AttrsSchema.NoteId.make(id);

            if (value !== undefined) {
              yield* attrs.setProp({ doc: note.doc, recordId, propId, value });
            }

            yield* save(recordId, note.doc);
          }

          yield* attrs.setPropType({ doc: prop.doc, type: "number" });
          yield* save(propId, prop.doc);
          const db = yield* DB.Service;

          const stored = (yield* db.query((db) => db.select().from(Tables.notes))).find(
            (row) => row.id === propId,
          );

          expect(stored?.attrs_valid).toBe(0);
          expect(stored?.prop_default).toBe('{"_tag":"bool","val":false}');

          const defs = Option.getOrThrow(
            yield* (yield* definitions.reactiveDefs()).pipe(Stream.runHead),
          );

          expect(defs).toEqual([]);

          const properties = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({ type: "prop", sort: "updated" })).pipe(
              Stream.runHead,
            ),
          );

          expect(properties.map(({ id }) => id)).toContain(propId);

          const ids = (val: number) =>
            Effect.gen(function* () {
              const rows = Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({
                  type: "notes",
                  sort: "date",
                  props: { [propId]: AttrsSchema.PropVal.cases.number.make({ val }) },
                })).pipe(Stream.runHead),
              );

              return rows.map(({ id }) => id).toSorted();
            });

          expect(yield* ids(0)).toEqual(["number", "old-value", "unset"]);
          expect(yield* ids(7.5)).toEqual(["number", "old-value", "unset"]);
          yield* attrs.setPropDefault({
            doc: prop.doc,
            value: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
          });
          yield* save(propId, prop.doc);
          expect(
            Option.getOrThrow(yield* (yield* definitions.reactiveDefs()).pipe(Stream.runHead)),
          ).toMatchObject([
            {
              id: propId,
              prop_type: "number",
              prop_default: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
            },
          ]);
          expect(yield* ids(0)).toEqual([]);
          expect(yield* ids(7.5)).toEqual(["number", "unset"]);

          const rows = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({
              type: "notes",
              sort: "date",
              props: {
                [propId]: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
                [AttrsSchema.NoteId.make("missing")]: AttrsSchema.PropVal.cases.bool.make({
                  val: true,
                }),
              },
            })).pipe(Stream.runHead),
          );

          expect(rows.map(({ id }) => id).toSorted()).toEqual(["number", "unset"]);
        }).pipe(
          Effect.provide(Attrs.Service.layer),
          Effect.provide(PropRecordRepo.Service.layer),
          Effect.provideContext(device),
        );
      }),
    );
  });

  it("filters tagged values and reacts to assignments and definition defaults", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const builtins = yield* BuiltinAttrs.Service;
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;
          yield* builtins.ensureArchived({ createdAt });

          const makeDoc = () =>
            Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );

          const save = (id: AttrsSchema.NoteId, doc: Y.Doc) =>
            events
              .create({
                noteId: id,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));

          const flagId = AttrsSchema.NoteId.make("flag");
          const flag = yield* makeDoc();
          yield* attrs.initializeProp({
            doc: flag.doc,
            builtin: false,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save(flagId, flag.doc);

          for (const [id, value] of [
            ["unset", undefined],
            ["false", AttrsSchema.PropVal.cases.bool.make({ val: false })],
            ["true", AttrsSchema.PropVal.cases.bool.make({ val: true })],
            ["wrong-kind", AttrsSchema.PropVal.cases.text.make({ val: "false" })],
          ] as const) {
            const note = yield* makeDoc();
            const recordId = AttrsSchema.NoteId.make(id);

            if (value !== undefined) {
              yield* attrs.setProp({
                doc: note.doc,
                recordId,
                propId: BuiltinAttrs.archivedId,
                value,
              });
            }

            yield* save(recordId, note.doc);
          }

          const defaults = StreamSettings.defaults("notes").filter;

          const ids = (props: NonNullable<NoteRepo.StreamListQuery["props"]>) =>
            Effect.gen(function* () {
              const rows = Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({
                  type: "notes",
                  sort: "date",
                  props,
                })).pipe(Stream.runHead),
              );

              return rows.map(({ id }) => id).toSorted();
            });

          const defaultProps = StreamSettings.propFilters(defaults);
          expect(yield* ids(defaultProps)).toEqual(["false", "unset"]);
          expect(
            yield* ids({
              [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual(["true"]);
          expect(yield* ids({})).toEqual(["false", "true", "unset", "wrong-kind"]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual(["false", "unset"]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            }),
          ).toEqual([]);

          const pull = yield* Stream.toPull(
            yield* notes.reactiveStreamList({ type: "notes", sort: "date", props: defaultProps }),
          );

          expect((yield* pull)[0]?.map(({ id }) => id).toSorted()).toEqual(["false", "unset"]);

          const changing = yield* makeDoc();
          const recordId = AttrsSchema.NoteId.make("unset");
          yield* attrs.setProp({
            doc: changing.doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save(recordId, changing.doc);
          expect((yield* pull)[0]?.map(({ id }) => id)).toEqual(["false"]);

          yield* attrs.clearProp({ doc: changing.doc, propId: BuiltinAttrs.archivedId });
          yield* save(recordId, changing.doc);
          expect((yield* pull)[0]?.map(({ id }) => id).toSorted()).toEqual(["false", "unset"]);

          const prop = yield* flag.attrs.pipe(YSchema.set("_tag", "prop"));
          const flagProp = yield* prop.pipe(YSchema.set("prop_type", "bool"));

          yield* flagProp.pipe(
            YSchema.set("prop_default", AttrsSchema.PropVal.cases.bool.make({ val: false })),
          );
          yield* save(flagId, flag.doc);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual([]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            }),
          ).toEqual(["false", "unset"]);

          for (const value of [
            AttrsSchema.PropVal.cases.text.make({ val: "planned" }),
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("choice") }),
            AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("person") }),
          ]) {
            const propId = AttrsSchema.NoteId.make(value._tag);
            const def = yield* makeDoc();
            yield* attrs.initializeProp({ doc: def.doc, builtin: false, defaultValue: value });
            yield* save(propId, def.doc);
            expect(yield* ids({ [propId]: value })).toEqual([
              "false",
              "true",
              "unset",
              "wrong-kind",
            ]);

            const note = yield* makeDoc();
            const snapshot = Option.getOrThrow(yield* notes.findById("false"));

            if (snapshot.materializedYUpdate === null) throw new Error("Missing snapshot");
            Y.applyUpdate(note.doc, snapshot.materializedYUpdate);
            yield* attrs.setProp({
              doc: note.doc,
              recordId: AttrsSchema.NoteId.make("false"),
              propId,
              value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            yield* save(AttrsSchema.NoteId.make("false"), note.doc);
            expect(yield* ids({ [propId]: value })).toEqual(["true", "unset", "wrong-kind"]);
            expect(
              yield* ids({ [propId]: AttrsSchema.PropVal.cases.bool.make({ val: false }) }),
            ).toEqual([]);
          }
        }).pipe(Effect.provide(Attrs.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("sets and clears boolean assignments through ordinary update events and SQL projections", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const builtins = yield* BuiltinAttrs.Service;
          yield* builtins.ensureArchived({ createdAt });
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const defsRepo = yield* PropRecordRepo.Service;
          const db = yield* DB.Service;
          const recordId = AttrsSchema.NoteId.make("editable-note");

          const { doc } = yield* Effect.acquireRelease(
            Effect.sync(() => NoteDoc.make()),
            ({ doc }) => Effect.sync(() => doc.destroy()),
          );

          const save = () =>
            events
              .create({
                noteId: recordId,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));

          yield* attrs.setProp({
            doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          yield* save();

          const defs = yield* (yield* defsRepo.reactiveDefs()).pipe(Stream.runHead);

          expect(Option.getOrThrow(defs)).toEqual([
            {
              id: BuiltinAttrs.archivedId,
              title: "Archived",
              builtin: true,
              prop_type: "bool",
              prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            },
          ]);

          const values = db.query((db) => db.select().from(Tables.props));

          expect(yield* values).toEqual([
            {
              recordId,
              propId: BuiltinAttrs.archivedId,
              value: JSON.stringify(AttrsSchema.PropVal.cases.bool.make({ val: false })),
            },
          ]);

          yield* attrs.setProp({
            doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save();
          expect(yield* values).toEqual([
            {
              recordId,
              propId: BuiltinAttrs.archivedId,
              value: JSON.stringify(AttrsSchema.PropVal.cases.bool.make({ val: true })),
            },
          ]);

          yield* attrs.clearProp({ doc, propId: BuiltinAttrs.archivedId });
          yield* save();
          expect(yield* values).toEqual([]);
          expect(doc.getMap("attrs").toJSON()).toEqual({ props: {} });
        }).pipe(
          Effect.provide(Attrs.Service.layer),
          Effect.provide(PropRecordRepo.Service.layer),
          Effect.provideContext(device),
        );
      }),
    );
  });

  it("queries every def kind with matching defaults and link targets", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const repo = yield* PropRecordRepo.Service;

          const values = [
            AttrsSchema.PropVal.cases.text.make({ val: "hello" }),
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            AttrsSchema.PropVal.cases.bool.make({ val: false }),
            AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("option") }),
            AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("target") }),
          ];

          const targets = StreamFilter.toAttrs({ type: "pages" });

          for (const value of values) {
            const { doc, attrs } = yield* Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );

            const prop = yield* attrs.pipe(YSchema.set("_tag", "prop"));
            yield* prop.pipe(YSchema.set("prop_type", value._tag));
            yield* prop.pipe(YSchema.set("prop_default", value));

            if (AttrsSchema.PropVal.guards.link(value)) {
              const link = yield* prop.pipe(YSchema.set("prop_type", "link"));
              yield* link.pipe(YSchema.set("prop_targets", targets));
            }

            yield* events.create({
              noteId: AttrsSchema.NoteId.make(value._tag),
              type: "update",
              createdAt,
              payload: Y.encodeStateAsUpdate(doc),
            });
          }

          yield* materializer.catchUp();

          const defs = Option.getOrThrow(yield* (yield* repo.reactiveDefs()).pipe(Stream.runHead));

          expect(defs).toHaveLength(values.length);

          for (const value of values) {
            expect(defs.find((def) => def.prop_type === value._tag)).toMatchObject({
              prop_default: value,
            });
          }

          expect(defs.find((def) => def.prop_type === "link")).toMatchObject({
            prop_targets: targets,
          });
        }).pipe(Effect.provide(PropRecordRepo.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("materializes the def once, using graph creation time, outside ordinary note flows", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const builtins = yield* BuiltinAttrs.Service;
          yield* builtins.ensureArchived({ createdAt });
          yield* builtins.ensureArchived({ createdAt });
          const materializer = yield* Materializer.Service;
          yield* materializer.catchUp();
          const events = yield* EventRepo.Service;
          expect(yield* events.listAllForBackup()).toHaveLength(1);

          const notes = yield* NoteRepo.Service;
          const note = yield* notes.getById(BuiltinAttrs.archivedId);
          expect(note.title).toBe("Archived");
          expect(note.createdAt).toEqual(createdAt);
          expect(note.updatedAt).toEqual(createdAt);

          const { doc, attrs } = yield* Effect.acquireRelease(
            Effect.sync(() => NoteDoc.make()),
            ({ doc }) => Effect.sync(() => doc.destroy()),
          );

          if (note.materializedYUpdate === null) throw new Error("Missing snapshot");
          Y.applyUpdate(doc, note.materializedYUpdate);
          const decoded = yield* YSchema.exportStrict(attrs);
          expect(decoded._tag).toBe("prop");
          expect(decoded).toMatchObject({
            builtin: true,
            prop_type: "bool",
            prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            props: {},
          });
          expect(doc.getMap("attrs").get("props")).toBeInstanceOf(Y.Map);

          const sql = yield* SqlClient.SqlClient;
          expect(
            yield* sql`SELECT _tag AS tag, builtin, prop_type, prop_default, attrs_valid FROM notes`,
          ).toEqual([
            {
              tag: "prop",
              builtin: 1,
              prop_type: "bool",
              prop_default: '{"_tag":"bool","val":false}',
              attrs_valid: 1,
            },
          ]);
          expect(yield* notes.findAllRecords()).toEqual([]);
          expect(
            yield* (yield* notes.reactiveStreamList({ type: "pages", sort: "date" })).pipe(
              Stream.runHead,
            ),
          ).toEqual(Option.some([]));
          expect(
            yield* (yield* notes.reactiveSearchPreview("Archived")).pipe(Stream.runHead),
          ).toEqual(Option.some([]));
        }).pipe(Effect.provideContext(device));
      }),
    );
  });

  it("preserves the initialization event and timestamp when restoring a backup", async () => {
    await run(
      Effect.gen(function* () {
        const original = yield* makeDevice();
        yield* BuiltinAttrs.Service.use((builtins) => builtins.ensureArchived({ createdAt })).pipe(
          Effect.provideContext(original),
        );

        const backup = yield* EventRepo.Service.use((events) => events.listAllForBackup()).pipe(
          Effect.provideContext(original),
        );

        const restored = yield* makeDevice();
        yield* Effect.gen(function* () {
          const events = yield* EventRepo.Service;
          yield* events.importBackupEvents(backup.map(Struct.omit(["localSeq", "commitSeq"])));
          const builtins = yield* BuiltinAttrs.Service;
          yield* builtins.ensureArchived({
            createdAt: DateTime.makeUnsafe("2026-10-12T09:00:00Z"),
          });
          expect(yield* events.listAllForBackup()).toEqual(backup);
          const materializer = yield* Materializer.Service;
          yield* materializer.catchUp();
          const notes = yield* NoteRepo.Service;
          expect((yield* notes.getById(BuiltinAttrs.archivedId)).createdAt).toEqual(createdAt);
        }).pipe(Effect.provideContext(restored));
      }),
    );
  });

  it("reconciles two offline seeds through replay and downloads the seed on another device", async () => {
    await run(
      Effect.gen(function* () {
        const a = yield* makeDevice();
        const b = yield* makeDevice();
        const c = yield* makeDevice();

        for (const device of [a, b]) {
          yield* BuiltinAttrs.Service.use((builtins) =>
            builtins.ensureArchived({ createdAt }),
          ).pipe(Effect.provideContext(device));
        }

        const aEvents = yield* EventRepo.Service.use((events) => events.listAllForBackup()).pipe(
          Effect.provideContext(a),
        );

        const bEvents = yield* EventRepo.Service.use((events) => events.listAllForBackup()).pipe(
          Effect.provideContext(b),
        );

        expect(aEvents).toEqual(bEvents);

        const pending = yield* GraphSyncEventLog.Service.use((log) => log.getPendingCommit()).pipe(
          Effect.provideContext(a),
        );

        const event = Option.getOrThrow(pending).events[0];

        const committed = new CommittedEvent({
          id: event.id,
          streamRef: event.streamRef,
          payload: event.payload,
          createdAt: event.createdAt,
          commitSeq: 1,
        });

        for (const device of [a, b, c]) {
          yield* Effect.gen(function* () {
            const log = yield* GraphSyncEventLog.Service;
            yield* log.applyCommittedEvents([committed]);
            expect(yield* log.getPendingCommit()).toEqual(Option.none());
            const events = yield* EventRepo.Service;
            const rows = yield* events.listAllForBackup();
            expect(rows).toHaveLength(1);
            expect(rows[0]?.commitSeq).toBe(1);
            expect(rows[0]?.payload).toEqual(aEvents[0]?.payload);
            const materializer = yield* Materializer.Service;
            yield* materializer.catchUp();
            const notes = yield* NoteRepo.Service;
            expect((yield* notes.getById(BuiltinAttrs.archivedId)).createdAt).toEqual(createdAt);
          }).pipe(Effect.provideContext(device));
        }
      }),
    );
  });
});

function makeDevice() {
  const services = Layer.mergeAll(BuiltinAttrs.Service.layer, GraphSyncEventLog.Service.layer).pipe(
    Layer.provideMerge(GraphSyncEncryption.Service.layer),
    Layer.provideMerge(CliRuntime.layer),
    Layer.provide(
      Layer.succeed(GraphSyncContext.Context, {
        graphId: "graph",
        graphKey: new Uint8Array(32).fill(7),
      }),
    ),
    Layer.provide(Layer.succeed(DB.Config, { localGraphId: "graph", databasePath: ":memory:" })),
    Layer.provide(NodeServices.layer),
    Layer.provide(Reactivity.layer),
    Layer.fresh,
  );

  return Layer.build(services);
}

function run(program: Effect.Effect<void, unknown, Scope.Scope>) {
  return Effect.runPromise(Effect.scoped(program));
}
