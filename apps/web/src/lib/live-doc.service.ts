import type { NoteSchema } from "@manotes/shared/note.schema";
import { Cause, Context, Data, Deferred, Effect, Layer, RcMap, SubscriptionRef } from "effect";
import * as Y from "yjs";
import * as EditorSyncService from "./editor-sync.service";

export type Doc = Data.TaggedEnum<{
  Loading: {};
  Ready: { readonly doc: Y.Doc };
  Error: { readonly message: string };
}>;

export const Doc = Data.taggedEnum<Doc>();

export function readyDoc(state: Doc) {
  return Doc.$match(state, {
    Loading: () => undefined,
    Ready: ({ doc }) => doc,
    Error: () => undefined,
  });
}

export class Service extends Context.Service<Service>()("LiveDoc.Service", {
  make: Effect.gen(function* () {
    // Every view of a record holds the same session until its last reference expires.
    const docs = yield* RcMap.make({
      idleTimeToLive: "7 seconds",
      lookup: (recordId: NoteSchema.Id) => makeDoc({ recordId }),
    });

    const acquire = Effect.fn("LiveDoc.acquire")(function* (opts: {
      readonly recordId: NoteSchema.Id;
    }) {
      return yield* RcMap.get(docs, opts.recordId);
    });

    return { acquire };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EditorSyncService.Service.layer),
  );
}

const makeDoc = Effect.fn("LiveDoc.makeDoc")(function* (opts: {
  readonly recordId: NoteSchema.Id;
}) {
  const sync = yield* EditorSyncService.Service;

  const doc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (doc) => Effect.sync(() => doc.destroy()),
  );

  const state = yield* SubscriptionRef.make<Doc>(Doc.Loading());
  const ready = yield* Deferred.make<void>();

  // Stop synchronization and flush pending writes before destroying the shared doc.
  yield* Effect.all(
    [
      sync.setupDoc(doc, { noteId: opts.recordId }, ready),
      Effect.gen(function* () {
        yield* Deferred.await(ready);
        yield* SubscriptionRef.set(state, Doc.Ready({ doc }));
      }),
    ],
    { concurrency: "unbounded" },
  ).pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) return Effect.void;

      return SubscriptionRef.set(state, Doc.Error({ message: "Failed to load record." }));
    }),
    Effect.forkScoped,
  );

  return state;
});

export * as LiveDoc from "./live-doc.service";
