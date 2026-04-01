import { Layer, ManagedRuntime } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryRpc from "./remote-registry/rpc";

const GraphAccessLayer = Layer.merge(LocalRegistryLayer.Layer, RemoteRegistryRpc.Layer);
const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);
export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
