// https://github.com/kobaltedev/kobalte/blob/main/packages/utils/src/assertion.ts
// https://github.com/kobaltedev/kobalte/blob/main/packages/utils/src/events.ts

import { Predicate } from "effect";
import type { JSX } from "solid-js";

export { isFunction } from "effect/Predicate";

/** Call a JSX.EventHandlerUnion with the event. */
export const callHandler = <T, E extends Event>(
  event: E & { currentTarget: T; target: Element },
  handler: JSX.EventHandlerUnion<T, E> | undefined,
) => {
  if (handler) {
    if (Predicate.isFunction(handler)) {
      handler(event);
    } else {
      handler[0](handler[1], event);
    }
  }

  return event.defaultPrevented;
};
