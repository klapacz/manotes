import { Data, Effect } from "effect";

export class Error extends Data.TaggedClass("Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedClass("NotFoundError")<{
  cause: DOMException;
}> {}

export const getFileHandleFromOpfsRoot = Effect.fn("OpfsService.getFileHandleFromOpfsRoot")(
  (path: string, options: FileSystemGetFileOptions = {}) =>
    Effect.tryPromise({
      async try() {
        const { directory, name } = await parentDirectory(path, options.create);

        return directory.getFileHandle(name, options);
      },
      catch: fromError,
    }),
);

export const readFileFromOpfsRoot = Effect.fn("OpfsService.readFileFromOpfsRoot")(function* (
  path: string,
) {
  const handle = yield* getFileHandleFromOpfsRoot(path);

  return yield* Effect.tryPromise({ try: () => handle.getFile(), catch: fromError });
});

export const writeFileToOpfsRoot = Effect.fn("OpfsService.writeFileToOpfsRoot")(function* (
  path: string,
  blob: Blob,
) {
  const handle = yield* getFileHandleFromOpfsRoot(path, { create: true });
  yield* Effect.tryPromise({
    async try() {
      const writer = await handle.createWritable();

      try {
        await writer.write(blob);
        await writer.close();
      } catch (error) {
        await writer.abort().catch(() => {});
        throw error;
      }
    },
    catch: fromError,
  });
});

export const removeEntryFromOpfsRoot = Effect.fn("OpfsService.removeEntryFromOpfsRoot")(
  (path: string, options: FileSystemRemoveOptions = {}) =>
    Effect.tryPromise({
      async try() {
        const { directory, name } = await parentDirectory(path);
        await directory.removeEntry(name, options);
      },
      catch: fromError,
    }),
);

async function parentDirectory(path: string, create = false) {
  const separator = path.lastIndexOf("/");
  const name = path.slice(separator + 1);
  const segments = separator === -1 ? [] : path.slice(0, separator).split("/");
  let directory = await navigator.storage.getDirectory();

  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create });
  }

  return { directory, name };
}

function fromError(cause: unknown) {
  return cause instanceof DOMException && cause.name === "NotFoundError"
    ? new NotFoundError({ cause })
    : new Error({ cause });
}

export * as OPFS from "./opfs.service";
