import { AsyncResult, Atom } from "effect/reactivity";

/** Ignores new calls while the atom is waiting so repeated clicks cannot replace an active job. */
export function ignoreWhileWaiting<Arg, A, E>(job: Atom.AtomResultFn<Arg, A, E>) {
  const action = job.pipe(Atom.setIdleTTL(0));

  return Atom.writable(
    (get) => get(action),
    (ctx, input: Arg) => {
      if (AsyncResult.isWaiting(ctx.get(action))) return;

      ctx.set(action, input);
    },
  ).pipe(Atom.setIdleTTL(0));
}

export * as AtomUtils from "./atom";
