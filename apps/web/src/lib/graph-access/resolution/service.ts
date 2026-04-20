import { Data, Effect, Option, Result, Stream, Types } from "effect";
import * as KeyStoreService from "../key-store/service";
import * as LocalRegistry from "../local-registry";
import * as SessionService from "../session/service";
import * as SessionApi from "@manotes/shared/session/api";
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
  const sessionService = yield* SessionService.Service;

  const [sessionOpt, recordOption] = yield* Effect.all([
    sessionService.find,
    LocalRegistry.Repo.findGraph({ localGraphId }),
  ]);

  return yield* Result.match(resolveWithoutKeyLookup(recordOption, sessionOpt), {
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
  const sessionService = yield* SessionService.Service;

  return Stream.zipLatest(
    LocalRegistry.Repo.findGraphReactive(localGraphId),
    sessionService.stream.find,
  ).pipe(
    Stream.switchMap(
      ([recordOption, sessionOpt]): Stream.Stream<Resolution, SchemaError, never> => {
        return Result.match(resolveWithoutKeyLookup(recordOption, sessionOpt), {
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
      },
    ),
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
  session: Option.Option<SessionApi.Session>,
): ResolveWithoutKeyLookupResult => {
  if (Option.isNone(option)) return Result.succeed(Resolution.Missing());
  const record = option.value;
  if (record.status === "deleting") return Result.succeed(Resolution.Missing());
  if (record.mode === "local") return Result.succeed(Resolution.Local({ record }));

  // Cloud graphs are only resolvable when the session belongs to the same account.
  if (Option.isNone(session) || record.accountId !== session.value.accountId) {
    return Result.succeed(Resolution.Missing());
  }

  return Result.fail(record);
};
