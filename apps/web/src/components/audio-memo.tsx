import { useAtom, useAtomSubscribe, useAtomValue } from "@effect/atom-solid";
import { createEventListener } from "@solid-primitives/event-listener";
import { keyArray } from "@solid-primitives/keyed";
import { Link, getRouteApi } from "@tanstack/solid-router";
import { DateTime, Effect, Match as EffectMatch, Stream } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { For, Match, Show, Switch, createMemo, onMount, type ParentProps } from "solid-js";
import { toast } from "somoto";
import { MatchAsyncResult, bindRt } from "../lib";
import { AudioMemoFiles } from "../lib/audio-memo/files";
import { AudioMemoRecorder } from "../lib/audio-memo/recorder";
import { AudioMemoRepo } from "../lib/audio-memo/repo";
import { AudioMemoSavedSession } from "../lib/audio-memo/saved-session";
import { AudioMemoSession, State } from "../lib/audio-memo/session";
import { DB } from "../lib/db.service";
import { GraphWorkerClient } from "../lib/graph-worker.client";
import { NoteFormat } from "../lib/note/format";
import { PaneCursor } from "../lib/note/pane.cursor";
import { PaneMake } from "../lib/note/pane.make";
import { LoadingIcon, PauseIcon, PlayIcon, RetryIcon, StopIcon, XIcon } from "./icons";
import { PaneEmptyState } from "./note/shared";
import { Button, buttonVariants } from "./ui/button";

export type Draft = AudioMemoSession.Draft;

const route = getRouteApi("/$graph/");

// Navbar and pane share one subscription for the current graph.
const recordingsAtom = bindRt((rt) =>
  rt.atom(AudioMemoRepo.listReactive({ state: ["pending", "error"] }, "desc")),
);

const activePathAtom = bindRt((rt) =>
  rt.atom(
    GraphWorkerClient.Service.useSync(({ client }) => client.audioMemoStatusStream({})).pipe(
      Stream.unwrap,
    ),
  ),
);

export function RecordingsLink() {
  const recordings = useAtomValue(recordingsAtom);
  const panes = route.useSearch({ select: (search) => search.panes });

  const hasRecordings = () => {
    const result = recordings();

    return AsyncResult.isSuccess(result) && result.value.length > 0;
  };

  return (
    <Show when={hasRecordings()}>
      <Link
        from="/$graph/"
        to="/$graph"
        search={{
          panes: PaneCursor.openNext(PaneMake.recordings())({
            stack: panes(),
            index: panes().length - 1,
          }),
        }}
        resetScroll={false}
        class={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Recordings
      </Link>
    </Show>
  );
}

export function RecordingList() {
  const recordings = useAtomValue(recordingsAtom);

  return (
    <MatchAsyncResult
      when={recordings()}
      onFailure={() => <PaneEmptyState>Could not load recordings.</PaneEmptyState>}
      onSuccess={(recordings) => {
        // Database updates must not remount a row and restart its player.
        const rows = keyArray(
          recordings,
          (recording) => recording.path,
          (recording) => <SavedRow recording={recording()} />,
        );

        return (
          <For
            each={rows()}
            fallback={<PaneEmptyState>No pending or failed recordings.</PaneEmptyState>}
          >
            {(row) => row}
          </For>
        );
      }}
    />
  );
}

export function RecordingRow(props: { draft: Draft; onCancel: () => void }) {
  const atoms = bindRt((rt) => {
    const recording = rt
      .fn((element: HTMLDivElement) =>
        AudioMemoSession.make(element, props.draft).pipe(
          Effect.map((session) =>
            session.changes.pipe(Stream.map((state) => ({ session, state }))),
          ),
          Stream.unwrap,
        ),
      )
      .pipe(Atom.setIdleTTL(0));

    const command = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.command")(function* (
          command: "stop" | "retry" | "cancel" | "remove",
          get: Atom.FnContext,
        ) {
          const { session } = yield* get.result(recording);

          return yield* session[command];
        }),
      )
      .pipe(Atom.setIdleTTL(0));

    return { recording, command };
  })();

  const [result, start] = useAtom(() => atoms.recording);
  const [, runCommand] = useAtom(() => atoms.command);

  const state = createMemo(() => {
    const current = result();

    if (AsyncResult.isSuccess(current)) return current.value.state;

    if (AsyncResult.isFailure(current)) return State.StartFailed();

    return State.Starting();
  });

  const failure = createMemo(() =>
    EffectMatch.value(state()).pipe(
      EffectMatch.tag("StartFailed", () => "Could not start recording. Check microphone access."),
      EffectMatch.tag("SaveFailed", () => "Could not save recording."),
      EffectMatch.tag(
        "TranscriptionFailed",
        () => "Transcription failed. Check the OpenAI key and retry.",
      ),
      EffectMatch.tag("RemoveFailed", () => "Could not remove recording."),
      EffectMatch.orElse(() => undefined),
    ),
  );

  const discard = createMemo(() =>
    EffectMatch.value(state()).pipe(
      EffectMatch.tag(
        "Starting",
        "StartFailed",
        "Recording",
        "SaveFailed",
        () => "cancel" as const,
      ),
      EffectMatch.tag("TranscriptionFailed", "RemoveFailed", () => "remove" as const),
      EffectMatch.orElse(() => undefined),
    ),
  );

  const elapsed = createMemo(() => elapsedSeconds(state()));

  const action = createMemo(() =>
    EffectMatch.value(state()).pipe(
      EffectMatch.tag("Recording", () => "stop" as const),
      EffectMatch.tag("TranscriptionFailed", "RemoveFailed", () => "retry" as const),
      EffectMatch.orElse(() => undefined),
    ),
  );

  useAtomSubscribe(
    () => atoms.recording,
    (current) => {
      if (!AsyncResult.isSuccess(current)) return;

      if (State.$is("Closed")(current.value.state)) props.onCancel();
    },
  );

  function onAction() {
    const command = action();

    if (command) return runCommand(command);
  }

  function onDiscard() {
    if (AsyncResult.isFailure(result())) return props.onCancel();

    const command = discard();

    if (command) return runCommand(command);
  }

  function mountRecorder(element: HTMLDivElement) {
    onMount(() => start(element));
  }

  createEventListener(window, "beforeunload", (event) => {
    if (!AudioMemoSession.hasUnsavedAudio(state())) return;

    event.preventDefault();
    event.returnValue = "";
  });

  return (
    <div class="flex flex-col gap-1">
      <RowBody>
        <Waveform mount={mountRecorder} />
        <Duration seconds={elapsed()} />
        <Show when={!failure() || action()}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={buttonLabel(state())}
            disabled={!action()}
            onClick={onAction}
          >
            <Switch fallback={<LoadingIcon class="size-4 animate-spin" />}>
              <Match when={action() === "stop"}>
                <StopIcon class="size-4" />
              </Match>
              <Match when={action() === "retry"}>
                <RetryIcon class="size-4" />
              </Match>
            </Switch>
          </Button>
        </Show>
        <Show when={discard()}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={discard() === "remove" ? "Remove recording" : "Cancel recording"}
            onClick={onDiscard}
          >
            <XIcon class="size-4" />
          </Button>
        </Show>
      </RowBody>
      <Failure message={failure()} />
    </div>
  );
}

