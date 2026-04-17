import { Data, Effect, Option, Stream, Types } from "effect";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import type { SchemaError } from "effect/Schema";

export type Resolution = Data.TaggedEnum<{
  Missing: {};
  Local: { record: LocalRegistry.Schema.LocalRecord };
  CloudLocked: { record: LocalRegistry.Schema.CloudRecord };
  CloudUnlocked: {
    record: LocalRegistry.Schema.CloudRecord;
    graphKey: Uint8Array<ArrayBuffer>;
  };
}>;

export type ResolutionReady = Types.ExtractTag<Resolution, "CloudUnlocked" | "Local">;

export const Resolution = Data.taggedEnum<Resolution>();

export const find = Effect.fn("GraphAccessResolution.find")(function* (localGraphId: string) {
  const keyStore = yield* KeyStoreService.Service;
  const recordOption = yield* LocalRegistry.Repo.getGraph(localGraphId);

  return yield* Option.match(recordOption, {
    onNone: () => Effect.succeed(Resolution.Missing()),
    onSome: (record) => {
      if (record.mode === "local") return Effect.succeed(Resolution.Local({ record }));

      return keyStore.get(record.graphKeyEnvelope).pipe(
        Effect.map(
          Option.match({
            onNone: () => Resolution.CloudLocked({ record }),
            onSome: (graphKey) => Resolution.CloudUnlocked({ record, graphKey }),
          }),
        ),
      );
    },
  });
});

export const findReactive = Effect.fn("GraphAccessResolution.findReactive")(function* (
  localGraphId: string,
) {
  const keyStore = yield* KeyStoreService.Service;

  return LocalRegistry.Repo.findGraphReactive(localGraphId).pipe(
    Stream.switchMap((option): Stream.Stream<Resolution, SchemaError, never> => {
      return Option.match(option, {
        onNone: () => Stream.succeed(Resolution.Missing()),
        onSome: (record) => {
          if (record.mode === "local") return Stream.succeed(Resolution.Local({ record }));

          return keyStore.changes(record.graphKeyEnvelope).pipe(
            Stream.unwrap,
            Stream.map(
              Option.match({
                onNone: () => Resolution.CloudLocked({ record }),
                onSome: (graphKey) => Resolution.CloudUnlocked({ record, graphKey }),
              }),
            ),
          );
        },
      });
    }),
  );
}, Stream.unwrap);
