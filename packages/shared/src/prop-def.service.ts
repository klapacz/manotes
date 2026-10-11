import { Context, Effect, Layer, Stream } from "effect";
import { BuiltinAttrs } from "./builtin-attrs";
import { PropRecordRepo } from "./prop-record.repo";

export class Service extends Context.Service<Service>()("PropDef.Service", {
  make: Effect.gen(function* () {
    const records = yield* PropRecordRepo.Service;

    const reactiveDefs = Effect.fn("PropDef.reactiveDefs")(function* () {
      const defs = yield* records.reactiveDefs();

      return defs.pipe(Stream.map((defs) => [...BuiltinAttrs.defs, ...defs]));
    });

    return { reactiveDefs };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(PropRecordRepo.Service.layer),
  );
}

export * as PropDef from "./prop-def.service";
