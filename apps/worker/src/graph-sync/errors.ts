import { Data } from "effect";

export class ProtocolViolationError extends Data.TaggedError("GraphSyncProtocolViolationError")<{
  reason: string;
}> {
  get message(): string {
    return this.reason;
  }
}
