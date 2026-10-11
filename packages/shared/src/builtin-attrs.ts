import { Array, Option } from "effect";
import { NoteSchema } from "./note.schema";
import { AttrsSchema } from "./attrs.schema";
import type { PropRecordRepo } from "./prop-record.repo";

export const archivedId = NoteSchema.Id.make("builtin:archived");

export const archived = {
  id: archivedId,
  title: "Archived",
  prop_type: "bool",
  prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
} satisfies PropRecordRepo.Def<"bool">;

export const defs: readonly PropRecordRepo.Def[] = [archived];

export function find(id: string) {
  return Array.findFirst(defs, (def) => def.id === id);
}

export function isBuiltin(id: string) {
  return Option.isSome(find(id));
}

export * as BuiltinAttrs from "./builtin-attrs";
