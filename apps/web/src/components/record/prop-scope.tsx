import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Effect, Equal, Exit, Predicate, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { createMemo, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { createStreamRefLabel } from "../../lib/editor/stream-ref/extension";
import { RecordLink } from "../../lib/record/link-component";
import { ArrowUpRightIcon } from "../icons";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { RecordLabel } from "./record-label";
import { SyncedAttrs } from "../../lib/editor/synced-attrs";

import { PaneNavigate } from "../../lib/record/pane.navigate";

export function Link(props: {
  propId: AttrsSchema.RecordId;
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
        source: PaneSchema.Source.cases.prop.make({ id: props.propId }),
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
  propId: AttrsSchema.RecordId;
  filter: StreamSettings.Filter;
  onDiscard: (filter: StreamSettings.Filter) => void;
}) {
  const propId = createSyncedAtom(() => props.propId);
  const [mutation, save] = useAtom(Save, { mode: "promiseExit" });

  const state = createAtomResultStore(
    bindRt((rt) => rt.atom((get) => SyncedAttrs.watch({ id: get(propId) }))),
  );

  const definition = createMemo(() => {
    if (!Predicate.isTagged(state, "Success")) return undefined;

    const { prop_type, prop_targets } = state.value.attrs;

    if (!Predicate.isTagged(state.value.attrs, "prop") || prop_type !== "link") return undefined;

    return { doc: state.value.doc, targets: prop_targets };
  });

  const savedFilter = () => definition()?.targets ?? [];

  const modified = () => {
    return !Equal.equals(props.filter, savedFilter());
  };

  const saveChanges = () => {
    const current = definition();

    if (!current) return;

    void save({ doc: current.doc, targets: props.filter });
  };

  const clearScope = async () => {
    const current = definition();

    if (!current) return;

    const exit = await save({ doc: current.doc, targets: undefined });

    if (Exit.isFailure(exit)) return;

    props.onDiscard([]);
  };

  return (
    <div class="px-4 pb-3 pane:px-0">
      <Alert
        variant={definition() && modified() ? "warning" : "default"}
        class="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <span class="flex min-w-0 flex-1 gap-1">
          <Show when={definition() && modified()} fallback="You're viewing the scope of">
            You modified scope of
          </Show>
          <RecordLink id={props.propId} class="min-w-0 hover:underline">
            <RecordLabel.Root id={props.propId} />
          </RecordLink>
        </span>
        <Show when={definition()}>
          <Show when={modified()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => props.onDiscard(savedFilter())}
              disabled={mutation().waiting}
            >
              Discard
            </Button>
          </Show>
          <Show when={definition()?.targets !== undefined}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void clearScope()}
              disabled={mutation().waiting}
            >
              Clear
            </Button>
          </Show>
          <Show when={modified()}>
            <Button
              variant="outline"
              size="sm"
              class="border-warning-border bg-warning-control text-warning-fg hover:bg-warning-control-hover"
              onClick={() => saveChanges()}
              disabled={mutation().waiting}
            >
              Save
            </Button>
          </Show>
        </Show>
        <MatchTag
          when={state}
          cases={{
            Loading: () => <span>Loading scope…</span>,
            Error: () => <span class="text-error-fg">Unable to load scope.</span>,
            Success: () => (
              <Show when={!definition()}>
                <span class="text-error-fg">Reference definition unavailable.</span>
              </Show>
            ),
          }}
        />
        <Show when={AsyncResult.isFailure(mutation())}>
          <span class="text-error-fg">Unable to save scope.</span>
        </Show>
      </Alert>
    </div>
  );
}

const Save = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordPropScope.save")(function* (opts: {
      readonly doc: Y.Doc;
      readonly targets: AttrsSchema.Filter | undefined;
    }) {
      const attrs = yield* Attrs.Service;

      const targets = yield* Schema.decodeEffect(
        Schema.UndefinedOr(AttrsSchema.Filter.pipe(Schema.decodeTo(AttrsSchema.TargetFilter))),
      )(opts.targets);

      yield* attrs.setPropTargets({ doc: opts.doc, targets });
    }),
  );
});

export * as PropScope from "./prop-scope";
