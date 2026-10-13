import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { EffectStream } from "./stream";

describe("zipLatestRecord", () => {
  it("emits an empty record when there are no inputs", async () => {
    const values = await Effect.runPromise(
      EffectStream.zipLatestRecord({}).pipe(Stream.runCollect),
    );

    expect(values).toEqual([{}]);
  });

  it("preserves field types and emits the latest values under their original keys", async () => {
    const stream = EffectStream.zipLatestRecord({
      count: Stream.make(1, 2, 3).pipe(Stream.rechunk(1)),
      title: Stream.succeed("Task"),
    }) satisfies Stream.Stream<{ readonly count: number; readonly title: string }>;

    const values = await Effect.runPromise(Stream.runCollect(stream));
    expect(values).toEqual([
      { count: 1, title: "Task" },
      { count: 2, title: "Task" },
      { count: 3, title: "Task" },
    ]);
  });

  it("releases every input subscription when the combined stream stops", async () => {
    const released: string[] = [];

    const watch = (key: string) =>
      Stream.succeed(key).pipe(
        Stream.concat(Stream.never),
        Stream.ensuring(
          Effect.sync(() => {
            released.push(key);
          }),
        ),
      );

    await Effect.runPromise(
      EffectStream.zipLatestRecord({ left: watch("left"), right: watch("right") }).pipe(
        Stream.take(1),
        Stream.runDrain,
      ),
    );
    expect(released.sort()).toEqual(["left", "right"]);
  });

  it("preserves failures from its inputs", async () => {
    const stream = EffectStream.zipLatestRecord({
      value: Stream.succeed(1),
      broken: Stream.fail("unavailable"),
    }) satisfies Stream.Stream<{ readonly value: number; readonly broken: never }, string>;

    const error = await Effect.runPromise(Stream.runDrain(stream).pipe(Effect.flip));
    expect(error).toBe("unavailable");
  });
});
