import { Clock, Duration, Effect } from "effect";

/** Wait for the next animation frame so pending paints and compositor animations commit. */
export const next: Effect.Effect<void> = Effect.callback((resume) => {
  const id = requestAnimationFrame(() => resume(Effect.void));

  return Effect.sync(() => cancelAnimationFrame(id));
});

/**
 * Run `f` over `items` in order, yielding to `Frame.next` whenever the current
 * slice exceeds `budget` so animations and scrolling stay responsive.
 */
export function forEach<A, E, R>(
  items: Iterable<A>,
  f: (item: A) => Effect.Effect<unknown, E, R>,
  options: { readonly budget: Duration.Input },
): Effect.Effect<void, E, R> {
  const budgetMs = Duration.toMillis(Duration.fromInputUnsafe(options.budget));

  return Effect.gen(function* () {
    const start = yield* Clock.currentTimeMillis;

    yield* Effect.reduce(
      items,
      () => start,
      (sliceStart, item) => {
        return Effect.gen(function* () {
          yield* f(item);

          const now = yield* Clock.currentTimeMillis;

          if (now - sliceStart < budgetMs) return sliceStart;

          yield* next;

          return yield* Clock.currentTimeMillis;
        });
      },
    );
  });
}

export * as Frame from "./frame";
