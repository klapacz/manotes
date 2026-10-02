import { Effect } from "effect";
import * as Delete from "./delete";
import * as Provision from "./provision";
import * as Sync from "./sync";
import * as Unlock from "./unlock";
import * as Rename from "./rename";

export const deleteLocal = Effect.fn("GraphAccessCommandsActions.deleteLocal")(function* (
  localGraphId: string,
) {
  const service = yield* Delete.Service;
  yield* service.deleteLocal(localGraphId);
});

export type OpenCloudOnDeviceInput = Provision.OpenCloudOnDeviceInput;

export const openCloudOnDevice = Effect.fn("GraphAccessCommandsActions.openCloudOnDevice")(
  function* (opts: OpenCloudOnDeviceInput) {
    const service = yield* Provision.Service;

    return yield* service.openCloudOnDevice(opts);
  },
);

export type UploadInput = Sync.UploadInput;

export const upload = Effect.fn("GraphAccessCommandsActions.upload")(function* (opts: UploadInput) {
  const service = yield* Sync.Service;

  return yield* service.upload(opts);
});

export type DetachInput = Sync.DetachInput;

export const detach = Effect.fn("GraphAccessCommandsActions.detach")(function* (opts: DetachInput) {
  const service = yield* Sync.Service;

  return yield* service.detach(opts);
});

export type UnlockCloudGraphInput = Unlock.UnlockCloudGraphInput;

export const unlockCloudGraph = Effect.fn("GraphAccessCommandsActions.unlockCloudGraph")(function* (
  opts: UnlockCloudGraphInput,
) {
  const service = yield* Unlock.Service;

  return yield* service.unlockCloudGraph(opts);
});

export type RenameGraphInput = Rename.RenameGraphInput;

export const renameGraph = Effect.fn("GraphAccessCommandsActions.renameGraph")(function* (
  opts: RenameGraphInput,
) {
  const service = yield* Rename.Service;

  return yield* service.renameGraph(opts);
});
