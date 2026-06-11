import { Effect, Layer, Context } from "effect";
import type { UnknownNodeJSON } from "../../node-json";
import { collectBacklinkTargetIds } from "./target";
import * as Repo from "./repo";

export class Service extends Context.Service<Service>()("Materializer.Backlink.Service", {
  make: Effect.gen(function* () {
    const repo = yield* Repo.Service;

    const replaceForSourceNote = Effect.fn("Materializer.Backlink.replaceForSourceNote")(
      function* (options: { sourceId: string; content: UnknownNodeJSON }) {
        yield* repo.replaceForSource(options.sourceId, collectBacklinkTargetIds(options.content));
      },
    );

    return {
      replaceForSourceNote,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(Repo.Service.layer));
}
