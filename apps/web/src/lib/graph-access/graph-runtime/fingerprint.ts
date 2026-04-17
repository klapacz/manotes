import { Data, Effect, Match, Schema, Types } from "effect";
import * as Resolution from "../resolution/service";

export type Fingerprint = Data.TaggedEnum<{
  Local: {
    localGraphId: string;
  };
  Cloud: {
    localGraphId: string;
    graphId: string;
    wrappedGraphKeyId: string;
  };
}>;

export const Fingerprint = Data.taggedEnum<Fingerprint>();

const encodeGraphKeyId = Schema.encodeEffect(Schema.Uint8ArrayFromBase64);

export const create = Effect.fn("GraphRuntimeFingerprint.create")(function* (
  resolution: Types.ExtractTag<Resolution.Resolution, "CloudUnlocked" | "Local">,
) {
  const result: Fingerprint = yield* Match.value(resolution).pipe(
    Match.tagsExhaustive({
      Local: ({ record }) =>
        Effect.succeed(
          Fingerprint.Local({
            localGraphId: record.localGraphId,
          }),
        ),
      CloudUnlocked: ({ record }) =>
        Effect.gen(function* () {
          return Fingerprint.Cloud({
            localGraphId: record.localGraphId,
            graphId: record.graphId,
            wrappedGraphKeyId: yield* encodeGraphKeyId(record.graphKeyEnvelope.wrappedGraphKey),
          });
        }),
    }),
  );
  return result;
});
