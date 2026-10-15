import { Array, Predicate, Record, Reducer } from "effect";
import { AttrsSchema } from "./attrs.schema";

export type Expect = {
  readonly propId: AttrsSchema.NoteId;
  readonly ruleId: AttrsSchema.NoteId;
  readonly expectation: AttrsSchema.RuleExpectation;
};

export function reduceExpects(
  expects: readonly Expect[],
): Readonly<Record<AttrsSchema.NoteId, AttrsSchema.RuleExpectation>> {
  return createReducer().combineAll(
    Array.map(expects, (expect) => Record.singleton(expect.propId, expect.expectation)),
  );
}

// Optional is neutral; one required expectation wins regardless of rule order.
const ExpectationReducer = Reducer.make<AttrsSchema.RuleExpectation>((left, right) => {
  if (Predicate.isTagged(left, "required")) {
    return left;
  }

  return right;
}, AttrsSchema.RuleExpectation.cases.optional.make({}));

export function createReducer() {
  // Each reduction owns its empty record, which may later be adopted by a mutable UI store.
  return Record.makeReducerUnion<AttrsSchema.NoteId, AttrsSchema.RuleExpectation>(
    ExpectationReducer,
  );
}

export * as RuleExpect from "./rule-expect";
