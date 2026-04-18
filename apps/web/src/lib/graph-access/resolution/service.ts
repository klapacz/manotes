import { Data, Effect, Option, Result, Stream, Types } from "effect";
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
  const recordOption = yield* LocalRegistry.Repo.getGraph({ localGraphId });

  return yield* Result.match(resolveWithoutKeyLookup(recordOption), {
    onSuccess: Effect.succeed,
    onFailure: (record) =>
      keyStore.get(record.graphKeyEnvelope).pipe(
        Effect.map(
          Option.match({
            onNone: () => Resolution.CloudLocked({ record }),
            onSome: (graphKey) => Resolution.CloudUnlocked({ record, graphKey }),
          }),
        ),
      ),
  });
});

export const findReactive = Effect.fn("GraphAccessResolution.findReactive")(function* (
  localGraphId: string,
) {
  const keyStore = yield* KeyStoreService.Service;

  return LocalRegistry.Repo.findGraphReactive(localGraphId).pipe(
    Stream.switchMap((option): Stream.Stream<Resolution, SchemaError, never> => {
      return Result.match(resolveWithoutKeyLookup(option), {
        onSuccess: Stream.succeed,
        onFailure: (record) => {
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

type ResolveWithoutKeyLookupResult = Result.Result<
  Types.ExtractTag<Resolution, "Missing" | "Local">,
  LocalRegistry.Schema.CloudRecord
>;

// Resolve states that do not need any key-store lookup first.
// Missing, deleting, and local graphs are final here. Only active cloud graphs
// are returned in the failure channel so callers can continue with key lookup.
const resolveWithoutKeyLookup = (
  option: Option.Option<LocalRegistry.Schema.Record>,
): ResolveWithoutKeyLookupResult => {
  if (Option.isNone(option)) return Result.succeed(Resolution.Missing());
  const record = option.value;
  if (record.status === "deleting") return Result.succeed(Resolution.Missing());
  if (record.mode === "local") return Result.succeed(Resolution.Local({ record }));
  return Result.fail(record);
};
