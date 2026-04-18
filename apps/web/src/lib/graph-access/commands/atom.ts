import { Effect } from "effect";
import * as Runtime from "../runtime";
import * as Delete from "./delete";

export const deleteLocal = Runtime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.deleteLocal")(function* (localGraphId: string) {
    const service = yield* Delete.Service;
    yield* service.deleteLocal(localGraphId);
  }),
);
