import { Layer, ManagedRuntime } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as GraphDeletion from "./deletion/service";
import * as Promotion from "./promotion/service";
import * as KeyStoreService from "./key-store/service";
import * as GraphRuntime from "./graph-runtime";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryLayer from "./remote-registry/layer";

const GraphAccessLayer = Layer.mergeAll(
  LocalRegistryLayer.Layer,
  RemoteRegistryLayer.Layer,
  KeyStoreService.Service.layer,
  GraphRuntime.Manager.Service.layer,
  GraphDeletion.Service.layer,
  Promotion.Service.layer,
);
const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);
export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
