import { Schema } from "effect";

export class ProtocolViolationError extends Schema.TaggedErrorClass<ProtocolViolationError>()(
  "GraphSyncProtocolViolationError",
  { reason: Schema.String },
) {
  get message(): string {
    return this.reason;
  }
}
