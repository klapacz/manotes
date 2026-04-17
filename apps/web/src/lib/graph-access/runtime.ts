import { Layer, ManagedRuntime } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as KeyStoreService from "./key-store/service";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryLayer from "./remote-registry/layer";

const GraphAccessLayer = Layer.mergeAll(
  LocalRegistryLayer.Layer,
  RemoteRegistryLayer.Layer,
  KeyStoreService.Service.layer,
);
const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);
export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
