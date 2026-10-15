import { useAtomSubscribe } from "@effect/atom-solid";
import { DateTime, Effect, Option, Stream } from "effect";
import { AsyncResult } from "effect/reactivity";
import { nanoid } from "nanoid";
import { type Accessor } from "solid-js";
import { RecordCache, RecordSchema, bindRt, createAtomState } from "../../lib";
import { PaneCtx } from "../../lib/record/pane.ctx";
import type { RecordStream } from "../../lib/record/stream";
import { toLocalDateString } from "@manotes/shared/temporal/utils";
import { AudioMemo } from "../audio-memo";
import { Focus } from "./focus";
import type { RecordControls } from "./shared";

export function use() {
  const pane = PaneCtx.useStream();
  const notifyReady = AudioMemo.useNotifyReady();
  const focus = Focus.use();
  const fid = Focus.useId();
  const [draft, setDraft, draftAtom] = createAtomState<AudioMemo.Draft | undefined>(undefined);
  const draftId = () => draft()?.id;

  const completionAtom = bindRt((rt) => {
    return rt.atom((get) => {
      const id = get(draftAtom)?.id;

      // Stream.empty preserves and re-emits the atom's previous success, which
      // can trigger another toast while clearing the draft. Emit null to reset it.
      if (id === undefined) return Stream.succeed(null);

      // Give the records stream a second to replace the draft. If it doesn't
      // (for example, due to filtering), clear it here. Clearing the draft
      // through row cleanup invalidates this atom and cancels the wait.
      return RecordCache.Service.use((cache) => cache.changes(id)).pipe(
        Stream.unwrap,
        Stream.filter(Option.isSome),
        Stream.take(1),
        Stream.mapEffect(() => Effect.as(Effect.sleep("1 second"), id)),
        Stream.filter((recordId) => get.once(draftAtom)?.id === recordId),
      );
    });
  });

  useAtomSubscribe(
    completionAtom,
    (result) => {
      if (!AsyncResult.isSuccess(result) || result.value === null) return;

      clearDraft(result.value);
      notifyReady(result.value);
    },
    { immediate: true },
  );

  function clearDraft(id: RecordSchema.Id) {
    if (draftId() !== id) return;

    setDraft(undefined);
  }

  function createControls(options: {
    enabled: Accessor<boolean>;
    getFocusedRow(): RecordStream.InnerItem | undefined;
  }): Accessor<RecordControls | undefined> {
    function onRecord() {
      if (!options.enabled() || draft()) return;

      // Resolve the originating row and snapshot its context only when clicked.
      const now = Effect.runSync(DateTime.now);
      const row = options.getFocusedRow();
      const backlink = pane().filter.backlinksTo;

      const value: AudioMemo.Draft = {
        id: RecordSchema.Id.make(nanoid()),
        createdAt: now,
        intent: {
          date: row?.record.date ?? pane().filter.date ?? toLocalDateString(now),
          backlink: backlink === undefined ? null : RecordSchema.Id.make(backlink),
        },
      };

      setDraft(value);
      focus.request(fid.record(value.id), { reveal: "always" });
    }

    return () => {
      if (!options.enabled()) return;

      return { onRecord, isDisabled: !!draft() };
    };
  }

  return { draftAtom, draftId, createControls, clearDraft };
}

export * as PaneStreamRecording from "./pane-stream-recording";
