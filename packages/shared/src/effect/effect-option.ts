import { Effect, Option } from "effect";
import { LibOption } from "./option.ts";

export const traverse =
  <A, B, E1, R1>(f: (value: A) => Effect.Effect<B, E1, R1>) =>
  <E, R>(self: Effect.Effect<Option.Option<A>, E, R>) =>
    self.pipe(Effect.flatMap(LibOption.mapEffect(f)));

export const getOrEffect =
  <B, E1, R1>(f: () => Effect.Effect<B, E1, R1>) =>
  <A, E, R>(self: Effect.Effect<Option.Option<A>, E, R>) =>
    self.pipe(
      Effect.flatMap((option): Effect.Effect<A | B, E1, R1> => {
        if (Option.isSome(option)) return Effect.succeed(option.value);

        return f();
      }),
    );

export const traverseOrElse =
  <A, B, C, E1, E2, R1, R2>(
    f: (value: A) => Effect.Effect<B, E1, R1>,
    orElse: () => Effect.Effect<C, E2, R2>,
  ) =>
  <E, R>(self: Effect.Effect<Option.Option<A>, E, R>) =>
    self.pipe(traverse(f), getOrEffect(orElse));

export * as EffectOption from "./effect-option.ts";
