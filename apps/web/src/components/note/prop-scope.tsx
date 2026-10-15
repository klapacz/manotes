import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { getRouteApi } from "@tanstack/solid-router";
import { Effect, Equal, Exit, Predicate } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { createStreamRefLabel } from "../../lib/editor/stream-ref/extension";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { NoteLink } from "../../lib/note/link-component";
import { ArrowUpRightIcon } from "../icons";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { NoteLabel } from "./note-label";
import { SyncedAttrs } from "../../lib/editor/synced-attrs";

const route = getRouteApi("/$graph/");

export function Link(props: {
  propId: AttrsSchema.NoteId;
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
    const input = PaneMake.propScope({ propId: props.propId, filter: filter() });

    if (scroll.scrollToPane(input).found) return;
    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
  };

  return (
    <Button variant="ghost" size="xs" onClick={open}>
      {label()}
      <ArrowUpRightIcon />
    </Button>
  );
}

export function Header(props: {
  propId: AttrsSchema.NoteId;
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

  const savedFilter = () => StreamFilter.fromAttrs(definition()?.targets);

  const modified = () =>
    !Equal.equals(StreamFilter.toAttrs(props.filter), StreamFilter.toAttrs(savedFilter()));

  const saveChanges = () => {
    const current = definition();

    if (!current) return;

    void save({ doc: current.doc, targets: StreamFilter.toAttrs(props.filter) });
  };

  const clearScope = async () => {
    const current = definition();

    if (!current) return;

    const exit = await save({ doc: current.doc, targets: undefined });

    if (Exit.isFailure(exit)) return;

    props.onDiscard(StreamFilter.fromAttrs(undefined));
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
          <NoteLink id={props.propId} class="min-w-0 hover:underline">
            <NoteLabel.Root id={props.propId} />
          </NoteLink>
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

const Save = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNotePropScope.save")(function* (opts: {
      readonly doc: Y.Doc;
      readonly targets: AttrsSchema.TargetFilter | undefined;
    }) {
      const attrs = yield* Attrs.Service;
      yield* attrs.setPropTargets(opts);
    }),
  ),
);

export * as PropScope from "./prop-scope";
