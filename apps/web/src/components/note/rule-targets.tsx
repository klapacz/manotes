import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { getRouteApi } from "@tanstack/solid-router";
import { Effect, Equal, Match } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { SyncedAttrs } from "../../lib/editor/synced-attrs";
import { createStreamRefLabel } from "../../lib/editor/stream-ref/extension";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { NoteLink } from "../../lib/note/link-component";
import { ArrowUpRightIcon } from "../icons";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { NoteLabel } from "./note-label";

const route = getRouteApi("/$graph/");

export function Link(props: {
  ruleId: AttrsSchema.NoteId;
  targets: AttrsSchema.TargetFilter | undefined;
}) {
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();
  const filter = () => StreamFilter.fromAttrs(props.targets);

  const label = createStreamRefLabel(() => ({
    ...StreamSettings.defaults(filter().type),
    filter: filter(),
  }));

  const open = () => {
    const input = PaneMake.ruleTargets({ ruleId: props.ruleId, filter: filter() });

    if (scroll.scrollToPane(input).found) return;

    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
  };

  return (
    <Button
      variant="ghost"
      size="chip"
      rounded="default"
      class="h-7 px-2 text-sm font-normal"
      onClick={open}
    >
      {label()}
      <ArrowUpRightIcon />
    </Button>
  );
}

export function Header(props: {
  ruleId: AttrsSchema.NoteId;
  filter: StreamSettings.Filter;
  onDiscard: (filter: StreamSettings.Filter) => void;
}) {
  const id = createSyncedAtom(() => props.ruleId);

  const state = createAtomResultStore(
    bindRt((rt) => rt.atom((get) => SyncedAttrs.watch({ id: get(id) }))),
  );

  const [mutation, save] = useAtom(Save);

  const rule = createMemo(() =>
    Match.value(state).pipe(
      Match.when(
        { _tag: "Success", value: { attrs: { _tag: Match.is("rule") } } },
        ({ value }) => ({
          doc: value.doc,
          targets: value.attrs.rule_targets,
        }),
      ),
      Match.orElse(() => undefined),
    ),
  );

  const savedFilter = () => StreamFilter.fromAttrs(rule()?.targets);

  // Compare persisted expressions so omitted/default pane fields do not mark edits.
  const modified = () =>
    !Equal.equals(StreamFilter.toAttrs(props.filter), StreamFilter.toAttrs(savedFilter()));

  const saveChanges = () => {
    const current = rule();

    if (!current) return;

    save({ doc: current.doc, targets: StreamFilter.toAttrs(props.filter) });
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
          <NoteLink id={props.ruleId} class="min-w-0 hover:underline">
            <NoteLabel.Root id={props.ruleId} />
          </NoteLink>
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

const Save = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteRuleTargets.save")(function* (opts: {
      readonly doc: Y.Doc;
      readonly targets: AttrsSchema.TargetFilter;
    }) {
      const attrs = yield* Attrs.Service;
      yield* attrs.setRuleTargets(opts);
    }),
  ),
);

export * as RuleTargets from "./rule-targets";
