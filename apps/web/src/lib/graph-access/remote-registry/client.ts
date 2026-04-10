import { Atom } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import { GraphRegistryRpc, type Graph } from "@manotes/shared/graph-registry/contract";
import * as GraphAccessRuntime from "../runtime";

export type { Graph };

// Share one RPC client across graph-access atoms to avoid multiple competing run loops.
export const atom = GraphAccessRuntime.atom
  .atom(RpcClient.make(GraphRegistryRpc))
  .pipe(Atom.keepAlive);
