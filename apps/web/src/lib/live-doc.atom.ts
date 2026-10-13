import { useAtomValue } from "@effect/atom-solid";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { Atom, AsyncResult } from "effect/reactivity";
import { createMemo, type Accessor } from "solid-js";
import { LiveDoc } from "./live-doc.service";
import { bindRt } from "./rt-atom";

export const byRecord = bindRt((rt) => {
  return Atom.family((recordId: NoteSchema.Id) => {
    return rt.subscriptionRef(LiveDoc.Service.use((service) => service.acquire({ recordId })));
  });
});

export function use(opts: { readonly recordId: Accessor<NoteSchema.Id> }) {
  const result = useAtomValue(() => byRecord()(opts.recordId()));

  return createMemo(() => {
    const current = result();

    if (AsyncResult.isSuccess(current)) return current.value;

    if (AsyncResult.isFailure(current)) {
      return LiveDoc.Doc.Error({ message: "Failed to load record." });
    }

    return LiveDoc.Doc.Loading();
  });
}

export * as LiveDocAtom from "./live-doc.atom";