export function SavedRow(props: { recording: AudioMemoRepo.Record }) {
  const atoms = bindRt((rt) => {
    const player = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.loadPlayer")(function* (element: HTMLDivElement) {
          const { localGraphId } = yield* DB.Config;
          const blob = yield* AudioMemoFiles.read(localGraphId, props.recording.path);

          return yield* AudioMemoRecorder.makePlayer({ element, blob });
        }),
      )
      .pipe(Atom.setIdleTTL(0));

    const actions = rt
      .atom(
        AudioMemoSavedSession.make(props.recording.path).pipe(
          Effect.map((session) =>
            session.changes.pipe(Stream.map((action) => ({ session, action }))),
          ),
          Stream.unwrap,
        ),
      )
      .pipe(Atom.setIdleTTL(0));

    const isPlaying = Atom.readable((get) => {
      const result = get(player);

      if (!AsyncResult.isSuccess(result)) return false;

      return get(result.value.isPlaying);
    });

    const playPause = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.playPause")(function* (_: void, get: Atom.FnContext) {
          const current = yield* get.result(player);

          return yield* current.playPause.pipe(
            Effect.catch(() =>
              Effect.sync(() => {
                toast.error("Could not play the recording.");
              }),
            ),
          );
        }),
      )
      .pipe(Atom.setIdleTTL(0));

    const command = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.savedCommand")(function* (
          command: "retry" | "remove",
          get: Atom.FnContext,
        ) {
          const { session } = yield* get.result(actions);

          return yield* session[command];
        }),
      )
      .pipe(Atom.setIdleTTL(0));

    return { player, actions, isPlaying, playPause, command };
  })();

  const [player, start] = useAtom(() => atoms.player);
  const actions = useAtomValue(() => atoms.actions);
  const isPlaying = useAtomValue(() => atoms.isPlaying);
  const [, togglePlayback] = useAtom(() => atoms.playPause);
  const [, runCommand] = useAtom(() => atoms.command);
  const activePath = useAtomValue(activePathAtom);

  const isTranscribing = () => {
    const result = activePath();

    return AsyncResult.isSuccess(result) && result.value === props.recording.path;
  };

  const action = createMemo(() => {
    const current = actions();

    if (AsyncResult.isSuccess(current)) return current.value.action;

    return AudioMemoSavedSession.Action.Idle();
  });

  const canAct = () => {
    const result = actions();

    return AsyncResult.isSuccess(result) && AudioMemoSavedSession.canAct(result.value.action);
  };

  const failure = createMemo(() => {
    const actionError = EffectMatch.value(action()).pipe(
      EffectMatch.tag("RetryFailed", () => "Could not retry transcription."),
      EffectMatch.tag("RemoveFailed", () => "Could not remove recording."),
      EffectMatch.orElse(() => undefined),
    );

    if (actionError) return actionError;

    if (AsyncResult.isFailure(actions())) return "Could not load recording actions.";

    if (AsyncResult.isFailure(player())) return "Could not load the recording audio.";

    if (props.recording.state === "error")
      return "Transcription failed. Check the OpenAI key and retry.";
  });

  function mountPlayer(element: HTMLDivElement) {
    onMount(() => start(element));
  }

  const statusLabel = () => {
    if (!canAct()) return "Processing recording";

    if (props.recording.state === "error") return "Retry transcription";

    if (isTranscribing()) return "Transcribing recording";

    return "Pending transcription";
  };

  return (
    <article class="border-t border-border-subtle px-4 py-3 pane:px-0">
      <div class="flex flex-col gap-1">
        <RowBody>
          <Waveform mount={mountPlayer} />
          <Duration seconds={Math.floor((props.recording.durationMs ?? 0) / 1000)} />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isPlaying() ? "Pause recording" : "Play recording"}
            disabled={!AsyncResult.isSuccess(player())}
            onClick={() => togglePlayback()}
          >
            <Show when={isPlaying()} fallback={<PlayIcon class="size-4" />}>
              <PauseIcon class="size-4" />
            </Show>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={statusLabel()}
            title={statusLabel()}
            disabled={!canAct() || props.recording.state !== "error"}
            onClick={() => runCommand("retry")}
          >
            <Show
              when={canAct() && props.recording.state === "error"}
              fallback={<LoadingIcon class="size-4 animate-spin" />}
            >
              <RetryIcon class="size-4" />
            </Show>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove recording"
            disabled={!canAct()}
            onClick={() => runCommand("remove")}
          >
            <XIcon class="size-4" />
          </Button>
        </RowBody>
        <div class="flex items-baseline justify-between gap-2">
          <Failure message={failure()} />
          <time
            class="ml-auto shrink-0 text-xs text-fg-subtle"
            dateTime={DateTime.formatIso(props.recording.recordedAt)}
          >
            {NoteFormat.formatUpdatedAt(props.recording.recordedAt)}
          </time>
        </div>
      </div>
    </article>
  );
}

