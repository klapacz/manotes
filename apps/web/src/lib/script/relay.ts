import { ClientRecordRepo } from "@manotes/shared/client-record.repo";
import type { GraphSyncMessages } from "@manotes/shared/graph-sync/contract/messages";
import { GraphSyncRelay } from "@manotes/shared/graph-sync/relay";
import { McpEncryption } from "@manotes/shared/mcp/encryption";
import { Array, Effect, Layer, Option, pipe, Schema, Semaphore } from "effect";
import type { Aead, SecureRandom } from "effect/crypto";
import { ScriptRun } from "./run";

const RequestPayload = Schema.Struct({
  script: Schema.String,
});

const AnswerPayload = Schema.Struct({
  output: Schema.Array(Schema.String),
  error: Schema.NullOr(Schema.String),
});

const decodeRequest = Schema.decodeEffect(Schema.fromJsonString(RequestPayload));

const encodeAnswer = Schema.encodeSync(Schema.fromJsonString(AnswerPayload));

const decodeEnvelope = Schema.decodeEffect(McpEncryption.EnvelopeFromJson);

const encodeEnvelope = Schema.encodeSync(McpEncryption.EnvelopeFromJson);

type ScriptRunServices = Effect.Services<ReturnType<typeof ScriptRun.run>>;

/** Decrypts incoming relay requests with active `_tag = "client"` keys, runs them serially, and encrypts replies. */
export const layer = Layer.effect(
  GraphSyncRelay.Handler,
  Effect.gen(function* () {
    const services = yield* Effect.context<
      ClientRecordRepo.Service | Aead.Aead | SecureRandom.SecureRandom | ScriptRunServices
    >();

    const clientRepo = yield* ClientRecordRepo.Service;
    const serial = yield* Semaphore.make(1);

    const handle = Effect.fn("ScriptRelay.handle")(function* (
      request: GraphSyncMessages.RelayRequest,
    ) {
      const envelope = yield* decodeEnvelope(request.envelope).pipe(Effect.option);

      if (Option.isNone(envelope)) {
        yield* Effect.logWarning("Dropped relay request with malformed envelope");

        return Option.none();
      }

      const keys = yield* clientRepo.listKeys().pipe(Effect.orElseSucceed(() => []));

      if (!Array.isReadonlyArrayNonEmpty(keys)) {
        yield* Effect.logWarning("Dropped relay request with no active client keys");

        return Option.none();
      }

      const requestAad = `request:${request.requestId}`;

      const matched = yield* pipe(
        Array.map(keys, (key) => {
          return McpEncryption.decrypt({
            key,
            envelope: envelope.value,
            aad: requestAad,
          }).pipe(Effect.map((plaintext) => ({ key, plaintext })));
        }),
        Effect.firstSuccessOf,
        Effect.option,
      );

      if (Option.isNone(matched)) {
        yield* Effect.logWarning("Dropped relay request that did not match any active client key");

        return Option.none();
      }

      const payload = yield* decodeRequest(matched.value.plaintext).pipe(Effect.option);

      if (Option.isNone(payload)) {
        yield* Effect.logWarning("Dropped relay request with invalid payload");

        return Option.none();
      }

      const result = yield* serial.withPermit(ScriptRun.run(payload.value.script, "agent")).pipe(
        Effect.catchCause((cause) => {
          const failed: typeof AnswerPayload.Type = {
            output: [],
            error: "Script execution failed on device.",
          };

          return Effect.logError("Relay script run failed", cause).pipe(Effect.as(failed));
        }),
      );

      const answerEnvelope = yield* McpEncryption.encrypt({
        key: matched.value.key,
        plaintext: encodeAnswer(result),
        aad: `answer:${request.requestId}`,
      }).pipe(Effect.option);

      return Option.map(answerEnvelope, encodeEnvelope);
    }, Effect.provideContext(services));

    return GraphSyncRelay.Handler.of({ handle });
  }),
);

export * as ScriptRelay from "./relay";
