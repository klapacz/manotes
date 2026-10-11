import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { createWritableMemo } from "@solid-primitives/memo";
import { Match, Option } from "effect";
import { Show, type JSX } from "solid-js";
import { PropQuery } from "./prop-query";
import { Command, CommandItem, CommandList } from "../ui/command";
import { UseDefaultIcon } from "../icons";
import { Picker } from "../ui/picker";

type ValueProps = {
  label: string;
  type: PropQuery.EditableType;
  defaultValue: Option.Option<AttrsSchema.PropVal>;
  state: Attrs.ValueState<AttrsSchema.PropVal>;
  search?: string;
  disabled?: boolean;
  onChange: (value: AttrsSchema.PropVal) => void;
  children: (items: JSX.Element) => JSX.Element;
};

export function Value(props: ValueProps) {
  const disabled = () => props.disabled || Attrs.ValueState.$is("Invalid")(props.state);

  return (
    <Show
      when={props.type === "number"}
      fallback={
        <Picker.Query
          label={props.label}
          query={PropQuery.values({ type: props.type, defaultValue: props.defaultValue })}
          initialSearch={props.search}
          selected={Match.value(props.state).pipe(
            Match.tag("Valid", ({ value }) => PropQuery.valueLabel(value)),
            Match.orElse(() => undefined),
          )}
          disabled={disabled()}
          onSelect={(choice) => props.onChange(choice.propVal)}
        >
          {props.children}
        </Picker.Query>
      }
    >
      <NumberInput {...props} disabled={disabled()} />
    </Show>
  );
}

function NumberInput(props: ValueProps) {
  const [text, setText] = createWritableMemo(
    () =>
      props.search ??
      Match.value(props.state).pipe(
        Match.tag("Valid", ({ value }) => PropQuery.valueLabel(value)),
        Match.orElse(() => ""),
      ),
  );

  const value = () => PropQuery.parseNumber(text());

  const defaultValue = () =>
    props.defaultValue.pipe(
      Option.filter(AttrsSchema.PropVal.guards.number),
      Option.getOrUndefined,
    );

  return (
    <Command shouldFilter={false}>
      <Picker.Input
        aria-label={props.label}
        placeholder="Enter a number…"
        value={text()}
        onValueChange={setText}
        disabled={props.disabled}
      />
      {props.children(
        <>
          <Picker.Apply
            disabled={props.disabled || Option.isNone(value())}
            onSelect={() =>
              value().pipe(Option.match({ onNone: () => {}, onSome: props.onChange }))
            }
          />
          <Show when={defaultValue()}>
            {(value) => (
              <CommandItem
                value="use-default"
                disabled={props.disabled}
                onSelect={() => props.onChange(value())}
              >
                <UseDefaultIcon />
                <span class="flex-1">Use Default</span>
                <span class="min-w-0 truncate text-sm text-fg-subtle">
                  {PropQuery.valueLabel(value())}
                </span>
              </CommandItem>
            )}
          </Show>
        </>,
      )}
    </Command>
  );
}

export function Invalid(props: { state: Attrs.ValueState<AttrsSchema.PropVal> }) {
  return (
    <Show when={Attrs.ValueState.$is("Invalid")(props.state)}>
      <p class="px-3 py-2 text-sm text-error-fg">{PropQuery.stateLabel(props.state)}</p>
    </Show>
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
