import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { useAtom, useAtomMount, useAtomSubscribe, useAtomValue } from "@effect/atom-solid";
import { createEventListener } from "@solid-primitives/event-listener";
import { keyArray } from "@solid-primitives/keyed";
import { Link, getRouteApi } from "@tanstack/solid-router";
import { Array, DateTime, Effect, Match as EffectMatch, Option, Predicate, Stream } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { For, Match, Show, Switch, createMemo, onMount, type ParentProps } from "solid-js";
import { toast } from "somoto";
import { MatchAsyncResult, RecordCache, RecordSchema, bindRt } from "../lib";
import { AudioMemoFiles } from "../lib/audio-memo/files";
import { AudioMemoRecorder } from "../lib/audio-memo/recorder";
import { AudioMemoRepo } from "../lib/audio-memo/repo";
import { AtomUtils } from "../lib/atom";
import { AudioMemoService } from "../lib/audio-memo/service";
import { AudioMemoSession } from "../lib/audio-memo/session";
import { DB } from "@manotes/shared/db.service";
import { GraphWorkerClient } from "../lib/graph-worker.client";
import { RecordFormat } from "@manotes/shared/record/format";
import { PaneCursor } from "../lib/record/pane.cursor";
import { PaneCtx } from "../lib/record/pane.ctx";
import { LoadingIcon, PauseIcon, PlayIcon, RetryIcon, StopIcon, XIcon } from "./icons";
import { PaneEmptyState } from "./record/shared";
import { Button, buttonVariants } from "./ui/button";

export type Draft = AudioMemoSession.Draft;

const route = getRouteApi("/$graph/");

// Navbar and pane share one subscription for the current graph.
const recordingsAtom = bindRt((rt) => {
  return rt.atom(AudioMemoRepo.listReactive({ state: ["pending", "error"] }, "desc"));
});

const completionAtom = bindRt((rt) => {
  const recordings = recordingsAtom();

  return rt
    .atom((get) => {
      return get.streamResult(recordings).pipe(
        Stream.zipWithPrevious,
        // The initial snapshot is only a baseline. Watch rows leaving the list,
        // outside their component scopes so unmounting can't cancel completion.
        Stream.flatMap(([previous, current]) => {
          return Stream.fromIterable(
            Array.differenceWith<AudioMemoRepo.Record>((a, b) => a.path === b.path)(
              Option.getOrElse(previous, () => []),
              current,
            ),
          );
        }),
        Stream.flatMap((recording) => {
          return Stream.fromEffect(AudioMemoRepo.get(recording.path)).pipe(
            Stream.filter((row) => row.state === "completed"),
            // Completion is committed before materialization. Wait until the
            // transcript exists so the notification's Open action can use it.
            Stream.flatMap((row) => {
              return RecordCache.Service.use((cache) => cache.changes(row.recordId)).pipe(
                Stream.unwrap,
                Stream.filter(Option.isSome),
                Stream.take(1),
                Stream.map(() => row.recordId),
              );
            }),
            // A manually removed recording has no row and no transcript to open.
            Stream.catchTag("DB.NotFoundError", () => Stream.empty),
          );
        }),
      );
    })
    .pipe(Atom.setIdleTTL(0));
});

