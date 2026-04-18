import { useGraph } from "./graph-access/graph-runtime/context";
import { makeRtAtomFactory } from "./runtime-atom";

export const RtAtom = makeRtAtomFactory(() => useGraph()().runtime.atom);
