import { Effect } from "effect";
import { GraphAccessRuntime } from "../runtime";
import { GraphAccessCommandsDelete } from "./delete";
import { GraphAccessCommandsProvision } from "./provision";
import { GraphAccessCommandsSync } from "./sync";
import { GraphAccessCommandsUnlock } from "./unlock";
import { GraphAccessCommandsRename } from "./rename";

export const deleteLocal = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.deleteLocal")(function* (localGraphId: string) {
    const service = yield* GraphAccessCommandsDelete.Service;
    yield* service.deleteLocal(localGraphId);
  }),
);

export type OpenCloudOnDeviceInput = GraphAccessCommandsProvision.OpenCloudOnDeviceInput;

export const openCloudOnDevice = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.openCloudOnDevice")(function* (opts: OpenCloudOnDeviceInput) {
    const service = yield* GraphAccessCommandsProvision.Service;

    return yield* service.openCloudOnDevice(opts);
  }),
);

export type UploadInput = GraphAccessCommandsSync.UploadInput;

export const upload = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.upload")(function* (opts: UploadInput) {
    const service = yield* GraphAccessCommandsSync.Service;

    return yield* service.upload(opts);
  }),
);

export type DetachInput = GraphAccessCommandsSync.DetachInput;

export const detach = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.detach")(function* (opts: DetachInput) {
    const service = yield* GraphAccessCommandsSync.Service;

    return yield* service.detach(opts);
  }),
);

export type UnlockCloudGraphInput = GraphAccessCommandsUnlock.UnlockCloudGraphInput;

export const unlockCloudGraph = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.unlockCloudGraph")(function* (opts: UnlockCloudGraphInput) {
    const service = yield* GraphAccessCommandsUnlock.Service;

    return yield* service.unlockCloudGraph(opts);
  }),
);

export type RenameGraphInput = GraphAccessCommandsRename.RenameGraphInput;

export const renameGraph = GraphAccessRuntime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.renameGraph")(function* (opts: RenameGraphInput) {
    const service = yield* GraphAccessCommandsRename.Service;

    return yield* service.renameGraph(opts);
  }),
);
