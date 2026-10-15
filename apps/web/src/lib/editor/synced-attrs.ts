import { Attrs } from "@manotes/shared/attrs.service";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { Effect, Stream, SubscriptionRef } from "effect";
import { LiveDoc } from "../live-doc.service";

// Scope and rule-target panes acquire the same doc used by their editors.
export function watch(opts: { readonly id: NoteSchema.Id }) {
  return Stream.unwrap(
    Effect.gen(function* () {
      const docs = yield* LiveDoc.Service;
      const attrs = yield* Attrs.Service;
      const state = yield* docs.acquire({ recordId: opts.id });

      return SubscriptionRef.changes(state).pipe(
        Stream.switchMap((state) => {
          return LiveDoc.Doc.$match(state, {
            Loading: () => Stream.never,
            Ready: ({ doc }) => attrs.watch({ doc }),
            Error: (error) => Stream.fail(error),
          });
        }),
      );
    }),
  );
}

export * as SyncedAttrs from "./synced-attrs";
