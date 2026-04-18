import { Effect } from "effect";

import { acquireWebLock } from "../../web-lock";

export const acquireShared = Effect.fn("GraphAccessGraphRuntimeLock.acquireShared")(function* (
  localGraphId: string,
) {
  return yield* acquireWebLock({
    lockName: runtimeLockName(localGraphId),
    mode: "shared",
  });
});

export const acquireExclusive = Effect.fn("GraphAccessGraphRuntimeLock.acquireExclusive")(
  function* (localGraphId: string) {
    return yield* acquireWebLock({
      lockName: runtimeLockName(localGraphId),
      mode: "exclusive",
    });
  },
);

export const runtimeLockName = (localGraphId: string) => `graph-runtime-${localGraphId}`;
