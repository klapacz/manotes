import { Layer, ManagedRuntime } from "effect";
import { Atom, AtomRegistry } from "effect/reactivity";
import { GraphAccessCommandsDelete } from "./commands/delete";
import { GraphAccessCommandsProvision } from "./commands/provision";
import { GraphAccessCommandsRename } from "./commands/rename";
import { GraphAccessCommandsSync } from "./commands/sync";
import { GraphAccessCommandsUnlock } from "./commands/unlock";
import { KeyStore } from "./key-store/service";
import { SessionService } from "./session/service";
import { GraphRuntime } from "./graph-runtime";
import { GraphAccessLocalRegistryLayer } from "./local-registry/layer";
import { RemoteRegistryService } from "./remote-registry/service";

export const registry = AtomRegistry.make({ defaultIdleTTL: 400 });

const GraphAccessLayer = Layer.mergeAll(
  GraphAccessLocalRegistryLayer.Layer,
  RemoteRegistryService.Service.layer,
  KeyStore.Service.layer,
  SessionService.Service.layer,
  GraphRuntime.Manager.Service.layer,
  GraphAccessCommandsDelete.Service.layer,
  GraphAccessCommandsProvision.Service.layer,
  GraphAccessCommandsRename.Service.layer,
  GraphAccessCommandsSync.Service.layer,
  GraphAccessCommandsUnlock.Service.layer,
).pipe(Layer.provideMerge(Layer.succeed(AtomRegistry.AtomRegistry, registry)));

const memoMap = Layer.makeMemoMapUnsafe();

export const atom = Atom.context({ memoMap })(GraphAccessLayer);

export const rt = ManagedRuntime.make(GraphAccessLayer, { memoMap });

export * as GraphAccessRuntime from "./runtime";
