import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { PropDef } from "@manotes/shared/prop-def.service";
import { Data, Effect, Match, Option, Record, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { For, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt } from "../../lib";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { NoteLink } from "../../lib/note/link-component";
import { XIcon } from "../icons";
import { Button } from "../ui/button";
import { ButtonGroup } from "../ui/button-group";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { Surface } from "../ui/surface";
import { Focus } from "./focus";
import { NoteLabel } from "./note-label";
import { RuleTargets } from "./rule-targets";

export type Snapshot = {
  readonly rule_storage: AttrsSchema.RuleStorage | undefined;
  readonly rule_targets: AttrsSchema.TargetFilter | undefined;
  readonly rule_expects:
    | Readonly<Record<AttrsSchema.NoteId, AttrsSchema.RuleExpectation | undefined>>
    | undefined;
};

type Change = Data.TaggedEnum<{
  Storage: { storage: AttrsSchema.RuleStorage };
  Set: { propId: AttrsSchema.NoteId; value: AttrsSchema.RuleExpectation };
  Remove: { propId: AttrsSchema.NoteId };
}>;

const Change = Data.taggedEnum<Change>();

const storageChoices = [
  {
    value: "top",
    label: "Top level",
    storage: AttrsSchema.RuleStorage.cases.top.make({}),
  },
  {
    value: "group",
    label: "Group",
    storage: AttrsSchema.RuleStorage.cases.group.make({}),
  },
];

const expectationChoices = [
  {
    value: "required",
    label: "Required",
    expectation: AttrsSchema.RuleExpectation.cases.required.make({}),
  },
  {
    value: "optional",
    label: "Optional",
    expectation: AttrsSchema.RuleExpectation.cases.optional.make({}),
  },
];

export function Root(props: { recordId: AttrsSchema.NoteId; doc: Y.Doc; attrs: Snapshot }) {
  const focus = Focus.useNode();
  const [mutation, edit] = useAtom(Edit);
  const expects = () => props.attrs.rule_expects ?? {};
  const change = (change: Change) => edit({ doc: props.doc, change });

  const query: QueryEngine.Query<
    Picker.Choice & { propId: AttrsSchema.NoteId },
    unknown,
    PropDef.Service
  > = (request) =>
    Stream.unwrap(PropDef.Service.use((defs) => defs.reactiveDefs())).pipe(
      Stream.switchMap((defs) =>
        MenuQuery.choices(() =>
          defs
            .filter((def) => !Record.has(expects(), def.id))
            .map((def) => ({
              value: def.id,
              propId: def.id,
              label: def.title || "Untitled",
              group: BuiltinAttrs.isBuiltin(def.id) ? "builtin" : "properties",
            })),
        )(request),
      ),
    );

  return (
    <div class="px-4 pb-4">
      <Surface.Root highlighted={focus.highlightWithin()}>
        <Surface.Header>RULE</Surface.Header>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Storage</DescriptionList.Term>
            <DescriptionList.Details>
              <Picker.Root label="Storage">
                <Picker.Trigger variant="ghost" size="xs" disabled={mutation().waiting}>
                  {storageChoices.find((choice) => choice.value === props.attrs.rule_storage?._tag)
                    ?.label ?? "Invalid"}
                </Picker.Trigger>
                <Picker.Content>
                  {(close) => (
                    <Picker.Query<(typeof storageChoices)[number]>
                      label="Storage"
                      query={MenuQuery.choices(() => storageChoices)}
                      selected={props.attrs.rule_storage?._tag}
                      disabled={mutation().waiting}
                      onSelect={(choice) => {
                        change(Change.Storage({ storage: choice.storage }));
                        close();
                      }}
                    />
                  )}
                </Picker.Content>
              </Picker.Root>
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>Matches</DescriptionList.Term>
            <DescriptionList.Details>
              <RuleTargets.Link ruleId={props.recordId} targets={props.attrs.rule_targets} />
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>Expected</DescriptionList.Term>
            <DescriptionList.Details>
              <DescriptionList.Root>
                <For each={Record.keys(expects())}>
                  {(propId) => (
                    <DescriptionList.Row>
                      <DescriptionList.Term>
                        <Show
                          when={Option.getOrUndefined(BuiltinAttrs.find(propId))}
                          fallback={
                            <NoteLink id={propId} class="hover:underline">
                              <NoteLabel.Root id={propId} />
                            </NoteLink>
                          }
                        >
                          {(def) => <>{def().title}</>}
                        </Show>
                      </DescriptionList.Term>
                      <DescriptionList.Details>
                        <ButtonGroup.Root aria-label="Expected property">
                          <Picker.Root label="Expectation">
                            <Picker.Trigger variant="ghost" size="xs" disabled={mutation().waiting}>
                              {expectationChoices.find(
                                (choice) => choice.value === expects()[propId]?._tag,
                              )?.label ?? "Invalid"}
                            </Picker.Trigger>
                            <Picker.Content>
                              {(close) => (
                                <Picker.Query<(typeof expectationChoices)[number]>
                                  label="Expectation"
                                  query={MenuQuery.choices(() => expectationChoices)}
                                  selected={expects()[propId]?._tag}
                                  disabled={mutation().waiting}
                                  onSelect={(choice) => {
                                    change(Change.Set({ propId, value: choice.expectation }));
                                    close();
                                  }}
                                />
                              )}
                            </Picker.Content>
                          </Picker.Root>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="Remove expected property"
                            disabled={mutation().waiting}
                            onClick={() => change(Change.Remove({ propId }))}
                          >
                            <XIcon />
                          </Button>
                        </ButtonGroup.Root>
                      </DescriptionList.Details>
                    </DescriptionList.Row>
                  )}
                </For>
              </DescriptionList.Root>
              <div class="pt-2 pb-1">
                <Picker.Root label="Add expected property">
                  <Picker.Trigger variant="outline" size="xs" disabled={mutation().waiting}>
                    Add
                  </Picker.Trigger>
                  <Picker.Content>
                    {(close) => (
                      <Picker.Query
                        label="Add expected property"
                        query={query}
                        disabled={mutation().waiting}
                        onSelect={(choice) => {
                          change(
                            Change.Set({
                              propId: choice.propId,
                              value: AttrsSchema.RuleExpectation.cases.required.make({}),
                            }),
                          );
                          close();
                        }}
                      />
                    )}
                  </Picker.Content>
                </Picker.Root>
              </div>
            </DescriptionList.Details>
          </DescriptionList.Row>
        </DescriptionList.Root>
        <Show when={AsyncResult.isFailure(mutation())}>
          <Surface.Error>Unable to update rule.</Surface.Error>
        </Show>
      </Surface.Root>
    </div>
  );
}

const Edit = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteRuleDef.edit")(function* (opts: {
      readonly doc: Y.Doc;
      readonly change: Change;
    }) {
      const attrs = yield* Attrs.Service;

      yield* Match.value(opts.change).pipe(
        Match.tag("Storage", ({ storage }) => attrs.setRuleStorage({ doc: opts.doc, storage })),
        Match.tag("Set", ({ propId, value }) =>
          attrs.setRuleExpectation({ doc: opts.doc, propId, value }),
        ),
        Match.tag("Remove", ({ propId }) => attrs.clearRuleExpectation({ doc: opts.doc, propId })),
        Match.exhaustive,
      );
    }),
  ),
);

export * as RuleDef from "./rule-def";
