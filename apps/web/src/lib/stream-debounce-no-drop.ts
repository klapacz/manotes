import {
  Cause,
  Chunk,
  Duration,
  Effect,
  Exit,
  FiberHandle,
  Queue,
  Ref,
  Stream,
  Option,
  Result,
} from "effect";

export function streamDebounceNoDrop<A>(
  duration: Duration.Input,
  onFinalize?: (remaining: Chunk.NonEmptyChunk<A>) => Effect.Effect<void>,
) {
  return function <E, R>(stream: Stream.Stream<A, E, R>) {
    return Effect.gen(function* () {
      const collected = yield* Ref.make(Chunk.empty<A>());
      const mailbox = yield* Queue.make<Chunk.NonEmptyChunk<A>, E | Cause.Done>();

      const offerIfNonEmpty = Effect.fnUntraced(function* (chunk: Chunk.Chunk<A>) {
        if (Chunk.isNonEmpty(chunk)) yield* Queue.offer(mailbox, chunk);
      });

      const flush = Effect.uninterruptible(
        Effect.gen(function* () {
          const chunk = yield* Ref.getAndSet(collected, Chunk.empty());
          yield* offerIfNonEmpty(chunk);
        }),
      );

      const scheduledFlushHandle = yield* FiberHandle.make();
      const scheduleFlush = Effect.gen(function* () {
        yield* Effect.sleep(duration);
        yield* flush;
      }).pipe(FiberHandle.run(scheduledFlushHandle));

      yield* stream.pipe(
        Stream.runForEach(
          Effect.fn(function* (element) {
            yield* Ref.update(collected, Chunk.append(element));
            yield* scheduleFlush;
          }),
        ),
        Effect.onExit(
          Effect.fn(function* (exit) {
            yield* FiberHandle.clear(scheduledFlushHandle);
            const remaining = yield* Ref.get(collected);

            const cause = Exit.getCause(exit);

            if (Option.isNone(cause)) {
              yield* offerIfNonEmpty(remaining);
              return yield* Queue.end(mailbox);
            }

            const result = Cause.findInterrupt(cause.value);

            if (Chunk.isNonEmpty(remaining) && onFinalize && !Result.isFailure(result)) {
              yield* onFinalize(remaining).pipe(Effect.uninterruptible);
            } else {
              yield* offerIfNonEmpty(remaining);
            }

            yield* Queue.failCause(mailbox, cause.value);
          }),
        ),
        Effect.forkScoped,
      );

      return Stream.fromQueue(mailbox);
    }).pipe(Stream.unwrap);
  };
}
