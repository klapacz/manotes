import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs.service";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import { CommittedEvent } from "@manotes/shared/graph-sync/contract/messages";
import * as GraphSyncContext from "@manotes/shared/graph-sync/context";
import * as GraphSyncEncryption from "@manotes/shared/graph-sync/encryption/service";
import * as GraphSyncEventLog from "@manotes/shared/graph-sync/event-log.service";
import * as Materializer from "@manotes/shared/materializer.service";
import { NoteRepo } from "@manotes/shared/note.repo";
import { NoteDoc } from "@manotes/shared/note/doc";
import { YSchema } from "@manotes/shared/y-schema";
import { DateTime, Effect, Layer, Option, Scope, Stream, Struct } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { SqlClient } from "effect/unstable/sql";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

const createdAt = DateTime.makeUnsafe("2026-10-11T09:00:00Z");

describe("Archived builtin", () => {
  it("materializes the definition once, using graph creation time, outside ordinary note flows", async () => {
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
