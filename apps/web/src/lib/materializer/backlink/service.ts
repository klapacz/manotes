import { Effect, Layer, ServiceMap, Stream } from "effect";
import type { UnknownNodeJSON } from "../../node-json";
import { buildBacklinkPreviewDoc } from "./preview";
import { collectBacklinkTargetIds } from "./target";
import * as Repo from "./repo";
import * as BacklinkSchema from "./schema";

export type IncomingBacklinkPreview = {
  id: string;
  title: string;
  isDaily: boolean;
  preview: UnknownNodeJSON;
};

export class Service extends ServiceMap.Service<Service>()("Materializer.Backlink.Service", {
  make: Effect.gen(function* () {
    const repo = yield* Repo.Service;

    const listIncomingPreviews = Effect.fn("Materializer.Backlink.listIncomingPreviews")(function* (
      targetId: string,
    ) {
      const notes = yield* repo.listIncomingNotes(targetId);

      return notes.map((note) => toIncomingBacklinkPreview(note, targetId));
    });

    const reactiveListIncomingPreviews = Effect.fn(
      "Materializer.Backlink.reactiveListIncomingPreviews",
    )(function* (targetId: string) {
      const notes = yield* repo.reactiveListIncomingNotes(targetId);

      return notes.pipe(
        Stream.map((items) => items.map((item) => toIncomingBacklinkPreview(item, targetId))),
      );
    });

    const replaceForSourceNote = Effect.fn("Materializer.Backlink.replaceForSourceNote")(
      function* (options: { sourceId: string; content: UnknownNodeJSON }) {
        yield* repo.replaceForSource(options.sourceId, collectBacklinkTargetIds(options.content));
      },
    );

    return {
      listIncomingPreviews,
      reactiveListIncomingPreviews,
      replaceForSourceNote,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Repo.Service.layer));
}

function toIncomingBacklinkPreview(
  note: BacklinkSchema.IncomingBacklinkNote,
  targetId: string,
): IncomingBacklinkPreview {
  return {
    id: note.id,
    title: note.title,
    isDaily: note.isDaily,
    preview: buildBacklinkPreviewDoc({
      title: note.title,
      content: note.content,
      targetId,
      isDaily: note.isDaily,
    }),
  };
}
