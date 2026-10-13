import { Attrs } from "@manotes/shared/attrs.service";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { Deferred, Effect, Fiber, Stream } from "effect";
import * as Y from "yjs";
import * as EditorSyncService from "../editor-sync.service";

// A stream owns the document and its synchronization until the pane releases it.
export function watch(opts: { readonly id: NoteSchema.Id }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const doc = yield* Effect.acquireRelease(
        Effect.sync(() => new Y.Doc()),
        (doc) => Effect.sync(() => doc.destroy()),
      );

      const ready = yield* Deferred.make<void>();

      const sync = yield* EditorSyncService.Service.use((service) =>
        service.setupDoc(doc, { noteId: opts.id }, ready),
      ).pipe(Effect.forkScoped);

      // Surface a boot failure instead of waiting forever for the ready signal.
      yield* Deferred.await(ready).pipe(Effect.raceFirst(Fiber.join(sync)));

      return yield* Attrs.Service.use((attrs) => Effect.succeed(attrs.watch({ doc })));
    }),
  );
}

export * as SyncedAttrs from "./synced-attrs";
