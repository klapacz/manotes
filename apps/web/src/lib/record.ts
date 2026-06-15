import { Predicate, Record, Result } from "effect";

export const omitUndefinedDeep = (value: unknown): unknown => {
  if (!Predicate.isObject(value)) return value;

  return Record.filterMap(value as Record<string, unknown>, (child) =>
    child === undefined ? Result.failVoid : Result.succeed(omitUndefinedDeep(child)),
  );
};

export * as LibRecord from "./record";
