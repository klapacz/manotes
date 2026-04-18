import { Effect, Option } from "effect";

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function makeLockHold() {
  // Returning a promise from the callback keeps the lock held until it resolves.
  const { promise: hold, resolve } = Promise.withResolvers<void>();
  const release = Effect.sync(() => resolve());
  return { hold, release };
}

export const acquireWebLock = Effect.fn("WebLock.acquire")(function* ({
  lockName,
  mode,
}: {
  lockName: string;
  mode: LockMode;
}) {
  return yield* Effect.acquireRelease(
    Effect.callback<Effect.Effect<void>>((resume, signal) => {
      navigator.locks
        .request(lockName, { mode, signal }, async (lock) => {
          if (!lock) {
            return resume(Effect.die(new Error(`Web Locks returned null lock for ${lockName}.`)));
          }

          const lockHold = makeLockHold();
          resume(Effect.succeed(lockHold.release));
          return lockHold.hold;
        })
        .catch((error) => {
          if (isAbortError(error)) return resume(Effect.interrupt);
          resume(Effect.die(error));
        });
    }),
    (release) => release,
  );
});

export const tryAcquireExclusiveWebLock = Effect.fn("WebLock.tryAcquire")(function* ({
  lockName,
}: {
  lockName: string;
}) {
  return yield* Effect.acquireRelease(
    Effect.callback<Option.Option<Effect.Effect<void>>>((resume) => {
      navigator.locks
        .request(lockName, { ifAvailable: true, mode: "exclusive" }, async (lock) => {
          if (!lock) return resume(Effect.succeed(Option.none()));

          const lockHold = makeLockHold();
          resume(Effect.succeed(Option.some(lockHold.release)));
          return lockHold.hold;
        })
        .catch((error) => {
          if (isAbortError(error)) return resume(Effect.interrupt);
          resume(Effect.die(error));
        });
    }),
    Option.match({
      onNone: () => Effect.void,
      onSome: (release) => release,
    }),
  );
});
