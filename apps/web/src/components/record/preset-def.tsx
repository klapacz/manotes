import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type * as Y from "yjs";
import { DescriptionList } from "../ui/description-list";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";
import { PresetFilter } from "./preset-filter";

export type Snapshot = {
  readonly preset_filter: AttrsSchema.Filter | undefined;
};

export function Root(props: { recordId: AttrsSchema.RecordId; doc: Y.Doc; attrs: Snapshot }) {
  const focus = Focus.useNode();

  return (
    <div class="px-4 pb-4">
      <Surface.Root highlighted={focus.highlightWithin()}>
        <Surface.Header>PRESET</Surface.Header>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Filter</DescriptionList.Term>
            <DescriptionList.Details class="flex flex-wrap gap-1">
              <PresetFilter.Links presetId={props.recordId} filter={props.attrs.preset_filter} />
            </DescriptionList.Details>
          </DescriptionList.Row>
        </DescriptionList.Root>
      </Surface.Root>
    </div>
  );
}

export * as PresetDef from "./preset-def";
