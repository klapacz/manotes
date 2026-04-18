import { Effect } from "effect";
import * as Runtime from "../runtime";
import * as Delete from "./delete";
import * as Provision from "./provision";
import * as Sync from "./sync";

export const deleteLocal = Runtime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.deleteLocal")(function* (localGraphId: string) {
    const service = yield* Delete.Service;
    yield* service.deleteLocal(localGraphId);
  }),
);

export type OpenCloudOnDeviceInput = Provision.OpenCloudOnDeviceInput;

export const openCloudOnDevice = Runtime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.openCloudOnDevice")(function* (opts: OpenCloudOnDeviceInput) {
    const service = yield* Provision.Service;
    return yield* service.openCloudOnDevice(opts);
  }),
);

export type UploadInput = Sync.UploadInput;

export const upload = Runtime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.upload")(function* (opts: UploadInput) {
    const service = yield* Sync.Service;
    return yield* service.upload(opts);
  }),
);

export type DetachInput = Sync.DetachInput;

export const detach = Runtime.atom.fn(
  Effect.fn("GraphAccessCommandsAtom.detach")(function* (opts: DetachInput) {
    const service = yield* Sync.Service;
    return yield* service.detach(opts);
  }),
);
