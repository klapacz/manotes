import { Match } from "effect";
import type { Record } from "./schema";

// TODO: Consider moving UI-facing labels out of local-registry if we accumulate more presentation-only helpers.
export const graphMode = Match.type<Record["mode"]>().pipe(
  Match.when("cloud", () => "Synced"),
  Match.when("local", () => "Local"),
  Match.exhaustive,
);
