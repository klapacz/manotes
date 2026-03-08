/**
 * Defines domain errors raised while running the graph sync machine.
 */
import { Data } from "effect";
import * as Messages from "../contract/messages";
import * as Model from "./model";

export class LastCommitSeqMismatchError extends Data.TaggedError(
  "GraphSyncMachineLastCommitSeqMismatchError",
)<{
  expected: number;
  actual: number;
}> {
  get message(): string {
    return `Expected local cursor ${this.expected}, got ${this.actual}`;
  }
}

export class NextCommitSeqMismatchError extends Data.TaggedError(
  "GraphSyncMachineNextCommitSeqMismatchError",
)<{
  expected: number;
  actual: number;
}> {
  get message(): string {
    return `Expected next commit sequence ${this.expected}, got ${this.actual}`;
  }
}

export class CommittedEventConflictError extends Data.TaggedError(
  "GraphSyncMachineCommittedEventConflictError",
)<{
  eventId: string;
  expectedCommitSeq: number;
  actualCommitSeq: number;
}> {
  get message(): string {
    return `Event ${this.eventId} already committed as ${this.expectedCommitSeq}, got ${this.actualCommitSeq}`;
  }
}

export class DuplicateConnectError extends Data.TaggedError(
  "GraphSyncMachineDuplicateConnectError",
)<{
  stateTag: Model.State["_tag"];
}> {
  get message(): string {
    return `Received Connect while ${this.stateTag}`;
  }
}

export class UnexpectedServerMessageError extends Data.TaggedError(
  "GraphSyncMachineUnexpectedServerMessageError",
)<{
  stateTag: Model.State["_tag"];
  messageTag: Messages.ServerMessage["_tag"];
}> {
  get message(): string {
    return `Received ${this.messageTag} while ${this.stateTag}`;
  }
}

export class SocketClosedError extends Data.TaggedError(
  "GraphSyncMachineSocketClosedError",
)<{}> {
  get message(): string {
    return "Graph sync socket closed";
  }
}
