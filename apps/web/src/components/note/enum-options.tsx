import { EnumOptionRepo } from "@manotes/shared/enum-option.repo";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { Stream } from "effect";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { ArrowUpRightIcon } from "../icons";
import { Button } from "../ui/button";

export function Link(props: { propId: NoteSchema.Id; onOpen: () => void }) {
  const id = createSyncedAtom(() => props.propId);

  const state = createAtomResultStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        return EnumOptionRepo.Service.use((repo) => {
          return repo.reactiveOptions({ enum_parent: get(id) });
        }).pipe(
          Stream.unwrap,
          Stream.map((options) => options.length),
        );
      });
    }),
  );

  return (
    <Button variant="ghost" size="xs" onClick={props.onOpen}>
      <MatchTag
        when={state}
        cases={{
          Loading: () => "Loading…",
          Error: () => "Options",
          Success: (state) => (
            <>
              {state().value} {state().value === 1 ? "option" : "options"}
            </>
          ),
        }}
      />
      <ArrowUpRightIcon />
    </Button>
  );
}

export * as EnumOptions from "./enum-options";
