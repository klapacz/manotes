import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { PaneMake } from "@manotes/shared/note/pane.make";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { RuleProps } from "@manotes/shared/rule-props";
import { getRouteApi } from "@tanstack/solid-router";
import { Effect, Exit, Match, Option, Record, type Types } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { For, Show, type JSX } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { NoteLink } from "../../lib/note/link-component";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { CommandList, CommandScroll } from "../ui/command";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { Focus } from "./focus";
import { NoteLabel } from "./note-label";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";

const route = getRouteApi("/$graph/");

export function Root(props: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc }) {
  const state = useGroups(props);

  return (
    <MatchTag
      when={state}
      cases={{
        Error: () => <p class="px-4 pb-4 text-sm text-error-fg">Unable to load props.</p>,
        Success: (result) => (
          <Show
            when={
              !Record.isEmptyReadonlyRecord(result().value.top.props) ||
              Record.some(
                result().value.groups,
                (group) => !Record.isEmptyReadonlyRecord(group.props),
              )
            }
          >
            <div class="space-y-2 px-4 pb-4">
              <Group group={result().value.top} recordId={props.recordId} doc={props.doc} />
              <For each={Record.keys(result().value.groups)}>
                {(ruleId) => (
                  <Show when={result().value.groups[ruleId]}>
                    {(group) => <Group group={group()} recordId={props.recordId} doc={props.doc} />}
                  </Show>
                )}
              </For>
            </div>
          </Show>
        ),
      }}
    />
  );
}

function useGroups(props: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc }) {
  const input = createSyncedAtom(() => ({ recordId: props.recordId, doc: props.doc }));

  return createAtomResultStore(
    bindRt((rt) =>
      rt.atom((get) => {
        // Changing the record or document replaces its subscriptions.
        return RuleProps.watch(get(input));
      }),
    ),
  );
}

function Group(props: {
  readonly group: RuleProps.EditorGroup;
  readonly recordId: NoteSchema.Id;
  readonly doc: Y.Doc;
}) {
  return (
    <Show when={!Record.isEmptyReadonlyRecord(props.group.props)}>
      <Surface>
        <MatchTag when={props.group} cases={{ Rule: (group) => <RuleHeading group={group()} /> }} />
        <Rows group={props.group} recordId={props.recordId} doc={props.doc} />
      </Surface>
    </Show>
  );
}

function Surface(props: { readonly children: JSX.Element }) {
  const focus = Focus.useNode();

  return (
    <div
      class="rounded-lg bg-bg-subtle p-2 text-sm transition-colors"
      classList={{ "bg-control": focus.highlightWithin() }}
    >
      {props.children}
    </div>
  );
}

function RuleHeading(props: { readonly group: Types.ExtractTag<RuleProps.EditorGroup, "Rule"> }) {
  return (
    <div class="flex flex-wrap items-center gap-2 px-2 pb-2">
      <NoteLink id={props.group.ruleId} class="min-w-0 text-fg hover:underline">
        <MatchTag
          when={props.group.status}
          cases={{
            Matching: (status) => <>{status().rule.title || "Untitled"}</>,
            Unmatched: (status) => <>{status().rule.title || "Untitled"}</>,
            Unavailable: () => <NoteLabel.Root id={props.group.ruleId} />,
          }}
        />
      </NoteLink>
      <MatchTag
        when={props.group.status}
        cases={{
          Unmatched: () => <span class="text-warning-fg">No longer applies</span>,
          Unavailable: () => <span class="text-error-fg">Rule unavailable</span>,
        }}
      />
    </div>
  );
}

function Rows(props: {
  readonly group: RuleProps.EditorGroup;
  readonly recordId: NoteSchema.Id;
  readonly doc: Y.Doc;
}) {
  return (
    <DescriptionList.Root>
      <For each={Record.keys(props.group.props)}>
        {(propId) => (
          <Show when={props.group.props[propId]}>
            {(prop) => (
              <Row prop={prop()} group={props.group} recordId={props.recordId} doc={props.doc} />
            )}
          </Show>
        )}
      </For>
    </DescriptionList.Root>
  );
}

type RowProps = {
  readonly prop: RuleProps.Prop;
  readonly group: RuleProps.EditorGroup;
  readonly recordId: NoteSchema.Id;
  readonly doc: Y.Doc;
};

function Row(props: RowProps) {
  const builtin = () => BuiltinAttrs.isBuiltin(props.prop.propId);

  const label = () =>
    Option.match(props.prop.def, {
      onNone: () => <NoteLabel.Root id={props.prop.propId} />,
      onSome: (def) => def.title || "Untitled",
    });

  return (
    <DescriptionList.Row>
      <DescriptionList.Term>
        <div class="flex items-center gap-2">
          <Show when={!builtin()} fallback={label()}>
            <NoteLink id={props.prop.propId} class="min-w-0 hover:underline">
              {label()}
            </NoteLink>
          </Show>
          <PropPicker.BuiltinBadge builtin={builtin()} />
        </div>
      </DescriptionList.Term>
      <DescriptionList.Details>
        <ValueControl {...props} />
      </DescriptionList.Details>
    </DescriptionList.Row>
  );
}

