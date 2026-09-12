import { Effect, Option } from "effect";

import { acquireWebLock, tryAcquireExclusiveWebLock } from "./web-lock";

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

/**
 * Non-blocking attempt to acquire a leadership lock.
 * Returns `"leader"` (lock held for scope lifetime) or `"follower"` (no lock).
 */
export function resolveRole(localGraphId: string) {
  const lockName = leadershipLockName(localGraphId);

  return Effect.map(
    tryAcquireExclusiveWebLock({ lockName }),
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
  const lockName = leadershipLockName(localGraphId);

  return acquireWebLock({ lockName, mode: "exclusive" });
}

export const leadershipLockName = (localGraphId: string) => `graph-worker-leader-${localGraphId}`;
