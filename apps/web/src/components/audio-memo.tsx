import { useAtom, useAtomSubscribe } from "@effect/atom-solid";
import { createEventListener } from "@solid-primitives/event-listener";
import { Effect, Match as EffectMatch, Stream } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { Match, Show, Switch, createMemo, onMount } from "solid-js";
import { bindRt } from "../lib";
import { AudioMemoSession, State } from "../lib/audio-memo/session";
import { LoadingIcon, RetryIcon, StopIcon, XIcon } from "./icons";
import { Button } from "./ui/button";

export type Draft = AudioMemoSession.Draft;

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
      <div class="flex items-center gap-2">
        <div ref={mountRecorder} class="text-primary-solid min-w-0 flex-1" />
        <span class="text-xs text-text-muted tabular-nums shrink-0">
          {Math.floor(elapsed() / 60)}:{String(elapsed() % 60).padStart(2, "0")}
        </span>
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
      </div>
      <Show when={failure()}>
        {(error) => (
          <p class="text-xs text-text-muted" role="alert">
            {error()}
          </p>
        )}
      </Show>
    </div>
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
