import * as GraphEncryption from "./graph-encryption";
import { Schema } from "effect";

// TODO: share this Schema between frontend and backend
export const DisplayNameSchema = Schema.Trim.pipe(Schema.nonEmptyString());

export const GraphSchema = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelopeSchema,
});

export type Graph = Schema.Schema.Type<typeof GraphSchema>;
const CreateGraphRequestSchema = Schema.Struct({
  displayName: DisplayNameSchema,
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelopeSchema,
});

export class DisplayNameTakenError extends Error {
  constructor() {
    super("A graph with that name already exists.");
  }
}

export async function listGraphs(): Promise<ReadonlyArray<Graph>> {
  const response = await fetch("/api/graphs");

  if (!response.ok) {
    throw new Error(`Failed to load graphs (${response.status})`);
  }

  const json = await response.json();

  return Schema.decodeUnknownPromise(Schema.Array(GraphSchema))(json);
}

export async function createGraph({
  displayName,
  graphKeyEnvelope,
}: {
  displayName: string;
  graphKeyEnvelope: GraphEncryption.GraphKeyEnvelope;
}): Promise<Graph> {
  const encodedBody = Schema.encodeSync(CreateGraphRequestSchema)({
    displayName,
    graphKeyEnvelope,
  });

  const response = await fetch("/api/graphs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(encodedBody),
  });

  if (response.status === 409) {
    throw new DisplayNameTakenError();
  }

  if (!response.ok) {
    throw new Error(`Failed to create graph (${response.status})`);
  }

  const json = await response.json();

  return Schema.decodeUnknownPromise(GraphSchema)(json);
}
