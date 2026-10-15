import { RecordSchema } from "../../record.schema";
import { Effect, Layer, Context } from "effect";
import type { UnknownNodeJSON } from "../../node-json";
import { collectBacklinkTargetIds } from "./target";
import { BacklinkRepo } from "./repo";

export class Service extends Context.Service<Service>()("Materializer.Backlink.Service", {
  make: Effect.gen(function* () {
    const repo = yield* BacklinkRepo.Service;

    const replaceForSourceRecord = Effect.fn("Materializer.Backlink.replaceForSourceRecord")(
      function* (options: { sourceId: RecordSchema.Id; content: UnknownNodeJSON }) {
        yield* repo.replaceForSource(options.sourceId, collectBacklinkTargetIds(options.content));
      },
    );

    return {
      replaceForSourceRecord,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(BacklinkRepo.Service.layer),
  );
}

export * as BacklinkService from "./service";
