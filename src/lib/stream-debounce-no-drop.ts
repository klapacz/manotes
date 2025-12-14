import {
  Chunk,
  Duration,
  Effect,
  FiberHandle,
  Mailbox,
  Queue,
  Stream,
} from "effect";

export function streamDebounceNoDrop(duration: Duration.DurationInput) {
  return function <A, E, R>(stream: Stream.Stream<A, E, R>) {
    return Effect.gen(function* () {
      const groupQueue = yield* Queue.unbounded<A>();
      const mailbox = yield* Mailbox.make<Chunk.Chunk<A>, E>();

      const flush = Effect.gen(function* () {
        const chunk = yield* Queue.takeAll(groupQueue);
        if (Chunk.isNonEmpty(chunk)) {
          yield* mailbox.offer(chunk);
        }
      });

      const scheduledFlushHandle = yield* FiberHandle.make();
      const scheduleFlush = Effect.gen(function* () {
        yield* Effect.sleep(duration);
        yield* flush;
      }).pipe(FiberHandle.run(scheduledFlushHandle));

      yield* stream.pipe(
        Stream.runForEach(
          Effect.fn(function* (element) {
            yield* scheduleFlush;
            yield* Queue.offer(groupQueue, element);
          }),
        ),
        Effect.onExit(
          Effect.fn(function* (exit) {
            yield* FiberHandle.clear(scheduledFlushHandle);
            yield* flush;
            yield* mailbox.done(exit);
          }),
        ),
        Effect.forkScoped,
      );

      return Mailbox.toStream(mailbox);
    }).pipe(Stream.unwrapScoped);
  };
}
