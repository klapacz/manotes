import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { ProseKit } from "prosekit/solid";
import { createEffect, onCleanup, type JSX } from "solid-js";
import * as Y from "yjs";
import {
  defineYjsCommands,
  defineYjsKeymap,
  defineYjsSyncPlugin,
  defineYjsUndoPlugin,
  type YjsSyncPluginOptions,
  type YjsUndoPluginOptions,
} from "prosekit/extensions/yjs";
import { defineAppExtension } from "./editor.extension";
import {
  DB,
  EventRepo,
  EventSchema,
  Tables,
  useRuntime,
  type NoteSchema,
} from "./lib";
import {
  Array,
  Chunk,
  DateTime,
  Effect,
  Fiber,
  Layer,
  List,
  Logger,
  LogLevel,
  Option,
  Schema,
  Stream,
} from "effect";
import * as D from "drizzle-orm";

const decodeAll = Schema.decode(Schema.Array(EventSchema.Record));

const loadInitialUpdates = Effect.fn("loadInitialUpdates")(function* (
  doc: Y.Doc,
  noteId: string,
) {
  const db = yield* DB.Service;

  const events = yield* db
    .query((db) =>
      db
        .select()
        .from(Tables.events)
        .where(
          D.and(
            D.eq(Tables.events.noteId, noteId),
            D.eq(Tables.events.type, "update"),
          ),
        )
        .orderBy(D.asc(Tables.events.id)),
    )
    .pipe(Effect.flatMap((events) => decodeAll(events)));

  if (!Array.isNonEmptyReadonlyArray(events)) {
    return { lastKnownEventId: -1 };
  }

  yield* Effect.logDebug("Got events", events.length);

  // Apply historical updates to the Y.Doc
  yield* Effect.forEach(events, (event) =>
    Effect.sync(() => Y.applyUpdate(doc, event.payload)),
  );

  // Track the last known update id
  const lastEvent = Array.lastNonEmpty(events);

  return { lastKnownEventId: lastEvent.id };
});

const applyIncomingUpdates = Effect.fn("applyIncomingUpdates")(function* (
  doc: Y.Doc,
  noteId: string,
  initialLastKnownEventId: number,
) {
  yield* Effect.iterate(initialLastKnownEventId, {
    while: () => true,
    body: (lastKnownEventId) =>
      Effect.gen(function* () {
        yield* Effect.logDebug("Last known ID:", lastKnownEventId);

        const db = yield* DB.Service;
        // Create reactive stream for events > lastKnownId
        const reactiveStream = yield* db.reactiveQuery((db) =>
          db
            .select()
            .from(Tables.events)
            .where(
              D.and(
                D.eq(Tables.events.noteId, noteId),
                D.eq(Tables.events.type, "update"),
                D.gt(Tables.events.id, lastKnownEventId),
              ),
            )
            .orderBy(D.asc(Tables.events.id)),
        );

        // Take first non-empty batch
        const firstBatch = yield* reactiveStream.pipe(
          Stream.mapEffect(decodeAll),
          Stream.filterMap((events) =>
            Array.isNonEmptyReadonlyArray(events)
              ? Option.some(events)
              : Option.none(),
          ),
          Stream.runHead,
        );

        // Stream ended without events (shouldn't happen with reactive query)
        if (Option.isNone(firstBatch)) {
          yield* Effect.logError("Stream ended without events");
          return lastKnownEventId;
        }

        const events = firstBatch.value;
        yield* Effect.logDebug("Received batch of events", events.length);

        // Apply updates
        yield* Effect.forEach(events, (event) =>
          Effect.sync(() => Y.applyUpdate(doc, event.payload)),
        );

        const lastEvent = Array.lastNonEmpty(events);
        const nextLastKnownId = lastEvent.id;

        // Return the new lastKnownId and continue iterating
        return nextLastKnownId;
      }),
  });
});

const saveOutcomingUpdates = Effect.fn("saveOutcomingUpdates")(function* (
  doc: Y.Doc,
  noteId: string,
) {
  yield* Stream.asyncPush<Uint8Array<ArrayBufferLike>>((emit) =>
    Effect.sync(() => doc.on("update", (update) => emit.single(update))),
  ).pipe(
    Stream.groupedWithin(100, "1 seconds"),
    Stream.tap((chunk) =>
      Effect.gen(function* () {
        const merged = Y.mergeUpdates(Chunk.toArray(chunk));

        const eventRepo = yield* EventRepo.Service;

        yield* eventRepo.create({
          payload: merged,
          timestamp: yield* DateTime.now,
          type: "update",
          noteId: noteId,
        });
      }),
    ),
    Stream.runDrain,
  );
});

const setupDoc = Effect.fn(function* (doc: Y.Doc, noteId: string) {
  yield* Effect.all(
    [
      Effect.gen(function* () {
        const { lastKnownEventId } = yield* loadInitialUpdates(doc, noteId);

        yield* applyIncomingUpdates(doc, noteId, lastKnownEventId);
      }),
      saveOutcomingUpdates(doc, noteId),
    ],
    { concurrency: "unbounded" }, // Run in parallel
  ).pipe(Effect.provide(loggerLayer));
});

const logger = Logger.make(({ logLevel, message, spans }) => {
  const spansStr = List.map(spans, (span) => span.label)
    .pipe(List.toArray)
    .join(",");

  console.log(
    `[${logLevel.label}] [${spansStr}] ${(message as string[]).join(" ")}`,
  );
});

const loggerLayer = Layer.merge(
  Logger.replace(Logger.defaultLogger, logger),
  Logger.minimumLogLevel(LogLevel.Debug),
);

export default function Editor(props: {
  note: typeof NoteSchema.Record.Type;
}): JSX.Element {
  const doc = new Y.Doc();

  const runtime = useRuntime();

  createEffect(() => {
    const r = runtime();

    const fiber = r.runFork(setupDoc(doc, props.note.id));

    onCleanup(() => void r.runPromise(Fiber.interrupt(fiber)));
  });

  const extension = union([defineYjs({ doc }), defineAppExtension()]);

  const editor = createEditor({ extension });

  return (
    <ProseKit editor={editor}>
      <div ref={editor.mount} class="outline-solid p-4"></div>
    </ProseKit>
  );
}

export interface YjsOptions {
  doc: Y.Doc;
  fragment?: Y.XmlFragment;
  sync?: YjsSyncPluginOptions;
  undo?: YjsUndoPluginOptions;
}

/**
 * @public
 */
export function defineYjs(options: YjsOptions) {
  const { doc, sync, undo } = options;
  const fragment = options.fragment ?? doc.getXmlFragment("prosemirror");

  return withPriority(
    union([
      defineYjsKeymap(),
      defineYjsCommands(),
      defineYjsUndoPlugin({ ...undo }),
      defineYjsSyncPlugin({ ...sync, fragment }),
    ]),
    Priority.high,
  );
}