function RowBody(props: ParentProps) {
  return <div class="flex items-center gap-2">{props.children}</div>;
}

function Waveform(props: { mount: (element: HTMLDivElement) => void }) {
  return <div ref={props.mount} class="text-primary-solid min-w-0 flex-1 h-14" />;
}

function Duration(props: { seconds: number }) {
  return (
    <span class="text-xs text-text-muted tabular-nums shrink-0">
      {Math.floor(props.seconds / 60)}:{String(props.seconds % 60).padStart(2, "0")}
    </span>
  );
}

function Failure(props: { message?: string }) {
  return (
    <Show when={props.message}>
      {(message) => (
        <p class="text-xs text-text-muted" role="alert">
          {message()}
        </p>
      )}
    </Show>
  );
}

function elapsedSeconds(state: AudioMemoSession.State) {
  return EffectMatch.value(state).pipe(
    EffectMatch.tag("Recording", (state) => state.elapsedSeconds),
    EffectMatch.tag("Saving", "SaveFailed", (state) =>
      Math.floor(state.capture.recording.durationMs / 1000),
    ),
    EffectMatch.tag(
      "Pending",
      "Retrying",
      "TranscriptionFailed",
      "Removing",
      "RemoveFailed",
      (state) => Math.floor(state.recording.durationMs / 1000),
    ),
    EffectMatch.orElse(() => 0),
  );
}

function buttonLabel(state: AudioMemoSession.State) {
  return EffectMatch.value(state).pipe(
    EffectMatch.tag("Recording", () => "Stop recording"),
    EffectMatch.tag("RemoveFailed", () => "Retry removing recording"),
    EffectMatch.tag("TranscriptionFailed", () => "Retry transcription"),
    EffectMatch.orElse(() => "Processing recording"),
  );
}

export * as AudioMemo from "./audio-memo";
