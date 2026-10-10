import { Context, Effect, Layer } from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { NoteDoc } from "./note/doc";
import { YSchema } from "./y-schema";

export class Service extends Context.Service<Service>()("Attrs.Service", {
  make: Effect.sync(() => ({ initializeBoolProp })),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

const initializeBoolProp = Effect.fn("Attrs.initializeBoolProp")(function* (opts: {
  readonly doc: Y.Doc;
  readonly builtin: boolean;
  readonly defaultValue: boolean;
}) {
  const { attrs } = NoteDoc.fromDoc({ doc: opts.doc });
  const prop = yield* attrs.pipe(YSchema.set("_tag", "prop"));
  const bool = yield* prop.pipe(YSchema.set("prop_type", "bool"));

  yield* bool.pipe(YSchema.set("builtin", opts.builtin));
  yield* bool.pipe(
    YSchema.set("prop_default", AttrsSchema.PropVal.cases.bool.make({ val: opts.defaultValue })),
  );
  yield* bool.pipe(YSchema.upsertMap("props"));
});

export * as Attrs from "./attrs.service";
