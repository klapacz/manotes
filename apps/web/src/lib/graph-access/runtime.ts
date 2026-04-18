import { Layer, ManagedRuntime } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as CommandsDelete from "./commands/delete";
import * as CommandsProvision from "./commands/provision";
import * as CommandsSync from "./commands/sync";
import * as KeyStoreService from "./key-store/service";
import * as GraphRuntime from "./graph-runtime";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryLayer from "./remote-registry/layer";

const GraphAccessLayer = Layer.mergeAll(
  LocalRegistryLayer.Layer,
  RemoteRegistryLayer.Layer,
  KeyStoreService.Service.layer,
  GraphRuntime.Manager.Service.layer,
  CommandsDelete.Service.layer,
  CommandsProvision.Service.layer,
  CommandsSync.Service.layer,
);
const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);
export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
