import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { type Graph } from "@manotes/shared/graph-registry/contract";
import * as GraphAccessRuntime from "../runtime";
import * as RemoteRegistryService from "./service";

export type { Graph };

// Share one RPC client across graph-access atoms to avoid multiple competing run loops.
export const atom = GraphAccessRuntime.atom
  .atom(
    Effect.gen(function* () {
      return yield* RemoteRegistryService.Service;
    }),
  )
  .pipe(Atom.keepAlive);
