import { useRuntime } from "./runtime.primitives";
import { makeRtAtomFactory } from "./runtime-atom";

export const RtAtom = makeRtAtomFactory(() => useRuntime()().atom);
