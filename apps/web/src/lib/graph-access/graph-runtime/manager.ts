import {
  Data,
  Effect,
  Equal,
  HashMap,
  Layer,
  Option,
  SynchronizedRef,
  Stream,
  ServiceMap,
  Match,
} from "effect";
import * as Resolution from "../resolution/service";
import * as GraphRuntimeLayer from "./layer";
import * as ManagedRuntime from "./managed-runtime";
import * as Fingerprint from "./fingerprint";
import * as LocalRegistry from "../local-registry";

export type RuntimeContext = Layer.Success<GraphRuntimeLayer.AppLayer>;
export type RuntimeError = Layer.Error<GraphRuntimeLayer.AppLayer>;
export type Runtime = ManagedRuntime.ManagedRuntime<RuntimeContext, RuntimeError>;

export type State = Data.TaggedEnum<{
  Missing: {};
  Locked: { record: LocalRegistry.Schema.CloudRecord };
  Ready: { record: LocalRegistry.Schema.Record; runtime: Runtime };
}>;
export const State = Data.taggedEnum<State>();

export class Service extends ServiceMap.Service<Service>()("GraphAccess.GraphRuntime.Manager", {
  make: Effect.gen(function* () {
    type Entry = { fingerprint: Fingerprint.Fingerprint; runtime: Runtime };
    const ref = yield* SynchronizedRef.make(HashMap.empty<string, Entry>());

    const getCached = Effect.fn("GraphRuntimeManager.getCached")(function* (localGraphId: string) {
      const entries = yield* SynchronizedRef.get(ref);
      return HashMap.get(entries, localGraphId);
    });

    const remove = Effect.fn("GraphRuntimeManager.remove")(function* (localGraphId: string) {
      const removed = yield* SynchronizedRef.modify(ref, (entries) => {
        const existing = HashMap.get(entries, localGraphId);
        return [existing, HashMap.remove(entries, localGraphId)] as const;
      });

      if (Option.isSome(removed)) yield* removed.value.runtime.dispose;
    });

    const clear = Effect.fn("GraphRuntimeManager.clear")(function* () {
      const entries = yield* SynchronizedRef.modify(ref, (current) => {
        const existing = globalThis.Array.from(HashMap.values(current));
        return [existing, HashMap.empty<string, Entry>()] as const;
      });

      yield* Effect.all(
        entries.map((entry) => entry.runtime.dispose),
        { concurrency: "unbounded", discard: true },
      );
    });

    const makeState = Effect.fn("GraphRuntimeManager.makeState")(function* (
      localGraphId: string,
      resolution: Resolution.Resolution,
    ) {
      if (resolution._tag === "Missing") {
        yield* remove(localGraphId);
        return State.Missing();
      }

      if (resolution._tag === "CloudLocked") {
        yield* remove(localGraphId);
        return State.Locked({ record: resolution.record });
      }

      return yield* makeReadyState(resolution);
    });

    const makeReadyState = Effect.fn("GraphRuntimeManager.makeReadyState")(function* (
      resolution: Resolution.ResolutionReady,
    ) {
      const fingerprint = yield* Fingerprint.create(resolution);

      const next = yield* SynchronizedRef.modifyEffect(ref, (entries) =>
        Effect.gen(function* () {
          const existing = HashMap.get(entries, resolution.record.localGraphId);

          // Matches existing runtime with fingerprint
          if (Option.isSome(existing) && Equal.equals(existing.value.fingerprint, fingerprint)) {
            return [
              { runtime: existing.value.runtime, previous: Option.none<Entry>() },
              entries,
            ] as const;
          }

          const runtimeLayer = GraphRuntimeLayer.makeLayer({
            localGraphId: resolution.record.localGraphId,
            displayName: resolution.record.displayName,
            graphSyncConfig: Match.value(resolution).pipe(
              Match.tagsExhaustive({
                Local: () => ({ mode: "local" as const }),
                CloudUnlocked: (resolution) => ({
                  mode: "cloud" as const,
                  graphId: resolution.record.graphId,
                  graphKey: resolution.graphKey,
                }),
              }),
            ),
          });
          const runtime = yield* ManagedRuntime.createScoped(runtimeLayer);

          return [
            { runtime, previous: existing },
            HashMap.set(entries, resolution.record.localGraphId, { fingerprint, runtime }),
          ] as const;
        }),
      );

      if (Option.isSome(next.previous)) yield* next.previous.value.runtime.dispose;

      return State.Ready({ record: resolution.record, runtime: next.runtime });
    });

    const findReactive = Effect.fn("GraphRuntimeManager.findReactive")((localGraphId: string) => {
      return Effect.succeed(
        Resolution.findReactive(localGraphId).pipe(
          Stream.mapEffect((resolution) => makeState(localGraphId, resolution)),
        ),
      );
    });

    const find = Effect.fn("GraphRuntimeManager.find")(function* (localGraphId: string) {
      const resolution = yield* Resolution.find(localGraphId);
      return yield* makeState(localGraphId, resolution);
    });

    return {
      getCached,
      remove,
      clear,
      makeState,
      findReactive,
      find,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
