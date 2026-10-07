import { useAtomSubscribe } from "@effect/atom-solid";
import { DateTime, Effect, Option, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { nanoid } from "nanoid";
import { type Accessor } from "solid-js";
import { NoteCache, NoteSchema, bindRt, createAtomState } from "../../lib";
import { PaneCtx } from "../../lib/note/pane.ctx";
import type { NoteStream } from "../../lib/note/stream";
import { toLocalDateString } from "../../lib/temporal/utils";
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

  const completionAtom = bindRt((rt) =>
    rt.atom((get) => {
      const id = get(draftAtom)?.id;

      // Stream.empty preserves and re-emits the atom's previous success, which
      // can trigger another toast while clearing the draft. Emit null to reset it.
      if (id === undefined) return Stream.succeed(null);

      // Give the notes stream a second to replace the draft. If it doesn't
      // (for example, due to filtering), clear it here. Clearing the draft
      // through row cleanup invalidates this atom and cancels the wait.
      return NoteCache.Service.use((cache) => cache.changes(id)).pipe(
        Stream.unwrap,
        Stream.filter(Option.isSome),
        Stream.take(1),
        Stream.mapEffect(() => Effect.as(Effect.sleep("1 second"), id)),
        Stream.filter((noteId) => get.once(draftAtom)?.id === noteId),
      );
    }),
  );

  useAtomSubscribe(
    completionAtom,
    (result) => {
      if (!AsyncResult.isSuccess(result) || result.value === null) return;

      clearDraft(result.value);
      notifyReady(result.value);
    },
    { immediate: true },
  );

  function clearDraft(id: NoteSchema.Id) {
    if (draftId() !== id) return;

    setDraft(undefined);
  }

  function createControls(options: {
    enabled: Accessor<boolean>;
    getFocusedRow(): NoteStream.InnerItem | undefined;
  }): Accessor<RecordControls | undefined> {
    function onRecord() {
      if (!options.enabled() || draft()) return;

      // Resolve the originating row and snapshot its context only when clicked.
      const now = Effect.runSync(DateTime.now);
      const row = options.getFocusedRow();
      const backlink = pane().filter.backlinksTo;

      const value: AudioMemo.Draft = {
        id: NoteSchema.Id.make(nanoid()),
        createdAt: now,
        intent: {
          date: row?.note.date ?? pane().filter.date ?? toLocalDateString(now),
          backlink: backlink === undefined ? null : NoteSchema.Id.make(backlink),
        },
      };

      setDraft(value);
      focus.request(fid.note(value.id), { reveal: "always" });
    }

    return () => {
      if (!options.enabled()) return;

      return { onRecord, isDisabled: !!draft() };
    };
  }

  return { draftAtom, draftId, createControls, clearDraft };
}

export * as PaneStreamRecording from "./pane-stream-recording";
