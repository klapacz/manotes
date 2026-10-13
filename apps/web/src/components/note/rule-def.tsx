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
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { Focus } from "./focus";
import { NoteLabel } from "./note-label";
import { RuleTargets } from "./rule-targets";

export type Snapshot = {
  readonly rule_targets: AttrsSchema.TargetFilter | undefined;
  readonly rule_expects:
    | Readonly<Record<AttrsSchema.NoteId, AttrsSchema.RuleExpectation | undefined>>
    | undefined;
};

type Change = Data.TaggedEnum<{
  Set: { propId: AttrsSchema.NoteId; value: AttrsSchema.RuleExpectation };
  Remove: { propId: AttrsSchema.NoteId };
}>;

const Change = Data.taggedEnum<Change>();

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
      <div
        class="rounded-lg bg-bg-subtle px-2 py-2 text-sm transition-colors"
        classList={{ "bg-control": focus.highlightWithin() }}
      >
        <div class="px-2 pb-2">RULE</div>
        <DescriptionList.Root>
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
                      <DescriptionList.Details class="flex items-center gap-1">
                        <Picker.Root label="Expectation">
                          <Picker.Trigger
                            variant="ghost"
                            rounded="default"
                            class="h-7 border-0 px-2 text-sm"
                            disabled={mutation().waiting}
                          >
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
                      </DescriptionList.Details>
                    </DescriptionList.Row>
                  )}
                </For>
              </DescriptionList.Root>
              <div class="pt-2 pb-1">
                <Picker.Root label="Add expected property">
                  <Picker.Trigger variant="outline" size="sm" disabled={mutation().waiting}>
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
          <p role="alert" class="px-2 pt-2 text-error-fg">
            Unable to update rule.
          </p>
        </Show>
      </div>
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
