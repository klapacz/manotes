import { Data, Effect, Option, Scope } from "effect";

// ============================================================================
// Leader Election via Web Locks API
// ============================================================================
//
// Ensures only ONE tab per graph creates a Dedicated Worker.
// Other tabs wait in queue for leadership failover.
//
// Flow:
//   Tab A opens  -> acquires lock -> becomes leader -> creates Dedicated Worker
//   Tab B opens  -> lock unavailable -> becomes follower -> waits for lock
//   Tab A closes -> lock released -> Tab B acquires -> becomes leader
//
// Testing:
//   1. Open app in browser with DevTools console
//   2. Look for "[Leader] This tab is now leader for: <graph>"
//   3. Open second tab - should see "[Follower] Waiting for leadership"
//   4. Close first tab - second tab should become leader
//   5. Inspect locks: `await navigator.locks.query()` in console
//
// ============================================================================

class LeadershipLock extends Data.Class<{
  release: Effect.Effect<void>;
}> {}

/**
 * Non-blocking attempt to acquire a leadership lock.
 * Returns `"leader"` (lock held for scope lifetime) or `"follower"` (no lock).
 */
export function resolveRole(localGraphId: string) {
  const lockName = `graph-worker-leader-${localGraphId}`;
  return Effect.map(
    tryAcquireLeadershipLock(lockName),
    Option.match({
      onNone: () => "follower" as const,
      onSome: () => "leader" as const,
    }),
  );
}

/**
 * Blocks until the leadership lock for `localGraphId` becomes available,
 * then acquires it. Returns the lock handle on success.
 */
export function waitForLeadership(localGraphId: string) {
  const lockName = `graph-worker-leader-${localGraphId}`;
  return acquireLeadershipLock(lockName);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function makeLockHold() {
  // Returning a promise from the callback keeps the lock held until it resolves.
  const { promise: hold, resolve } = Promise.withResolvers<void>();
  const release = Effect.sync(() => resolve());
  return { hold, release };
}

function tryAcquireLeadershipLock(
  lockName: string,
): Effect.Effect<Option.Option<LeadershipLock>, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.callback<Option.Option<LeadershipLock>>((resume) => {
      // Multiple completion paths can race (callback + abort/rejection).
      // Effect.async ignores additional resume calls, so we can safely "try" to
      // resume in each path without adding extra guards.

      // `ifAvailable` is non-blocking and must not be used with AbortSignal.
      navigator.locks
        .request(lockName, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resume(Effect.succeed(Option.none()));
            return;
          }

          const lockHold = makeLockHold();
          resume(Effect.succeed(Option.some(new LeadershipLock({ release: lockHold.release }))));
          return lockHold.hold;
        })
        .catch((error) => {
          // Abort signals map to Effect interruption; unexpected errors should surface.
          if (isAbortError(error)) {
            resume(Effect.interrupt);
            return;
          }
          resume(Effect.die(error));
        });
    }),
    Option.match({
      onNone: () => Effect.void,
      onSome: (lock) => lock.release,
    }),
  );
}

function acquireLeadershipLock(
  lockName: string,
): Effect.Effect<LeadershipLock, never, Scope.Scope> {
  return Effect.acquireRelease(
    Effect.callback<LeadershipLock>((resume, signal) => {
      // Blocking variant: waits in queue and supports interruption.
      navigator.locks
        .request(lockName, { signal }, async (lock) => {
          if (!lock) {
            resume(
              Effect.die(
                new Error("Web Locks returned null lock for blocking leadership request."),
              ),
            );
            return;
          }

          const lockHold = makeLockHold();
          resume(Effect.succeed(new LeadershipLock({ release: lockHold.release })));
          return lockHold.hold;
        })
        .catch((error) => {
          if (isAbortError(error)) {
            resume(Effect.interrupt);
            return;
          }
          resume(Effect.die(error));
        });
    }),
    (lock) => lock.release,
  );
}
