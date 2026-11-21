import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { Attrs } from "@manotes/shared/attrs.service";
import { PropValidation } from "@manotes/shared/prop-validation";
import { Equal, Result, Stream } from "effect";
import { createMemo, type Accessor } from "solid-js";
import { useGraphStream } from "../../lib";

export function use(opts: {
  readonly state: Accessor<Attrs.ValueState<AttrsSchema.PropVal>>;
  readonly targets: Accessor<AttrsSchema.TargetFilter | undefined>;
}) {
  const input = createMemo(() => ({ state: opts.state(), targets: opts.targets() }), {
    equals: Equal.equals,
  });

  const validated = useGraphStream(() => {
    return PropValidation.watch(input()).pipe(
      Stream.map(Result.succeed),
      Stream.catchCause((cause) => Stream.succeed(Result.fail(cause))),
    );
  });

  const state = () => {
    const current = validated();

    return Result.isSuccess(current) ? current.success : input().state;
  };

  const error = () => {
    const current = validated();

    return Result.isFailure(current) ? current.failure : undefined;
  };

  return { state, error };
}

export * as PropState from "./prop-state";
