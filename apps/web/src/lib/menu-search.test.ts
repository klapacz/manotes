import { Clock, Deferred, Effect, Option, Stream, SubscriptionRef } from "effect";
import { TestClock } from "effect/testing";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";
import { describe, expect, it } from "vite-plus/test";
import { MenuSearch } from "./menu-search";
import type { QueryEngine } from "./query-engine";

describe("menu search lifecycle", () => {
  it("runs prefilled searches immediately and debounces subsequent input", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const calls: string[] = [];

        const { registry, request, state } = yield* makeSearch((request) => {
          return Stream.sync(() => {
            calls.push(request.text);

            return [{ value: request.text, score: 1 }];
          });
        }, "2026-10-09");

        yield* TestClock.adjust(0);
        expect(calls).toEqual(["2026-10-09"]);
        const previous = registry.get(state);
        expect(AsyncResult.isSuccess(previous)).toBe(true);
        registry.set(request, { text: "2026-10-10" });
        yield* TestClock.adjust("99 millis");
        expect(calls).toEqual(["2026-10-09"]);
        expect(registry.get(state)).toEqual({ ...previous, waiting: true });
        yield* TestClock.adjust("1 millis");
        expect(calls).toEqual(["2026-10-09", "2026-10-10"]);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("retains results and restarts the quiet period for each keystroke", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const calls: string[] = [];

        const { registry, request, state } = yield* makeSearch((request) => {
          return Stream.sync(() => {
            calls.push(request.text);

            return [{ value: request.text, score: 1 }];
          });
        });

        yield* TestClock.adjust(0);
        const previous = registry.get(state);
        expect(AsyncResult.isSuccess(previous)).toBe(true);
        expect(calls).toEqual([""]);

        registry.set(request, { text: "a" });
        yield* TestClock.adjust("99 millis");
        expect(registry.get(state)).toEqual({ ...previous, waiting: true });
        registry.set(request, { text: "ab" });
        yield* TestClock.adjust("99 millis");
        expect(calls).toEqual([""]);
        yield* TestClock.adjust("1 millis");
        expect(calls).toEqual(["", "ab"]);
        expect(registry.get(state).waiting).toBe(false);
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state)))).toMatchObject({
          text: "ab",
          matches: [{ value: "ab", score: 1 }],
        });
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("replaces retained results after one second, then accepts the eventual result", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { registry, request, state } = yield* makeSearch((request) => {
          return Stream.fromEffect(
            Effect.succeed([{ value: request.text, score: 1 }]).pipe(
              Effect.delay(request.text ? "1500 millis" : 0),
            ),
          );
        });

        yield* TestClock.adjust(0);
        const previous = registry.get(state);
        registry.set(request, { text: "slow" });
        yield* TestClock.adjust("1099 millis");
        expect(registry.get(state)).toEqual({ ...previous, waiting: true });
        yield* TestClock.adjust("1 millis");
        const slow = Option.getOrThrow(AsyncResult.value(registry.get(state)));
        expect(slow._tag).toBe("Slow");
        expect(slow.text).toBe("slow");
        yield* TestClock.adjust("500 millis");
        expect(registry.get(state).waiting).toBe(false);
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state)))).toMatchObject({
          text: "slow",
          matches: [{ value: "slow", score: 1 }],
        });
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("keeps receiving live results without letting the slow timer replace them", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const values = yield* SubscriptionRef.make("Original");
        const updated = yield* Deferred.make<void>();

        const { registry, state } = yield* makeSearch(() => {
          return SubscriptionRef.changes(values).pipe(
            Stream.map((value) => [{ value, score: 1 }]),
            Stream.tap((matches) => {
              return matches[0]?.value === "Updated"
                ? Deferred.succeed(updated, undefined)
                : Effect.void;
            }),
          );
        });

        yield* TestClock.adjust(0);
        yield* TestClock.adjust("2 seconds");
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state)))._tag).toBe("Results");
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state)))).toMatchObject({
          matches: [{ value: "Original", score: 1 }],
        });
        yield* SubscriptionRef.set(values, "Updated");
        yield* Deferred.await(updated);
        yield* TestClock.adjust(0);
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state)))).toMatchObject({
          matches: [{ value: "Updated", score: 1 }],
        });
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("interrupts old queries on input changes and when the menu unmounts", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const interrupted: string[] = [];

        const { registry, request, state } = yield* makeSearch((request) => {
          return request.text
            ? Stream.fromEffect(
                Effect.never.pipe(
                  Effect.onInterrupt(() => {
                    return Effect.sync(() => {
                      interrupted.push(request.text);
                    });
                  }),
                ),
              )
            : Stream.succeed([]);
        });

        yield* TestClock.adjust(0);
        registry.set(request, { text: "old" });
        yield* TestClock.adjust("100 millis");
        registry.set(request, { text: "new" });
        yield* TestClock.adjust("100 millis");
        expect(interrupted).toEqual(["old"]);
        expect(Option.getOrThrow(AsyncResult.value(registry.get(state))).text).toBe("");
        registry.dispose();
        yield* TestClock.adjust("2 seconds");
        expect(interrupted).toEqual(["old", "new"]);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });

  it("preserves query failures instead of replacing them with a slow signal", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { registry, request, state } = yield* makeSearch((request) => {
          return request.text ? Stream.fail("unavailable") : Stream.succeed([]);
        });

        yield* TestClock.adjust(0);
        registry.set(request, { text: "bad" });
        yield* TestClock.adjust("100 millis");
        expect(AsyncResult.isFailure(registry.get(state))).toBe(true);
        yield* TestClock.adjust("2 seconds");
        expect(AsyncResult.isFailure(registry.get(state))).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
    );
  });
});

function makeSearch<E>(query: QueryEngine.Query<string, E>, initialText?: string) {
  return Effect.gen(function* () {
    const clock = yield* Clock.clockWith(Effect.succeed);
    const request = Atom.make<QueryEngine.Request>({ text: initialText ?? "" });

    const state = Atom.make((get) => {
      return MenuSearch.run({
        request: get(request),
        query,
        debounce: Option.isSome(get.self()),
      }).pipe(Stream.provideService(Clock.Clock, clock));
    });

    const registry = yield* Effect.acquireRelease(
      Effect.sync(() => {
        const registry = AtomRegistry.make();
        registry.mount(state);

        return registry;
      }),
      (registry) => Effect.sync(() => registry.dispose()),
    );

    return { registry, request, state };
  });
}
