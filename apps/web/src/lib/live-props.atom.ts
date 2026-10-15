import type { NoteSchema } from "@manotes/shared/note.schema";
import { RuleProps } from "@manotes/shared/rule-props";
import { Stream } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { LiveDocAtom } from "./live-doc.atom";
import { LiveDoc } from "./live-doc.service";
import { bindRt } from "./rt-atom";

export const byRecord = bindRt((rt) => {
  return Atom.family((recordId: NoteSchema.Id) => {
    // Resolve graph context while selecting the atom, before its stream runs.
    const doc = LiveDocAtom.byRecord()(recordId);

    return rt.atom((get) => {
      return get.streamResult(doc).pipe(
        Stream.switchMap((state) => {
          return LiveDoc.Doc.$match(state, {
            Loading: () => Stream.never,
            Ready: ({ doc }) => RuleProps.watch({ recordId, doc }),
            Error: (error) => Stream.fail(error),
          });
        }),
      );
    });
  });
});

export * as LivePropsAtom from "./live-props.atom";
