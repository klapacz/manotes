import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { Effect } from "effect";
import { AsyncResult } from "effect/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt } from "../../lib";
import { useAtom } from "../../lib/atom-solid";
import { Button } from "../ui/button";
import { DescriptionList } from "../ui/description-list";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";
import { PresetFilter } from "./preset-filter";

export type Snapshot = {
  readonly preset_filter: AttrsSchema.Filter | undefined;
  readonly preset_default: boolean;
};

export function Root(props: { recordId: AttrsSchema.RecordId; doc: Y.Doc; attrs: Snapshot }) {
  const focus = Focus.useNode();
  const [mutation, setDefault] = useAtom(SetDefault);

  return (
    <div class="px-4 pb-4">
      <Surface.Root highlighted={focus.highlightWithin()}>
        <Surface.Header>PRESET</Surface.Header>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Filter</DescriptionList.Term>
            <DescriptionList.Details>
              <PresetFilter.Links presetId={props.recordId} filter={props.attrs.preset_filter} />
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>Default</DescriptionList.Term>
            <DescriptionList.Details>
              <Button
                variant="ghost"
                size="xs"
                role="switch"
                aria-checked={props.attrs.preset_default ? "true" : "false"}
                disabled={mutation().waiting}
                onClick={() => setDefault({ doc: props.doc, value: !props.attrs.preset_default })}
              >
                {props.attrs.preset_default ? "On" : "Off"}
              </Button>
            </DescriptionList.Details>
          </DescriptionList.Row>
        </DescriptionList.Root>
        <Show when={AsyncResult.isFailure(mutation())}>
          <Surface.Error>Unable to update preset.</Surface.Error>
        </Show>
      </Surface.Root>
    </div>
  );
}

const SetDefault = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordPresetDef.setDefault")(function* (opts: {
      readonly doc: Y.Doc;
      readonly value: boolean;
    }) {
      const attrs = yield* Attrs.Service;
      yield* attrs.setPresetDefault(opts);
    }),
  );
});

export * as PresetDef from "./preset-def";
