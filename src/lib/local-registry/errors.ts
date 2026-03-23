import { Data } from "effect";

export class DisplayNameTakenError extends Data.TaggedError(
  "LocalRegistry.DisplayNameTakenError",
)<{
  displayName: string;
}> {}
