import { Data, Deferred, Effect, Stream } from "effect";
import type { QueryEngine } from "./query-engine";

export type State<T> =
  | {
      readonly _tag: "Results";
      readonly text: string;
      readonly matches: readonly QueryEngine.Match<T>[];
    }
  | { readonly _tag: "Slow"; readonly text: string };

export function run<T, E, R>(opts: {
  request: QueryEngine.Request;
  query: QueryEngine.Query<T, E, R>;
  debounce: boolean;
}): Stream.Stream<State<T>, E, R> {
  const { request, query } = opts;
  const state = Data.taggedEnum<State<T>>();

  return Stream.unwrap(
    Effect.gen(function* () {
      if (opts.debounce && request.text.trim()) yield* Effect.sleep("100 millis");

      const firstResult = yield* Deferred.make<void>();

      const results = Stream.suspend(() => query(request)).pipe(
        Stream.tap(() => Deferred.succeed(firstResult, undefined)),
        Stream.map((matches) => state.Results({ text: request.text, matches })),
      );

      const slow = Stream.fromEffect(
        Effect.sleep("1 second").pipe(Effect.as(state.Slow({ text: request.text }))),
      ).pipe(Stream.interruptWhen(Deferred.await(firstResult)));

      // Stop the timer on the first result while keeping live updates subscribed.
      return Stream.merge(results, slow, { haltStrategy: "left" });
    }),
  ).pipe(Stream.scoped);
}

export * as MenuSearch from "./menu-search";
