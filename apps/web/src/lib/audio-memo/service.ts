import * as OpenAITranscriber from "@effect-uai/openai/OpenAITranscriber";
import { DateTime, Effect, Option, Redacted } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { nanoid } from "nanoid";
import { DB } from "../db.service";
import { NoteRepo } from "../note.repo";
import { EventRepo } from "../event.repo";
import { EventSchema } from "../event.schema";
import { MaterializationCheckpointRepo } from "../materialization-checkpoint.repo";
import { ProsemirrorEncode } from "../prosemirror/encode";
import { AudioMemoFiles } from "./files";
import { AudioMemoRepo } from "./repo";
import type { AudioMemoIntent } from "./intent";
import type { NoteSchema } from "../note.schema";

export const register = Effect.fn("AudioMemoService.register")(function* (
  recording: Pick<AudioMemoRepo.Record, "path" | "recordedAt" | "mimeType" | "durationMs"> & {
    noteId: NoteSchema.Id;
    intent: AudioMemoIntent.Record;
  },
) {
  yield* AudioMemoRepo.insert({ ...recording, state: "pending" });
});

export const retry = Effect.fn("AudioMemoService.retry")(function* (path: string) {
  yield* AudioMemoRepo.update({ path, state: ["error"] }, { state: "pending" });
});

export const remove = Effect.fn("AudioMemoService.remove")(function* (path: string) {
  const { localGraphId } = yield* DB.Config;
  yield* AudioMemoFiles.remove(localGraphId, path);
  yield* AudioMemoRepo.remove(path);
});

export const transcribe = Effect.fn("AudioMemoService.transcribe")(
  function* (path: string, apiKey: Redacted.Redacted<string>) {
    const recording = yield* AudioMemoRepo.get(path);

    if (recording.state !== "pending") return;

    const transcript = yield* transcribeFile(recording, apiKey);
    yield* publish(recording, transcript);
  },
  (effect, path) => {
    return effect.pipe(
      Effect.catch(() => AudioMemoRepo.update({ path, state: ["pending"] }, { state: "error" })),
    );
  },
);

const transcribeFile = Effect.fn("AudioMemoService.transcribeFile")(
  function* ({ path, mimeType }: AudioMemoRepo.Record, apiKey: Redacted.Redacted<string>) {
    const { localGraphId } = yield* DB.Config;

    const bytes = yield* AudioMemoFiles.read(localGraphId, path).pipe(
      Effect.flatMap((file) =>
        Effect.tryPromise(() => file.arrayBuffer().then((buffer) => new Uint8Array(buffer))),
      ),
    );

    const client = yield* OpenAITranscriber.make({ apiKey });

    const result = yield* client
      .transcribe({
        model: "gpt-transcribe",
        // eslint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- effect-uai exposes a structural MediaBytes union without a constructor.
        audio: { _tag: "bytes", bytes, mimeType },
        fileName: path,
      })
      .pipe(Effect.timeout("5 minutes"));

    if (!result.text.trim()) return yield* Effect.fail(new Error("No speech was detected."));

    return result.text;
  },
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
);

// Both events and recording completion live in the graph DB. No checkpoint wait
// may run inside this transaction: the materializer needs to acquire the DB itself.
const publish = Effect.fn("AudioMemoService.publish")(function* (
  { path, recordedAt, noteId, intent }: AudioMemoRepo.Record,
  transcript: string,
) {
  const db = yield* DB.Service;
  const events = yield* EventRepo.Service;
  const checkpoint = yield* MaterializationCheckpointRepo.Service;
  const categoryId = yield* getCategoryNoteId();

  const localSeq = yield* db.transaction(
    Effect.gen(function* () {
      yield* events.create({
        noteId,
        type: "update",
        createdAt: recordedAt,
        payload: transcriptPayload({ categoryId, transcript, backlink: intent.backlink }),
      });

      const last = yield* events.create({
        noteId,
        type: "date",
        createdAt: recordedAt,
        payload: yield* EventSchema.encodeDatePayload({ date: intent.date }),
      });

      yield* AudioMemoRepo.update({ path }, { state: "completed" });

      return last.localSeq;
    }),
  );

  yield* checkpoint.waitUntilAtLeast(localSeq);
});

const CATEGORY_TITLE = "Audio memos";

const getCategoryNoteId = Effect.fn("AudioMemoService.getCategoryNoteId")(function* () {
  const events = yield* EventRepo.Service;
  const notes = yield* NoteRepo.Service;

  const category = yield* notes.findIdByTitle(CATEGORY_TITLE);
  const categoryId = Option.getOrElse(category, () => ({ id: nanoid() })).id;

  const createdAt = yield* DateTime.now;

  if (Option.isNone(category)) {
    yield* events.create({
      noteId: categoryId,
      type: "update",
      createdAt,
      payload: ProsemirrorEncode.encodeDocument([
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: CATEGORY_TITLE }],
        },
      ]),
    });
  }

  return categoryId;
});

function transcriptPayload({
  categoryId,
  transcript,
  backlink,
}: {
  categoryId: string;
  transcript: string;
  backlink: string | null;
}) {
  return ProsemirrorEncode.encodeDocument(
    transcript
      .trim()
      .split(/\n+/u)
      .map((text, index) => ({
        type: "paragraph",
        content:
          index === 0
            ? [
                ...(backlink === null || backlink === categoryId
                  ? []
                  : [
                      { type: "backlink", attrs: { id: backlink } },
                      { type: "text", text: " " },
                    ]),
                { type: "backlink", attrs: { id: categoryId } },
                { type: "text", text: ` ${text}` },
              ]
            : [{ type: "text", text }],
      })),
  );
}

export * as AudioMemoService from "./service";
