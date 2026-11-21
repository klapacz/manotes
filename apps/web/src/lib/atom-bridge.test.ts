import { Cause, Deferred, Effect, PubSub, Stream } from "effect";
import { createEffect, createMemo, createRoot, createSignal, flush, resolve } from "solid-js";
import { expect, it } from "vite-plus/test";
import { createEffectStream, EffectFailure } from "./atom-bridge";

const runtime = { runFork: Effect.runFork };

it("resolves the first stream emission and streams subsequent updates", async () => {
  const pubsub = Effect.runSync(PubSub.unbounded<string>());

  const { value, dispose } = createRoot((dispose) => {
    const value = createEffectStream(
      () => runtime,
      () => Stream.fromPubSub(pubsub),
    );

    return { value, dispose };
  });

  try {
    const first = resolve(() => value());
    await Effect.runPromise(PubSub.publish(pubsub, "alpha"));
    expect(await first).toBe("alpha");

    await Effect.runPromise(PubSub.publish(pubsub, "beta"));
    await Effect.runPromise(Effect.sleep("10 millis"));
    flush();
    expect(value()).toBe("beta");
  } finally {
    dispose();
  }
});

it("keeps key and stream value consistent across transitions and interrupts old fibers", async () => {
  const gates = {
    a: Deferred.makeUnsafe<string>(),
    b: Deferred.makeUnsafe<string>(),
  };

  const interrupted: string[] = [];
  const observed: Array<readonly [string, string]> = [];

  const { setKey, combined, dispose } = createRoot((dispose) => {
    const [key, setKey] = createSignal<"a" | "b">("a");

    const value = createEffectStream(
      () => runtime,
      () => {
        const current = key();

        return Stream.unwrap(
          Effect.gen(function* () {
            const resolved = yield* Deferred.await(gates[current]);

            return Stream.concat(Stream.succeed(resolved), Stream.never).pipe(
              Stream.ensuring(Effect.sync(() => interrupted.push(current))),
            );
          }),
        );
      },
    );

    const combined = createMemo(() => [key(), value()] as const);

    createEffect(combined, (pair) => {
      observed.push(pair);
    });

    return { setKey, combined, dispose };
  });

  try {
    const first = resolve(() => combined());
    Effect.runSync(Deferred.succeed(gates.a, "value-a"));
    expect(await first).toEqual(["a", "value-a"]);

    setKey("b");
    flush();
    expect(combined()).toEqual(["a", "value-a"]);

    const second = resolve(() => combined());
    Effect.runSync(Deferred.succeed(gates.b, "value-b"));
    expect(await second).toEqual(["b", "value-b"]);

    expect(observed).toEqual([
      ["a", "value-a"],
      ["b", "value-b"],
    ]);
    expect(interrupted).toContain("a");
  } finally {
    dispose();
  }

  await Effect.runPromise(Effect.sleep("10 millis"));
  expect(interrupted).toContain("b");
});

it("propagates stream failures as EffectFailure", async () => {
  const { value, dispose } = createRoot((dispose) => {
    const value = createEffectStream(
      () => runtime,
      () => Stream.fail("boom"),
    );

    return { value, dispose };
  });

  try {
    const failure = await resolve(() => value()).catch((caught) => caught);
    expect(failure).toBeInstanceOf(EffectFailure);
    expect(failure instanceof EffectFailure ? Cause.pretty(failure.cause) : "").toContain("boom");
  } finally {
    dispose();
  }
});
