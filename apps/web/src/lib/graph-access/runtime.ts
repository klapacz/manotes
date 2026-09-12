import { Layer, ManagedRuntime } from "effect";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import * as CommandsDelete from "./commands/delete";
import * as CommandsProvision from "./commands/provision";
import * as CommandsRename from "./commands/rename";
import * as CommandsSync from "./commands/sync";
import * as CommandsUnlock from "./commands/unlock";
import * as KeyStoreService from "./key-store/service";
import * as SessionService from "./session/service";
import * as GraphRuntime from "./graph-runtime";
import * as LocalRegistryLayer from "./local-registry/layer";
import * as RemoteRegistryService from "./remote-registry/service";

export const registry = AtomRegistry.make({ defaultIdleTTL: 400 });

const GraphAccessLayer = Layer.mergeAll(
  LocalRegistryLayer.Layer,
  RemoteRegistryService.Service.layer,
  KeyStoreService.Service.layer,
  SessionService.Service.layer,
  GraphRuntime.Manager.Service.layer,
  CommandsDelete.Service.layer,
  CommandsProvision.Service.layer,
  CommandsRename.Service.layer,
  CommandsSync.Service.layer,
  CommandsUnlock.Service.layer,
).pipe(Layer.provideMerge(Layer.succeed(AtomRegistry.AtomRegistry, registry)));

const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);

export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });
