import { Data } from "effect";

export class DisplayNameTakenError extends Data.TaggedError(
  "GraphRegistry.DisplayNameTakenError",
)<{
  displayName: string;
}> {}
