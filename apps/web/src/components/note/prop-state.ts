import { useAtomValue } from "@effect/atom-solid";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { Attrs } from "@manotes/shared/attrs.service";
import { PropValidation } from "@manotes/shared/prop-validation";
import { Equal, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, type Accessor } from "solid-js";
import { bindRt, createSyncedAtom } from "../../lib";

export function use(opts: {
  readonly state: Accessor<Attrs.ValueState<AttrsSchema.PropVal>>;
  readonly targets: Accessor<AttrsSchema.TargetFilter | undefined>;
}) {
  const input = createMemo(() => ({ state: opts.state(), targets: opts.targets() }), undefined, {
    equals: Equal.equals,
  });

  const inputAtom = createSyncedAtom(input);

  const result = useAtomValue(
    bindRt((rt) =>
      rt.atom((get) => {
        const current = get(inputAtom);

        return PropValidation.watch(current).pipe(
          Stream.map((state) => ({ input: current, state })),
        );
      }),
    ),
  );

  const state = () => {
    const current = result();

    // An earlier value's scope result must not mark a replacement invalid.
    if (AsyncResult.isSuccess(current) && Equal.equals(current.value.input, input())) {
      return current.value.state;
    }

    return input().state;
  };

  const error = () => {
    const current = result();

    if (AsyncResult.isFailure(current)) return current.cause;

    return undefined;
  };

  return { state, error };
}

export * as PropState from "./prop-state";