const activePathAtom = bindRt((rt) => {
  return rt.atom(
    GraphWorkerClient.Service.useSync(({ client }) => client.audioMemoStatusStream({})).pipe(
      Stream.unwrap,
    ),
  );
});

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
          panes: PaneCursor.openNext(PaneSchema.make.recordings({}))({
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
  const notifyReady = useNotifyReady();

  // A subscription alone doesn't initialize an unread atom. Mount the watcher
  // separately so subscribing doesn't replay its last completion notification.
  useAtomMount(completionAtom);
  useAtomSubscribe(completionAtom, (result) => {
    if (AsyncResult.isSuccess(result)) notifyReady(result.value);
  });

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

export function useNotifyReady(): (recordId: RecordSchema.Id) => void {
  const ctx = PaneCtx.use();
  const navigate = route.useNavigate();
  const params = route.useParams();

  return (recordId) => {
    const link = {
      ...PaneCtx.linkOptions(ctx, PaneCursor.openNext(PaneSchema.make.record({ id: recordId }))),
      params: params(),
    };

    toast.success("Audio memo ready", {
      // The draft and recordings list can observe the same completion.
      id: recordId,
      action: {
        label: "Open",
        onClick: () => void navigate(link),
      },
    });
  };
}

export function RecordingRow(props: { draft: Draft; onCancel: () => void }) {
  const atoms = bindRt((rt) => {
    const recording = rt
      .fn((element: HTMLDivElement) => {
        return AudioMemoSession.make(element, props.draft).pipe(
          Effect.map((session) => {
            return session.changes.pipe(Stream.map((result) => ({ session, result })));
          }),
          Stream.unwrap,
        );
      })
      .pipe(Atom.setIdleTTL(0));

    const command = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.command")(function* (
          command: AudioMemoSession.Command,
          get: Atom.FnContext,
        ) {
          const { session } = yield* get.result(recording);

          return yield* session.run(command);
        }),
      )
      .pipe(AtomUtils.ignoreWhileWaiting);

    return { recording, command };
  })();

  const [result, start] = useAtom(() => atoms.recording);
  const [, runCommand] = useAtom(() => atoms.command);

  const state = createMemo<AudioMemoSession.Result>(() => {
    const current = result();

    if (AsyncResult.isSuccess(current)) return current.value.result;

    if (AsyncResult.isFailure(current)) {
      return AsyncResult.fail(
        new AudioMemoSession.SessionError({ operation: "start", cause: current.cause }),
      );
    }

    return AsyncResult.initial(true);
  });

  const failure = () => failureMessage(state());
  const discardCommand = () => discard(state());
  const actionCommand = () => action(state());
  const elapsed = () => elapsedSeconds(AudioMemoSession.value(state()));

  useAtomSubscribe(
    () => atoms.recording,
    (current) => {
      if (!AsyncResult.isSuccess(current)) return;

      if (AudioMemoSession.value(current.value.result)?._tag === "Closed") props.onCancel();
    },
  );

  function onAction() {
    const command = actionCommand();

    if (command) return runCommand(AudioMemoSession.Command[command]());
  }

  function onDiscard() {
    if (AsyncResult.isInitial(state()) || AsyncResult.isFailure(result())) return props.onCancel();

    const command = discardCommand();

    if (command) return runCommand(AudioMemoSession.Command[command]());
  }

  function mountRecorder(element: HTMLDivElement) {
    onMount(() => start(element));
  }

  createEventListener(window, "beforeunload", (event) => {
    const phase = AudioMemoSession.value(state());

    if (!Predicate.isTagged(phase, "Recording") && !Predicate.isTagged(phase, "Captured")) return;

    event.preventDefault();
    event.returnValue = "";
  });

  return (
    <div class="flex flex-col gap-1 p-4">
      <RowBody>
        <Waveform mount={mountRecorder} />
        <Duration seconds={elapsed()} />
        <div class="-mx-2 flex shrink-0 items-center">
          <Show when={!failure() || actionCommand()}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={buttonLabel(actionCommand())}
              disabled={!actionCommand()}
              onClick={onAction}
            >
              <Switch fallback={<LoadingIcon class="size-4 animate-spin" />}>
                <Match when={actionCommand() === "stop"}>
                  <StopIcon class="size-4" />
                </Match>
                <Match
                  when={
                    actionCommand() === "retry" ||
                    actionCommand() === "reload" ||
                    actionCommand() === "remove"
                  }
                >
                  <RetryIcon class="size-4" />
                </Match>
              </Switch>
            </Button>
          </Show>
          <Show when={discardCommand()}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={discardCommand() === "remove" ? "Remove recording" : "Cancel recording"}
              onClick={onDiscard}
            >
              <XIcon class="size-4" />
            </Button>
          </Show>
        </div>
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
            Effect.catch(() => {
              return Effect.sync(() => {
                toast.error("Could not play the recording.");
              });
            }),
          );
        }),
      )
      .pipe(Atom.setIdleTTL(0));

    const command = rt
      .fn(
        Effect.fn("ComponentsAudioMemo.savedCommand")(function* (command: "retry" | "remove") {
          const action = Effect.gen(function* () {
            if (command === "retry") return yield* AudioMemoService.retry(props.recording.path);

            const { client } = yield* GraphWorkerClient.Service;

            return yield* client
              .removeAudioMemo({ path: props.recording.path })
              .pipe(Effect.uninterruptible);
          });

          return yield* action.pipe(
            Effect.catchCause((cause) => {
              return Effect.fail(new AudioMemoSession.SessionError({ operation: command, cause }));
            }),
          );
        }),
      )
      .pipe(AtomUtils.ignoreWhileWaiting);

    return { player, isPlaying, playPause, command };
  })();

  const [player, start] = useAtom(() => atoms.player);
  const isPlaying = useAtomValue(() => atoms.isPlaying);
  const [, togglePlayback] = useAtom(() => atoms.playPause);
  const [commands, runCommand] = useAtom(() => atoms.command);
  const activePath = useAtomValue(activePathAtom);

  const isTranscribing = () => {
    const result = activePath();

    return AsyncResult.isSuccess(result) && result.value === props.recording.path;
  };

  const state = createMemo(() => withRecording(commands(), props.recording));

  const canAct = () => !state().waiting;

  const failure = createMemo(() => {
    const message = failureMessage(state());

    if (message) return message;

    if (AsyncResult.isFailure(player())) return "Could not load the recording audio.";
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
    <article class="border-t border-border-subtle p-4">
      <div class="flex flex-col gap-1">
        <RowBody>
          <Waveform mount={mountPlayer} />
          <Duration seconds={Math.floor((props.recording.durationMs ?? 0) / 1000)} />
          <div class="-mx-2 flex shrink-0 items-center">
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
          </div>
        </RowBody>
        <div class="flex items-baseline justify-between gap-2">
          <Failure message={failure()} />
          <time
            class="ml-auto shrink-0 text-xs text-fg-subtle"
            dateTime={DateTime.formatIso(props.recording.recordedAt)}
          >
            {RecordFormat.formatUpdatedAt(props.recording.recordedAt)}
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

function action(
  result: AudioMemoSession.Result,
): "stop" | "retry" | "remove" | "reload" | undefined {
  if (result.waiting) return;
  const phase = AudioMemoSession.value(result);

  if (
    Predicate.isTagged(phase, "Closed") ||
    (Predicate.isTagged(phase, "Saved") && phase.recording.state === "completed")
  ) {
    return;
  }

  const operation = AudioMemoSession.error(result)?.operation;

  if (operation === "load") return "reload";

  if (operation === "retry" || operation === "remove") return operation;

  if (Predicate.isTagged(phase, "Recording")) return "stop";

  if (Predicate.isTagged(phase, "Saved") && phase.recording.state === "error") return "retry";
}

function discard(result: AudioMemoSession.Result): "cancel" | "remove" | undefined {
  const phase = AudioMemoSession.value(result);

  if (!phase) return "cancel";

  if (
    result.waiting ||
    Predicate.isTagged(phase, "Closed") ||
    AudioMemoSession.error(result)?.operation === "load"
  ) {
    return;
  }

  if (!Predicate.isTagged(phase, "Saved")) return "cancel";

  if (
    phase.recording.state !== "completed" &&
    (phase.recording.state === "error" || AudioMemoSession.error(result))
  ) {
    return "remove";
  }
}

function failureMessage(result: AudioMemoSession.Result) {
  const operation = AudioMemoSession.error(result)?.operation;

  switch (operation) {
    case "start":
      return "Could not start recording. Check microphone access.";
    case "save":
      return "Could not save recording.";
    case "load":
      return "Could not load recording.";
    case "retry":
      return "Could not retry transcription.";
    case "remove":
      return "Could not remove recording.";
  }

  const phase = AudioMemoSession.value(result);

  if (Predicate.isTagged(phase, "Saved") && phase.recording.state === "error") {
    return "Transcription failed. Check the OpenAI key and retry.";
  }
}

function withRecording(
  result: AsyncResult.AsyncResult<unknown, unknown>,
  recording: AudioMemoRepo.Record,
): AudioMemoSession.Result {
  const saved = AsyncResult.success(AudioMemoSession.Phase.Saved({ recording }));

  if (!AsyncResult.isFailure(result)) {
    return AsyncResult.success(saved.value, { waiting: result.waiting });
  }

  const failure = Option.getOrUndefined(AsyncResult.error(result));

  return AsyncResult.fail(
    failure instanceof AudioMemoSession.SessionError
      ? failure
      : new AudioMemoSession.SessionError({ operation: "load", cause: result.cause }),
    { previousSuccess: Option.some(saved), waiting: result.waiting },
  );
}

function elapsedSeconds(phase: AudioMemoSession.Phase | undefined) {
  if (!phase) return 0;

  return EffectMatch.value(phase).pipe(
    EffectMatch.tag("Recording", ({ elapsedSeconds }) => elapsedSeconds),
    EffectMatch.tag("Captured", ({ capture }) => Math.floor(capture.recording.durationMs / 1000)),
    EffectMatch.tag("Saved", ({ recording }) => Math.floor((recording.durationMs ?? 0) / 1000)),
    EffectMatch.orElse(() => 0),
  );
}

function buttonLabel(command: "stop" | "retry" | "remove" | "reload" | undefined) {
  return EffectMatch.value(command).pipe(
    EffectMatch.when("stop", () => "Stop recording"),
    EffectMatch.when("remove", () => "Retry removing recording"),
    EffectMatch.when("retry", () => "Retry transcription"),
    EffectMatch.when("reload", () => "Retry loading recording"),
    EffectMatch.orElse(() => "Processing recording"),
  );
}

export * as AudioMemo from "./audio-memo";
