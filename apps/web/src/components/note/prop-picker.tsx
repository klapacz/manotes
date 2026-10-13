import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { createWritableMemo } from "@solid-primitives/memo";
import { Match, Option } from "effect";
import { Match as Case, Show, Switch, type JSX } from "solid-js";
import { PropQuery } from "./prop-query";
import { Command, CommandItem, CommandList } from "../ui/command";
import { UseDefaultIcon, ArrowUpRightIcon } from "../icons";
import { Picker } from "../ui/picker";
import { NoteLabel } from "./note-label";

type ValueProps = {
  propId: AttrsSchema.NoteId;
  label: string;
  type: PropQuery.EditableType;
  targets: AttrsSchema.TargetFilter | undefined;
  defaultValue: Option.Option<AttrsSchema.PropVal>;
  state: Attrs.ValueState<AttrsSchema.PropVal>;
  search?: string;
  disabled?: boolean;
  onChange: (value: AttrsSchema.PropVal) => void;
  onOpenNote: (id: AttrsSchema.NoteId) => void;
  children: (items: JSX.Element) => JSX.Element;
};

export function Value(props: ValueProps) {
  return (
    <Switch>
      <Case when={props.type === "bool"}>
        <Picker.Query
          label={props.label}
          query={PropQuery.values({
            propId: props.propId,
            type: "bool",
            targets: undefined,
            defaultValue: props.defaultValue,
          })}
          initialSearch={props.search}
          selected={Match.value(props.state).pipe(
            Match.tag("Valid", ({ value }) => PropQuery.valueLabel(value)),
            Match.orElse(() => undefined),
          )}
          disabled={props.disabled}
          onSelect={(choice) => props.onChange(choice.propVal)}
        >
          {props.children}
        </Picker.Query>
      </Case>
      <Case when={props.type === "number"}>
        <NumberInput {...props} />
      </Case>
      <Case when={props.type === "text"}>
        <TextInput {...props} />
      </Case>
      <Case when={props.type === "link" || props.type === "enum"}>
        <RecordInput {...props} />
      </Case>
    </Switch>
  );
}

function RecordInput(props: ValueProps) {
  const selected = () =>
    Match.value(props.state).pipe(
      Match.when(
        { _tag: Match.is("Valid", "Invalid"), value: { _tag: Match.is("link", "enum") } },
        ({ value }) => value.val,
      ),
      Match.orElse(() => undefined),
    );

  const defaultValue = () =>
    props.defaultValue.pipe(
      Option.filter(
        (value) => AttrsSchema.PropVal.guards.link(value) || AttrsSchema.PropVal.guards.enum(value),
      ),
      Option.getOrUndefined,
    );

  return (
    <Picker.Query
      label={props.label}
      query={PropQuery.values({
        propId: props.propId,
        type: props.type,
        targets: props.targets,
        defaultValue: props.defaultValue,
      })}
      initialSearch={props.search}
      selected={selected()}
      disabled={props.disabled}
      onSelect={(choice) => props.onChange(choice.propVal)}
    >
      {(items) =>
        props.children(
          <>
            {items}
            <Show when={defaultValue()}>
              {(value) => (
                <UseDefault value={value()} disabled={props.disabled} onSelect={props.onChange} />
              )}
            </Show>
            <Show when={selected()}>
              {(id) => (
                <CommandItem value="open-note" onSelect={() => props.onOpenNote(id())}>
                  <ArrowUpRightIcon />
                  Open note
                  <span class="ml-auto min-w-0 max-w-[50%] text-fg-subtle">
                    <NoteLabel.Root id={id()} />
                  </span>
                </CommandItem>
              )}
            </Show>
          </>,
        )
      }
    </Picker.Query>
  );
}

function NumberInput(props: ValueProps) {
  const [text, setText] = createWritableMemo(
    () =>
      props.search ??
      Match.value(props.state).pipe(
        Match.when({ _tag: "Valid", value: AttrsSchema.PropVal.guards.number }, ({ value }) =>
          value.val.toString(),
        ),
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
              <UseDefault value={value()} disabled={props.disabled} onSelect={props.onChange} />
            )}
          </Show>
        </>,
      )}
    </Command>
  );
}

function TextInput(props: ValueProps) {
  const [text, setText] = createWritableMemo(
    () =>
      props.search ??
      Match.value(props.state).pipe(
        Match.when(
          { _tag: "Valid", value: AttrsSchema.PropVal.guards.text },
          ({ value }) => value.val,
        ),
        Match.orElse(() => ""),
      ),
  );

  const defaultValue = () =>
    props.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.text), Option.getOrUndefined);

  return (
    <Command shouldFilter={false}>
      <Picker.Input
        aria-label={props.label}
        placeholder="Enter text…"
        value={text()}
        onValueChange={setText}
        disabled={props.disabled}
      />
      {props.children(
        <>
          <Picker.Apply
            disabled={props.disabled}
            onSelect={() => props.onChange(AttrsSchema.PropVal.cases.text.make({ val: text() }))}
          />
          <Show when={defaultValue()}>
            {(value) => (
              <UseDefault value={value()} disabled={props.disabled} onSelect={props.onChange} />
            )}
          </Show>
        </>,
      )}
    </Command>
  );
}

function UseDefault(props: {
  value: AttrsSchema.PropVal;
  disabled: boolean | undefined;
  onSelect: (value: AttrsSchema.PropVal) => void;
}) {
  return (
    <CommandItem
      value="use-default"
      disabled={props.disabled}
      onSelect={() => props.onSelect(props.value)}
    >
      <UseDefaultIcon />
      <span class="flex-1">Use Default</span>
      <span class="min-w-0 truncate text-sm text-fg-subtle">
        <ValueLabel value={props.value} />
      </span>
    </CommandItem>
  );
}

export function Invalid(props: { state: Attrs.ValueState<AttrsSchema.PropVal> }) {
  return (
    <Show when={Attrs.ValueState.$is("Invalid")(props.state)}>
      <p class="px-3 py-2 text-sm text-error-fg">
        <StateLabel state={props.state} />
      </p>
    </Show>
  );
}

export function ValueLabel(props: { value: AttrsSchema.PropVal }) {
  return (
    <Show
      when={
        (AttrsSchema.PropVal.guards.link(props.value) ||
          AttrsSchema.PropVal.guards.enum(props.value)) &&
        props.value.val
      }
      fallback={PropQuery.valueLabel(props.value)}
    >
      {(id) => <NoteLabel.Root id={id()} />}
    </Show>
  );
}

export function StateLabel(props: { state: Attrs.ValueState<AttrsSchema.PropVal> }) {
  return (
    <>
      {Match.value(props.state).pipe(
        Match.tag("Unset", () => "Choose"),
        Match.tag("Valid", ({ value }) => <ValueLabel value={value} />),
        Match.tag("Invalid", ({ value }) => (
          <>
            Invalid
            <Show when={value}>
              {(value) => (
                <>
                  : <ValueLabel value={value()} />
                </>
              )}
            </Show>
          </>
        )),
        Match.exhaustive,
      )}
    </>
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
