import { Query, type Scalar, type Type } from "effect-qb";

type Predicate<Source extends string> = Scalar.Scalar<
  boolean,
  ReturnType<typeof Type.boolean>,
  Scalar.Nullability,
  "standard",
  "scalar",
  Source
>;

/**
 * Groups OR predicates into a shallow tree so large lists stay below SQLite's
 * expression depth limit. `Query.orAll` preserves the groups, while `Query.or`
 * flattens nested OR expressions into a chain.
 */
export function orAllBalanced<Source extends string>(
  predicates: readonly Predicate<Source>[],
): Predicate<Source> {
  if (predicates.length < 2) return Query.orAll(predicates);

  const middle = Math.floor(predicates.length / 2);

  return Query.orAll([
    orAllBalanced(predicates.slice(0, middle)),
    orAllBalanced(predicates.slice(middle)),
  ]);
}

export * as DBPredicates from "./db.predicates.internal";
