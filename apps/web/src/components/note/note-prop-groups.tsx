import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { PaneMake } from "@manotes/shared/note/pane.make";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { RuleProps } from "@manotes/shared/rule-props";
import { getRouteApi } from "@tanstack/solid-router";
import { Option, Record, type Types } from "effect";
import { For, Show } from "solid-js";
import type * as Y from "yjs";
import { createAtomResultStore, MatchTag } from "../../lib";
import { LivePropsAtom } from "../../lib/live-props.atom";
import { NoteLink } from "../../lib/note/link-component";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";
import { NoteLabel } from "./note-label";
import { PropPicker } from "./prop-picker";
import { NoteProps } from "./note-props";
import { NotePropsEntries } from "./note-props.entries";

const route = getRouteApi("/$graph/");

export function Root(props: { readonly recordId: NoteSchema.Id; readonly doc: Y.Doc }) {
  const state = createAtomResultStore(() => {
    return LivePropsAtom.byRecord()(props.recordId);
  });

  return (
    <MatchTag
      when={state}
      cases={{
        Error: () => <p class="px-4 pb-4 text-sm text-error-fg">Unable to load props.</p>,
        Success: (result) => {
          const groups = () => result().value.groups;

          return (
            <Show
              when={
                !Record.isEmptyReadonlyRecord(groups().top.props) ||
                Record.some(groups().groups, (group) => !Record.isEmptyReadonlyRecord(group.props))
              }
            >
              <div class="space-y-2 px-4 pb-4">
                <Group group={groups().top} recordId={props.recordId} doc={props.doc} />
                <For each={Record.keys(groups().groups)}>
                  {(ruleId) => (
                    <Show when={groups().groups[ruleId]}>
                      {(group) => (
                        <Group group={group()} recordId={props.recordId} doc={props.doc} />
                      )}
                    </Show>
                  )}
                </For>
              </div>
            </Show>
          );
        },
      }}
    />
  );
}

function Group(props: {
  readonly group: RuleProps.EditorGroup;
  readonly recordId: NoteSchema.Id;
  readonly doc: Y.Doc;
}) {
  const focus = Focus.useNode();

  return (
    <Show when={!Record.isEmptyReadonlyRecord(props.group.props)}>
      <Surface.Root highlighted={focus.highlightWithin()}>
        <MatchTag when={props.group} cases={{ Rule: (group) => <RuleHeading group={group()} /> }} />
        <Rows group={props.group} recordId={props.recordId} doc={props.doc} />
      </Surface.Root>
    </Show>
  );
}

function RuleHeading(props: { readonly group: Types.ExtractTag<RuleProps.EditorGroup, "Rule"> }) {
  return (
    <Surface.Header>
      <NoteLink id={props.group.ruleId} class="min-w-0 text-fg hover:underline">
        <MatchTag
          when={props.group.status}
          cases={{
            Matching: (status) => <>{NotePropsEntries.ruleLabel(status())}</>,
            Unmatched: (status) => <>{NotePropsEntries.ruleLabel(status())}</>,
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
    </Surface.Header>
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

  const label = () => {
    return Option.match(props.prop.def, {
      onNone: () => <NoteLabel.Root id={props.prop.propId} />,
      onSome: (def) => def.title || "Untitled",
    });
  };

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
  const required = () => RuleProps.isRequired(props.prop);

  const invalid = () => Attrs.ValueState.$is("Invalid")(props.prop.value);

  const unexpected = () => {
    return RuleProps.EditorGroup.$is("Rule")(props.group) && RuleProps.isUnexpected(props.prop);
  };

  return (
    <Picker.Root label={NotePropsEntries.label(props.prop)}>
      <Picker.Trigger
        variant="ghost"
        size="xs"
        aria-invalid={invalid() || required()}
        intent={invalid() || required() ? "error" : unexpected() ? "warning" : undefined}
      >
        <NoteProps.EntryValue entry={{ ...props.prop, group: props.group }} />
      </Picker.Trigger>
      <Picker.Content>{(close) => <ValueMenu {...props} close={close} />}</Picker.Content>
    </Picker.Root>
  );
}

function ValueMenu(props: RowProps & { readonly close: (action?: () => void) => void }) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();

  const openNote = (id: NoteSchema.Id) => {
    props.close(() => {
      const input = PaneMake.note(id);

      if (scroll.scrollToPane(input).found) return;

      void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
    });
  };

  return (
    <NoteProps.ValueMenu
      entry={{ ...props.prop, group: props.group }}
      recordId={props.recordId}
      doc={props.doc}
      onBack={props.close}
      onOpenNote={openNote}
      onChanged={() => props.close()}
    />
  );
}

export * as NotePropGroups from "./note-prop-groups";
