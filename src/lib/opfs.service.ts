import { Data, Effect } from "effect";

export class Error extends Data.TaggedClass("Error")<{ cause: unknown }> {}

export class NotFoundError extends Data.TaggedClass("NotFoundError")<{
  cause: DOMException;
}> {}

export const getFileHandleFromOpfsRoot = Effect.fn("getFileHandleFromOpfsRoot")(
  function* (fileName: string) {
    return yield* Effect.tryPromise({
      async try() {
        const opfsRoot = await navigator.storage.getDirectory();
        const fileHandle = await opfsRoot.getFileHandle(fileName);

        return fileHandle;
      },
      catch(cause) {
        if (cause instanceof DOMException && cause.name === "NotFoundError") {
          return new NotFoundError({ cause });
        }
        return new Error({ cause });
      },
    });
  },
);
