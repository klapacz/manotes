import { Schema } from "effect";

// TODO: share this Schema between frontend and backend
export const DisplayNameSchema = Schema.Trim.pipe(Schema.nonEmptyString());

export const GraphSchema = Schema.Struct({
  graphId: Schema.NonEmptyString,
  displayName: DisplayNameSchema,
  createdAt: Schema.NonEmptyString,
});

export type Graph = typeof GraphSchema.Type;

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

export async function createGraph(displayName: string): Promise<Graph> {
  const normalizedDisplayName =
    await Schema.decodeUnknownPromise(DisplayNameSchema)(displayName);

  const response = await fetch("/api/graphs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      displayName: normalizedDisplayName,
    }),
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
