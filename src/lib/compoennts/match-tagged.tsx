import { Show, type Accessor, type JSX } from "solid-js";
import { Types } from "effect";

interface MatchTaggedProps<
  E extends { _tag: string },
  K extends Types.Tags<E>,
> {
  value: E;
  tag: K;
  children: (value: Accessor<Types.ExtractTag<E, K>>) => JSX.Element;
}

export function MatchTagged<
  E extends { _tag: string },
  K extends Types.Tags<E>,
>(props: MatchTaggedProps<E, K>) {
  const value = () =>
    props.value._tag === props.tag
      ? (props.value as Types.ExtractTag<E, K>)
      : undefined;

  return <Show when={value()}>{(value) => props.children(value)}</Show>;
}
