import { Effect } from "effect";
import { nanoid } from "nanoid";
import { OPFS } from "../opfs.service";

export const MAX_BYTES = 24_000_000;

export const MAX_DURATION_MS = 10 * 60_000;

export function newPath(mimeType: string) {
  const extension = mimeType.startsWith("audio/mp4") ? "m4a" : "webm";

  return `${nanoid()}.${extension}`;
}

export const save = Effect.fn("AudioMemoFiles.save")(function* (
  graphId: string,
  path: string,
  blob: Blob,
) {
  if (blob.size === 0 || blob.size > MAX_BYTES) {
    return yield* Effect.fail(new Error("Recording is empty or exceeds the upload limit."));
  }

  yield* OPFS.writeFileToOpfsRoot(`recordings/${graphId}/${path}`, blob);
});

export const read = Effect.fn("AudioMemoFiles.read")((graphId: string, path: string) =>
  OPFS.readFileFromOpfsRoot(`recordings/${graphId}/${path}`),
);

export const remove = Effect.fn("AudioMemoFiles.remove")((graphId: string, path: string) =>
  OPFS.removeEntryFromOpfsRoot(`recordings/${graphId}/${path}`).pipe(
    Effect.catchTag("NotFoundError", () => Effect.void),
  ),
);

export const removeGraph = Effect.fn("AudioMemoFiles.removeGraph")((graphId: string) =>
  OPFS.removeEntryFromOpfsRoot(`recordings/${graphId}`, { recursive: true }).pipe(
    Effect.catchTag("NotFoundError", () => Effect.void),
  ),
);

export * as AudioMemoFiles from "./files";
