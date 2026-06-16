import { Context, Effect, Layer, Option } from "effect";
import { pipeline } from "@huggingface/transformers";
import * as NoteEmbeddingRepo from "./note-embedding.repo";
import * as NoteEmbeddingSchema from "./note-embedding.schema";

export const MODEL_ID = NoteEmbeddingSchema.MODEL_ID;
export const DIMENSIONS = NoteEmbeddingSchema.DIMENSIONS;
const BACKFILL_BATCH_SIZE = 25;

export class Service extends Context.Service<Service>()("NoteEmbedding.Service", {
  make: Effect.gen(function* () {
    const repo = yield* NoteEmbeddingRepo.Service;

    const upsertForMaterializedNote = Effect.fn("NoteEmbedding.upsertForMaterializedNote")(
      function* ({ noteId, text, updatedAt }: MaterializedNoteInput) {
        const normalized = normalizeText(text);

        if (normalized.length === 0) {
          yield* repo.deleteByNoteId(noteId);
          return;
        }

        const textHash = yield* hashText(normalized);
        const existing = yield* repo.findMetadataByNoteId(noteId);

        if (
          Option.isSome(existing) &&
          existing.value.model === MODEL_ID &&
          existing.value.dimensions === DIMENSIONS &&
          existing.value.textHash === textHash
        ) {
          return;
        }

        const vector = yield* embedText(normalized);

        yield* repo.upsert({
          noteId,
          model: MODEL_ID,
          dimensions: DIMENSIONS,
          textHash,
          embedding: encodeVector(vector),
          updatedAt,
        });
      },
    );

    const backfillMissing = Effect.fn("NoteEmbedding.backfillMissing")(function* () {
      while (true) {
        const candidates = yield* repo.findMissingMaterializedInputs(BACKFILL_BATCH_SIZE);

        if (candidates.length === 0) return;

        yield* Effect.forEach(candidates, upsertForMaterializedNote, {
          concurrency: 1,
          discard: true,
        });

        if (candidates.length < BACKFILL_BATCH_SIZE) return;
      }
    });

    return {
      upsertForMaterializedNote,
      backfillMissing,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(NoteEmbeddingRepo.Service.layer),
  );
}

export type MaterializedNoteInput = typeof NoteEmbeddingSchema.MaterializedInput.Type;

const embedText = Effect.fn("NoteEmbedding.embedText")(function* (text: string) {
  return yield* Effect.tryPromise({
    try: async () => {
      const extractor = await getExtractor();
      const output = await extractor(text, { pooling: "mean", normalize: true });
      const data = output.data;
      const vector = data instanceof Float32Array ? data : Float32Array.from(data);

      if (vector.length !== DIMENSIONS) {
        throw new Error(`Expected ${DIMENSIONS} embedding dimensions, received ${vector.length}.`);
      }

      return vector;
    },
    catch: (cause) => cause,
  });
});

const hashText = Effect.fn("NoteEmbedding.hashText")(function* (text: string) {
  const bytes = new TextEncoder().encode(`${MODEL_ID}\0${text}`);
  const digest = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
});

let extractorPromise: Promise<EmbeddingExtractor> | undefined;

function getExtractor(): Promise<EmbeddingExtractor> {
  extractorPromise ??= pipeline("feature-extraction", MODEL_ID, {
    dtype: "q8",
  }) as Promise<EmbeddingExtractor>;

  return extractorPromise;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function encodeVector(vector: Float32Array): Uint8Array<ArrayBufferLike> {
  return new Uint8Array(
    vector.buffer.slice(vector.byteOffset, vector.byteOffset + vector.byteLength),
  );
}

type EmbeddingExtractor = (
  text: string,
  options: {
    pooling: "mean";
    normalize: boolean;
  },
) => Promise<{ data: Float32Array | ArrayLike<number> }>;

export * as NoteEmbeddingService from "./note-embedding.service";
