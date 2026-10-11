import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import type { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { Predicate } from "effect";
import { Show, type JSX } from "solid-js";
import { PropQuery } from "./prop-query";
import { Command, CommandList } from "../ui/command";
import { Picker } from "../ui/picker";

export function Bool(props: {
  def: PropRecordRepo.Def<"bool">;
  value: AttrsSchema.PropVal | undefined;
  search?: string;
  disabled?: boolean;
  onChange: (value: AttrsSchema.PropVal) => void;
  children: (items: JSX.Element) => JSX.Element;
}) {
  return (
    <Picker.Query
      label={props.def.title || "Untitled"}
      query={PropQuery.boolQuery({ defaultValue: props.def.prop_default?.val })}
      initialSearch={props.search}
      selected={Predicate.isTagged(props.value, "bool") ? String(props.value.val) : undefined}
      disabled={props.disabled}
      onSelect={(choice) => props.onChange(choice.propVal)}
    >
      {props.children}
    </Picker.Query>
  );
}

export function Unavailable(props: { children: JSX.Element }) {
  return (
    <Command shouldFilter={false}>
      <CommandList>
        <p class="px-3 py-2 text-sm text-fg-subtle">Property is unavailable.</p>
        {props.children}
      </CommandList>
    </Command>
  );
}

export function BuiltinBadge(props: { builtin: boolean }) {
  return (
    <Show when={props.builtin}>
      <span class="shrink-0 text-sm text-fg-subtle">builtin</span>
    </Show>
  );
}

export * as PropPicker from "./prop-picker";
