import * as Cloudflare from "alchemy/Cloudflare";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { Boolean, Cause, Effect, Exit, Predicate } from "effect";

import * as Codec from "@manotes/shared/graph-sync/contract/codec";
import * as Messages from "@manotes/shared/graph-sync/contract/messages";
import * as Protocol from "./protocol.ts";
import * as Repo from "./repo.ts";
import * as Errors from "./errors.ts";
import { webSocketMessageToUint8Array } from "./websocket-message.ts";

export default class GraphSyncDurableObject extends Cloudflare.DurableObjectNamespace<GraphSyncDurableObject>()(
  "GraphSyncDurableObject",
  // oxlint-disable-next-line require-yield
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const layer = SqliteClient.layer({
        db: state.storage.sql.raw,
        spanAttributes: {
          durableObject: "GraphSyncDurableObject",
        },
      });

      yield* state.setHibernatableWebSocketEventTimeout(5_000);

      yield* state.blockConcurrencyWhile(() =>
        Repo.migrate.pipe(Effect.provide(layer), Effect.orDie),
      );

      const parseWebsocketMessage = Effect.fn(function* (message: string | ArrayBuffer) {
        return yield* Codec.decodeClientMessage(webSocketMessageToUint8Array(message)).pipe(
          Effect.catchTag("SchemaError", () =>
            Effect.fail(new Errors.ProtocolViolationError({ reason: "Malformed client message" })),
          ),
        );
      });

      const handleWebSocketFailure = Effect.fn(function* <E>(
        ws: Cloudflare.DurableWebSocket,
        cause: Cause.Cause<Errors.ProtocolViolationError | E>,
      ) {
        const failure = cause.reasons.find(Cause.isFailReason);

        if (
          failure !== undefined &&
          Predicate.isTagged(failure.error, "GraphSyncProtocolViolationError")
        ) {
          yield* Effect.logWarning("Graph sync protocol violation", {
            reason: failure.error.reason,
          });
          yield* ws.close(1002, "Protocol violation");
          return;
        }

        yield* Effect.logError("Graph sync websocket failure", Cause.pretty(cause));
        yield* ws.close(1011, "Internal error");
      });

      const executeWebSocketMessage = Effect.fn(function* (message: Messages.ClientMessage) {
        const plan = Protocol.getExecutionPlan(message);

        return yield* Boolean.match(plan.runSerialized, {
          onFalse: () => plan.effect.pipe(Effect.exit),
          onTrue: () =>
            state.blockConcurrencyWhile(() => plan.effect.pipe(Effect.provide(layer), Effect.exit)),
        });
      });

      const respondToWebSocketMessage = Effect.fn(function* (
        ws: Cloudflare.DurableWebSocket,
        result: Protocol.ResponsePlan,
      ) {
        for (const response of result.reply)
          yield* ws.send(Codec.encodeServerMessageUnsafe(response));
        for (const response of result.broadcast) yield* broadcast(response, ws);
      });

      const broadcast = Effect.fn(function* (
        message: Messages.ServerMessage,
        except: Cloudflare.DurableWebSocket,
      ) {
        const encoded = Codec.encodeServerMessageUnsafe(message);

        for (const socket of yield* state.getWebSockets()) {
          if (socket === except) continue;
          yield* socket.send(encoded);
        }
      });

      return {
        fetch: Effect.gen(function* () {
          const [response] = yield* Cloudflare.upgrade();
          return response;
        }),
        webSocketMessage: Effect.fnUntraced(function* (
          socket: Cloudflare.DurableWebSocket,
          rawMessage: string | ArrayBuffer,
        ) {
          const messageExit = yield* parseWebsocketMessage(rawMessage).pipe(Effect.exit);

          if (Exit.isFailure(messageExit)) {
            yield* handleWebSocketFailure(socket, messageExit.cause);
            return;
          }

          const responsePlan = yield* executeWebSocketMessage(messageExit.value);

          if (Exit.isFailure(responsePlan)) {
            yield* handleWebSocketFailure(socket, responsePlan.cause);
            return;
          }

          yield* respondToWebSocketMessage(socket, responsePlan.value);
        }, Effect.provide(layer)),

        webSocketError: Effect.fn(function* (_ws: Cloudflare.DurableWebSocket, error: unknown) {
          yield* Effect.logWarning("Graph sync websocket error", error);
        }),

        webSocketClose: Effect.fn(function* (
          ws: Cloudflare.DurableWebSocket,
          code: number,
          reason: string,
        ) {
          // Complete the closing handshake so clients do not wait for a socket timeout.
          yield* ws.close(1000, "");
          yield* Effect.logWarning("Graph sync websocket closed", { code, reason });
        }),
      };
    });
  }),
) {}
