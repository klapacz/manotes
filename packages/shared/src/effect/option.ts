import { Effect, Option } from "effect";

export const mapEffect = <A, B, E, R>(f: (value: A) => Effect.Effect<B, E, R>) => {
  return (option: Option.Option<A>): Effect.Effect<Option.Option<B>, E, R> => {
    return Effect.transposeOption(Option.map(option, f));
  };
};

export * as LibOption from "./option.ts";
