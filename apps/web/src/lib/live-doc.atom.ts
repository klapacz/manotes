import { useAtomResource, useAtomValue } from "./atom-solid";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { Stream } from "effect";
import { Atom, AsyncResult } from "effect/reactivity";
import { createMemo, type Accessor } from "solid-js";
import { LiveDoc } from "./live-doc.service";
import { bindRt } from "./rt-atom";

export const byRecord = bindRt((rt) => {
  return Atom.family((recordId: RecordSchema.Id) => {
    return rt.subscriptionRef(LiveDoc.Service.use((service) => service.acquire({ recordId })));
  });
});

export const readyByRecord = bindRt((rt) => {
  return Atom.family((recordId: RecordSchema.Id) => {
    const state = byRecord()(recordId);

    return rt.atom((get) => {
      return get.streamResult(state).pipe(
        Stream.switchMap((doc) => {
          return LiveDoc.Doc.$match(doc, {
            Loading: () => Stream.never,
            Ready: ({ doc }) => Stream.succeed(doc),
            Error: ({ message }) => Stream.fail(new Error(message)),
          });
        }),
      );
    });
  });
});

export function use(opts: { readonly recordId: Accessor<RecordSchema.Id> }) {
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

export function useDoc(opts: { readonly recordId: Accessor<RecordSchema.Id> }) {
  const [doc] = useAtomResource(() => readyByRecord()(opts.recordId()));

  return doc;
}

export * as LiveDocAtom from "./live-doc.atom";
