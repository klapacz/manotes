import { useAtom } from "../../lib/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Effect, Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";
import { createMemo, Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { SyncedAttrs } from "../../lib/editor/synced-attrs";
import { RecordLink } from "../../lib/record/link-component";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { RecordLabel } from "./record-label";
import { StreamFilterLink } from "./stream-filter-link";

export function Links(props: {
  presetId: AttrsSchema.RecordId;
  filter: AttrsSchema.Filter | undefined;
}) {
  return (
    <StreamFilterLink
      filter={props.filter}
      source={PaneSchema.Source.cases.preset.make({ id: props.presetId })}
    />
  );
}

export function Header(props: {
  presetId: AttrsSchema.RecordId;
  filter: StreamSettings.Filter;
  onDiscard: (filter: StreamSettings.Filter) => void;
}) {
  const id = createSyncedAtom(() => props.presetId);

  const state = createAtomResultStore(
    bindRt((rt) => rt.atom((get) => SyncedAttrs.watch({ id: get(id) }))),
  );

  const [mutation, save] = useAtom(Save);

  const preset = createMemo(() => {
    return Match.value(state).pipe(
      Match.when(
        { _tag: "Success", value: { attrs: { _tag: Match.is("preset") } } },
        ({ value }) => ({
          doc: value.doc,
          filter: value.attrs.preset_filter,
        }),
      ),
      Match.orElse(() => undefined),
    );
  });

  const savedFilter = () => preset()?.filter ?? [];

  const modified = () => {
    return !Schema.toEquivalence(AttrsSchema.Filter)(props.filter, savedFilter());
  };

  const saveChanges = () => {
    const current = preset();

    if (!current) return;

    save({ doc: current.doc, filter: props.filter });
  };

  return (
    <div class="px-4 pb-3 pane:px-0">
      <Alert
        variant={preset() && modified() ? "warning" : "default"}
        class="flex flex-wrap items-center gap-2 px-3 py-2"
      >
        <span class="flex min-w-0 flex-1 gap-1">
          <Show when={preset() && modified()} fallback="You're viewing preset">
            You modified preset
          </Show>
          <RecordLink id={props.presetId} class="min-w-0 hover:underline">
            <RecordLabel.Root id={props.presetId} />
          </RecordLink>
        </span>
        <Show when={preset() && modified()}>
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
            Loading: () => <span>Loading preset…</span>,
            Error: () => <span class="text-error-fg">Unable to load preset.</span>,
            Success: () => (
              <Show when={!preset()}>
                <span class="text-error-fg">Preset unavailable.</span>
              </Show>
            ),
          }}
        />
        <Show when={AsyncResult.isFailure(mutation())}>
          <span class="text-error-fg">Unable to save preset.</span>
        </Show>
      </Alert>
    </div>
  );
}

const Save = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordPresetFilter.save")(function* (opts: {
      readonly doc: Y.Doc;
      readonly filter: AttrsSchema.Filter;
    }) {
      const attrs = yield* Attrs.Service;

      yield* attrs.setPresetFilter({ doc: opts.doc, filter: opts.filter });
    }),
  );
});

export * as PresetFilter from "./preset-filter";
