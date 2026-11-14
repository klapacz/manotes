import { RecordFormat } from "@manotes/shared/record/format";
import { PaneNavigate } from "../../lib/record/pane.navigate";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import type { RecordSchema } from "@manotes/shared/record.schema";
import { RuleProps } from "@manotes/shared/rule-props";
import { Option, Record, type Types } from "effect";
import { For, Show } from "solid-js";
import type * as Y from "yjs";
import { createAtomResultStore, MatchTag } from "../../lib";
import { LivePropsAtom } from "../../lib/live-props.atom";
import { RecordLink } from "../../lib/record/link-component";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";
import { RecordLabel } from "./record-label";
import { PropPicker } from "./prop-picker";
import { RecordProps } from "./record-props";
import { RecordPropsEntries } from "./record-props.entries";

export function Root(props: { readonly recordId: RecordSchema.Id; readonly doc: Y.Doc }) {
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
  readonly recordId: RecordSchema.Id;
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
      <RecordLink id={props.group.ruleId} class="min-w-0 text-fg hover:underline">
        <MatchTag
          when={props.group.status}
          cases={{
            Matching: (status) => <>{RecordFormat.ruleLabel(status())}</>,
            Unmatched: (status) => <>{RecordFormat.ruleLabel(status())}</>,
            Unavailable: () => <RecordLabel.Root id={props.group.ruleId} />,
          }}
        />
      </RecordLink>
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
  readonly recordId: RecordSchema.Id;
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
  readonly recordId: RecordSchema.Id;
  readonly doc: Y.Doc;
};

function Row(props: RowProps) {
  const builtin = () => BuiltinAttrs.isBuiltin(props.prop.propId);

  const label = () => {
    return Option.match(props.prop.def, {
      onNone: () => <RecordLabel.Root id={props.prop.propId} />,
      onSome: (def) => def.title || "Untitled",
    });
  };

  return (
    <DescriptionList.Row>
      <DescriptionList.Term>
        <div class="flex items-center gap-2">
          <Show when={!builtin()} fallback={label()}>
            <RecordLink id={props.prop.propId} class="min-w-0 hover:underline">
              {label()}
            </RecordLink>
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
    <Picker.Root label={RecordPropsEntries.label(props.prop)}>
      <Picker.Trigger
        variant="ghost"
        size="xs"
        aria-invalid={invalid() || required()}
        intent={invalid() || required() ? "error" : unexpected() ? "warning" : undefined}
      >
        <RecordProps.EntryValue entry={{ ...props.prop, group: props.group }} />
      </Picker.Trigger>
      <Picker.Content>{(close) => <ValueMenu {...props} close={close} />}</Picker.Content>
    </Picker.Root>
  );
}

function ValueMenu(props: RowProps & { readonly close: (action?: () => void) => void }) {
  const openNext = PaneNavigate.useOpenNext();

  const openRecord = (id: RecordSchema.Id) => {
    props.close(() => openNext(PaneSchema.make.record({ id })));
  };

  return (
    <RecordProps.ValueMenu
      entry={{ ...props.prop, group: props.group }}
      recordId={props.recordId}
      doc={props.doc}
      onBack={props.close}
      onOpenRecord={openRecord}
      onChanged={() => props.close()}
    />
  );
}

export * as RecordPropGroups from "./record-prop-groups";
