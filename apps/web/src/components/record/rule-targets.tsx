import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Effect, Equal, Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { createMemo, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { SyncedAttrs } from "../../lib/editor/synced-attrs";
import { createStreamRefLabel } from "../../lib/editor/stream-ref/extension";
import { RecordLink } from "../../lib/record/link-component";
import { ArrowUpRightIcon } from "../icons";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { RecordLabel } from "./record-label";

import { PaneNavigate } from "../../lib/record/pane.navigate";

export function Link(props: {
  ruleId: AttrsSchema.RecordId;
  targets: AttrsSchema.TargetFilter | undefined;
}) {
  const openNext = PaneNavigate.useOpenNext();

  const settings = (): StreamSettings.Settings => ({
    ...StreamSettings.defaultDisplay,
    filter: props.targets ?? [],
  });

  const label = createStreamRefLabel(settings);

  const open = () => {
    return openNext(
      PaneSchema.make.stream({
        ...settings(),
        source: PaneSchema.Source.cases.rule.make({ id: props.ruleId }),
      }),
    );
  };

  return (
    <Button variant="ghost" size="xs" onClick={open}>
      {label()}
      <ArrowUpRightIcon />
    </Button>
  );
}

export function Header(props: {
  ruleId: AttrsSchema.RecordId;
  filter: StreamSettings.Filter;
  onDiscard: (filter: StreamSettings.Filter) => void;
}) {
  const id = createSyncedAtom(() => props.ruleId);

  const state = createAtomResultStore(
    bindRt((rt) => rt.atom((get) => SyncedAttrs.watch({ id: get(id) }))),
  );

  const [mutation, save] = useAtom(Save);

  const rule = createMemo(() => {
    return Match.value(state).pipe(
      Match.when(
        { _tag: "Success", value: { attrs: { _tag: Match.is("rule") } } },
        ({ value }) => ({
          doc: value.doc,
          targets: value.attrs.rule_targets,
        }),
      ),
      Match.orElse(() => undefined),
    );
  });

  const savedFilter = () => rule()?.targets ?? [];

  // Compare persisted expressions so omitted/default pane fields do not mark edits.
  const modified = () => {
    return !Equal.equals(props.filter, savedFilter());
  };

  const saveChanges = () => {
    const current = rule();

    if (!current) return;

    save({ doc: current.doc, targets: props.filter });
  };

  return (
    <div class="px-4 pb-3 pane:px-0">
      <Alert
        variant={rule() && modified() ? "warning" : "default"}
        class="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <span class="flex min-w-0 flex-1 gap-1">
          <Show when={rule() && modified()} fallback="You're viewing matches for">
            You modified matches for
          </Show>
          <RecordLink id={props.ruleId} class="min-w-0 hover:underline">
            <RecordLabel.Root id={props.ruleId} />
          </RecordLink>
        </span>
        <Show when={rule() && modified()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => props.onDiscard(savedFilter())}
            disabled={mutation().waiting}
          >
            Discard
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="border-warning-border bg-warning-control text-warning-fg hover:bg-warning-control-hover"
            onClick={saveChanges}
            disabled={mutation().waiting}
          >
            Save
          </Button>
        </Show>
        <MatchTag
          when={state}
          cases={{
            Loading: () => <span>Loading rule…</span>,
            Error: () => <span class="text-error-fg">Unable to load rule.</span>,
            Success: () => (
              <Show when={!rule()}>
                <span class="text-error-fg">Rule unavailable.</span>
              </Show>
            ),
          }}
        />
        <Show when={AsyncResult.isFailure(mutation())}>
          <span class="text-error-fg">Unable to save matches.</span>
        </Show>
      </Alert>
    </div>
  );
}

const Save = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordRuleTargets.save")(function* (opts: {
      readonly doc: Y.Doc;
      readonly targets: AttrsSchema.Filter;
    }) {
      const attrs = yield* Attrs.Service;

      const targets = yield* Schema.decodeEffect(
        AttrsSchema.Filter.pipe(Schema.decodeTo(AttrsSchema.TargetFilter)),
      )(opts.targets);

      yield* attrs.setRuleTargets({ doc: opts.doc, targets });
    }),
  );
});

export * as RuleTargets from "./rule-targets";
