import { Context, DateTime, Effect, Layer } from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { EventRepo } from "./event.repo";
import { NoteDoc } from "./note/doc";
import { ProsemirrorEncode } from "./prosemirror/encode";
import { BuiltinAttrs } from "./builtin-attrs";

export { archivedId } from "./builtin-attrs";

const archivedEventId = `${BuiltinAttrs.archivedId}:init:v1`;

export class Service extends Context.Service<Service>()("BuiltinAttrs.Service", {
  make: Effect.gen(function* () {
    const events = yield* EventRepo.Service;
    const attrs = yield* Attrs.Service;

    const initialUpdate = Effect.fn("BuiltinAttrs.initialUpdate")(function* () {
      const { doc } = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const note = NoteDoc.make();
          // Reserved for this immutable seed: every device produces the same CRDT operations.
          note.doc.clientID = 1;

          return note;
        }),
        ({ doc }) => Effect.sync(() => doc.destroy()),
      );

      yield* attrs.initializeProp({
        doc,
        builtin: true,
        defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
      });

      return yield* Effect.sync(() => {
        ProsemirrorEncode.initializeDocument({
          doc,
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Archived" }],
            },
          ],
        });

        return Y.encodeStateAsUpdate(doc);
      });
    }, Effect.scoped);

    const ensureArchived = Effect.fn("BuiltinAttrs.ensureArchived")(function* (opts: {
      readonly createdAt: DateTime.Utc;
    }) {
      yield* events.createIfAbsent({
        id: archivedEventId,
        noteId: BuiltinAttrs.archivedId,
        type: "update",
        createdAt: opts.createdAt,
        payload: yield* initialUpdate(),
      });
    });

    return { ensureArchived };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(Attrs.Service.layer),
  );
}

export * as BuiltinAttrs from "./builtin-attrs.service";
