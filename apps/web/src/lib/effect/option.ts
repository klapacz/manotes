import { Effect, flow, Option } from "effect";

export const mapEffect =
  <A, B, E, R>(f: (value: A) => Effect.Effect<B, E, R>) =>
  (option: Option.Option<A>): Effect.Effect<Option.Option<B>, E, R> =>
    Option.match(option, {
      onNone: () => Effect.succeedNone,
      onSome: flow(f, Effect.asSome),
    });

export * as LibOption from "./option.ts";
