import { Schema } from "effect";

export class ProtocolViolationError extends Schema.TaggedError<ProtocolViolationError>()(
  "GraphSyncProtocolViolationError",
  { reason: Schema.String },
) {
  get message(): string {
    return this.reason;
  }
}
