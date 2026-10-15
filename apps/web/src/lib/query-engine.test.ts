import { Deferred, Effect, Exit, Fiber, Option, Scope, Stream, SubscriptionRef } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { QueryEngine } from "./query-engine";
import { DateSuggestions } from "./date-suggestions";

describe("menu queries", () => {
  it("ranks exact labels and aliases ahead of prefixes and other matches", () => {
    const score = (label: string) => QueryEngine.score({ text: "date", label });
    expect(score("Date")).toBeGreaterThan(score("Date settings"));
    expect(score("Date settings")).toBeGreaterThan(score("Change date"));
    expect(QueryEngine.score({ text: "calendar", label: "Date", keywords: ["calendar"] })).toBe(1);
    expect(QueryEngine.score({ text: "zzzz", label: "Date" })).toBe(0);
  });

  it("shares a lookup across concurrent branches and keeps separate requests separate", async () => {
    let calls = 0;

    const notes = QueryEngine.share(() => {
      return Stream.fromEffect(
        Effect.gen(function* () {
          calls++;
          yield* Effect.sleep("10 millis");

          return [{ value: "Sleep log", score: 1 }];
        }),
      );
    });

    const query = QueryEngine.combine([
      QueryEngine.map(notes, (note) => `Links to: ${note}`),
      QueryEngine.map(notes, (note) => `Links from: ${note}`),
      QueryEngine.map(notes, (note) => `Open note: ${note}`),
    ]);

    const results = await read(query({ text: "Sleep" }));
    expect(calls).toBe(1);
    expect(results.map((match) => match.value)).toEqual([
      "Links to: Sleep log",
      "Links from: Sleep log",
      "Open note: Sleep log",
    ]);
    await read(query({ text: "Sleep" }));
    expect(calls).toBe(2);
  });

  it("interleaves tied results from children without overriding higher scores", async () => {
    const results = await read(
      QueryEngine.combine([
        () => {
          return Stream.succeed([
            { value: "to A", score: 0.1 },
            { value: "to B", score: 0.1 },
          ]);
        },
        () => {
          return Stream.succeed([
            { value: "from A", score: 0.1 },
            { value: "from B", score: 0.1 },
          ]);
        },
        () => Stream.succeed([{ value: "Date", score: 1 }]),
      ])({ text: "A" }),
    );

    expect(results.map((match) => match.value)).toEqual([
      "Date",
      "to A",
      "from A",
      "to B",
      "from B",
    ]);
  });

  it("interrupts shared work when its search is cancelled", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        let interrupted = 0;

        const notes = QueryEngine.share(() => {
          return Stream.fromEffect(
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);

              return yield* Effect.never;
            }).pipe(
              Effect.onInterrupt(() => {
                return Effect.sync(() => {
                  interrupted++;
                });
              }),
            ),
          );
        });

        const query = QueryEngine.combine([notes, notes]);

        const fiber = yield* Effect.forkChild(
          query({ text: "Sleep" }).pipe(Stream.scoped, Stream.runDrain),
        );

        yield* Deferred.await(started);
        yield* Fiber.interrupt(fiber);
        expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
        expect(interrupted).toBe(1);
      }),
    );
  });

  it("shares live updates and releases the source when the search closes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SubscriptionRef.make("Original");
        const initial = yield* Deferred.make<void>();
        const updated = yield* Deferred.make<void>();
        let subscriptions = 0;
        let releases = 0;

        const notes = QueryEngine.share(() => {
          return Stream.unwrap(
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  subscriptions++;
                }),
                () => {
                  return Effect.sync(() => {
                    releases++;
                  });
                },
              );

              return SubscriptionRef.changes(source).pipe(
                Stream.map((value) => [{ value, score: 1 }]),
              );
            }),
          );
        });

        const query = QueryEngine.combine([
          () => Stream.succeed([{ value: "Action", score: 1 }]),
          ...["To", "From", "Open"].map((label) => {
            return QueryEngine.map(notes, (note) => `${label}: ${note}`);
          }),
        ]);

        const fiber = yield* query({ text: "note" }).pipe(
          Stream.scoped,
          Stream.runForEach((matches) => {
            const values = matches.map((match) => match.value);

            if (
              values.includes("To: Updated") &&
              values.includes("From: Updated") &&
              values.includes("Open: Updated")
            ) {
              return Deferred.succeed(updated, undefined);
            }

            return Deferred.succeed(initial, undefined);
          }),
          Effect.forkChild,
        );

        yield* Deferred.await(initial);
        expect(subscriptions).toBe(1);
        yield* SubscriptionRef.set(source, "Updated");
        yield* Deferred.await(updated);
        expect(subscriptions).toBe(1);
        expect(releases).toBe(0);
        yield* Fiber.interrupt(fiber);
        expect(releases).toBe(1);
      }),
    );
  });

  it("keeps a shared source alive after an earlier child completes", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const source = yield* SubscriptionRef.make("Original");
        const initial = yield* Deferred.make<void>();
        const updated = yield* Deferred.make<void>();

        const notes = QueryEngine.share(() => {
          return SubscriptionRef.changes(source).pipe(Stream.map((value) => [{ value, score: 1 }]));
        });

        const query = QueryEngine.combine([
          (request) => notes(request).pipe(Stream.take(1)),
          notes,
        ]);

        const fiber = yield* query({ text: "note" }).pipe(
          Stream.scoped,
          Stream.runForEach((matches) => {
            return matches.some((match) => match.value === "Updated")
              ? Deferred.succeed(updated, undefined)
              : Deferred.succeed(initial, undefined);
          }),
          Effect.forkChild,
        );

        yield* Deferred.await(initial);
        yield* SubscriptionRef.set(source, "Updated");
        yield* Deferred.await(updated);
        yield* Fiber.interrupt(fiber);
      }),
    );
  });

  it("returns natural-language suggestions as well as semantic date choices", async () => {
    const tomorrow = await read(DateSuggestions.query({ text: "tomorrow" }));
    expect(tomorrow.map((match) => match.value.title)).toEqual(["Tomorrow"]);
    const natural = await read(DateSuggestions.query({ text: "two days ago" }));
    expect(natural).toHaveLength(1);
    expect(natural[0]?.value.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const defaults = await read(DateSuggestions.query({ text: "" }));
    expect(defaults.map((match) => match.value.title)).toEqual(["Tomorrow", "Today", "Yesterday"]);
  });
});

function read<T, E>(stream: Stream.Stream<T, E, Scope.Scope>) {
  return Effect.runPromise(
    stream.pipe(Stream.scoped, Stream.runHead, Effect.map(Option.getOrThrow)),
  );
}
