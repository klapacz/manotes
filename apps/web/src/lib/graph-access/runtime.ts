import { Layer, ManagedRuntime } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryLayer from "./remote-registry/layer";

const GraphAccessLayer = Layer.merge(LocalRegistryLayer.Layer, RemoteRegistryLayer.Layer);
const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);
export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