function ValueControl(props: RowProps) {
  const label = () =>
    Option.match(props.prop.def, {
      onNone: () => "Unavailable property",
      onSome: (def) => def.title || "Untitled",
    });

  const required = () =>
    Attrs.ValueState.$is("Unset")(props.prop.value) &&
    Option.exists(props.prop.expectation, AttrsSchema.RuleExpectation.guards.required);

  const invalid = () => Attrs.ValueState.$is("Invalid")(props.prop.value);

  const unexpected = () =>
    RuleProps.EditorGroup.$is("Rule")(props.group) && RuleProps.isUnexpected(props.prop);

  return (
    <Picker.Root label={label()}>
      <Picker.Trigger
        variant="ghost"
        rounded="default"
        aria-invalid={invalid() || required()}
        data-unexpected={unexpected() && !invalid() && !required()}
        class="h-7 border-0 px-2 text-sm aria-[invalid=true]:bg-error-control aria-[invalid=true]:text-error-fg aria-[invalid=true]:hover:bg-error-control-hover data-[unexpected=true]:bg-warning-control data-[unexpected=true]:text-warning-fg data-[unexpected=true]:hover:bg-warning-control-hover"
      >
        <Show when={unexpected()}>Unexpected: </Show>
        <Show when={required()} fallback={<PropPicker.StateLabel state={props.prop.value} />}>
          Required
        </Show>
      </Picker.Trigger>
      <Picker.Content>{(close) => <ValueMenu {...props} close={close} />}</Picker.Content>
    </Picker.Root>
  );
}

function ValueMenu(props: RowProps & { readonly close: (action?: () => void) => void }) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();
  const [mutation, edit] = useAtom(Edit, { mode: "promiseExit" });

  const change = async (value: AttrsSchema.PropVal | undefined) => {
    const exit = await edit({
      doc: props.doc,
      recordId: props.recordId,
      group: props.group,
      propId: props.prop.propId,
      value,
    });

    if (Exit.isFailure(exit)) return;

    props.close();
  };

  const openNote = (id: NoteSchema.Id) => {
    props.close(() => {
      const input = PaneMake.note(id);

      if (scroll.scrollToPane(input).found) return;

      void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
    });
  };

  return (
    <Show
      when={Option.getOrUndefined(props.prop.def)}
      fallback={
        <PropPicker.Unavailable>
          <Show when={AsyncResult.isFailure(mutation())}>
            <p role="alert" class="px-3 py-2 text-sm text-error-fg">
              Unable to update prop.
            </p>
          </Show>
          <Picker.Footer>
            <Picker.Back onSelect={() => props.close()} />
            <Picker.Clear
              disabled={Attrs.ValueState.$is("Unset")(props.prop.value) || mutation().waiting}
              onSelect={() => void change(undefined)}
            />
          </Picker.Footer>
        </PropPicker.Unavailable>
      }
    >
      {(def) => (
        <PropPicker.Value
          propId={props.prop.propId}
          label={def().title || "Untitled"}
          type={def().prop_type}
          targets={PropQuery.targets(def())}
          defaultValue={Option.fromNullishOr(def().prop_default)}
          state={props.prop.value}
          disabled={mutation().waiting}
          onChange={(value) => void change(value)}
          onOpenNote={openNote}
        >
          {(items) => (
            <CommandList>
              <CommandScroll>{items}</CommandScroll>
              <PropPicker.Invalid state={props.prop.value} />
              <Show when={AsyncResult.isFailure(mutation())}>
                <p role="alert" class="px-3 py-2 text-sm text-error-fg">
                  Unable to update prop.
                </p>
              </Show>
              <Picker.Footer>
                <Picker.Back onSelect={() => props.close()} />
                <Picker.Clear
                  disabled={Attrs.ValueState.$is("Unset")(props.prop.value) || mutation().waiting}
                  onSelect={() => void change(undefined)}
                />
              </Picker.Footer>
            </CommandList>
          )}
        </PropPicker.Value>
      )}
    </Show>
  );
}

const Edit = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteNotePropGroups.edit")(function* (opts: {
      readonly doc: Y.Doc;
      readonly recordId: NoteSchema.Id;
      readonly group: RuleProps.EditorGroup;
      readonly propId: NoteSchema.Id;
      readonly value: AttrsSchema.PropVal | undefined;
    }) {
      const attrs = yield* Attrs.Service;
      const prop = { doc: opts.doc, propId: opts.propId };

      yield* Match.value(opts.group).pipe(
        Match.tag("Top", () => {
          if (opts.value === undefined) return attrs.clearProp(prop);

          return attrs.setProp({ ...prop, recordId: opts.recordId, value: opts.value });
        }),
        Match.tag("Rule", ({ ruleId }) => {
          if (opts.value === undefined) return attrs.clearGroupProp({ ...prop, ruleId });

          return attrs.setGroupProp({
            ...prop,
            recordId: opts.recordId,
            ruleId,
            value: opts.value,
          });
        }),
        Match.exhaustive,
      );
    }),
  ),
);

export * as NotePropGroups from "./note-prop-groups";
