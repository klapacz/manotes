import { SqliteClient } from "@effect/sql-sqlite-do";
import {
  Cause,
  Effect,
  Exit,
  ManagedRuntime,
  Match,
  Boolean,
  Option,
  pipe,
  Predicate,
} from "effect";
import { DurableObject } from "cloudflare:workers";
import * as Codec from "../../lib/graph-sync/contract/codec";
import * as Messages from "../../lib/graph-sync/contract/messages";
import * as Protocol from "./protocol";
import * as Repo from "./repo";
import * as Errors from "./errors";
import { webSocketMessageToUint8Array } from "./websocket-message";

export class GraphSyncDurableObject extends DurableObject<Env> {
  private readonly runtime = ManagedRuntime.make(
    SqliteClient.layer({
      db: this.ctx.storage.sql,
      spanAttributes: {
        durableObject: "GraphSyncDurableObject",
      },
    }),
  );

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    ctx.setHibernatableWebSocketEventTimeout(5_000);

    ctx.blockConcurrencyWhile(() => this.runtime.runPromise(Repo.migrate));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get("Upgrade")?.toLowerCase();

    if (upgradeHeader === "websocket") return this.upgradeWebSocket();

    return Match.value(url.pathname).pipe(
      Match.when("/health", () => Response.json({ ok: true })),
      Match.orElse(() => new Response(null, { status: 404 })),
    );
  }

  async webSocketMessage(
    ws: WebSocket,
    rawMessage: string | ArrayBuffer,
  ): Promise<void> {
    const messageExit = this.parseWebSocketMessage(rawMessage);

    if (Exit.isFailure(messageExit)) {
      this.handleWebSocketFailure(ws, messageExit.cause);
      return;
    }

    const responsePlan = await this.executeWebSocketMessage(messageExit.value);

    if (Exit.isFailure(responsePlan)) {
      this.handleWebSocketFailure(ws, responsePlan.cause);
      return;
    }

    this.respondToWebSocketMessage(ws, responsePlan.value);
  }

  private parseWebSocketMessage(message: string | ArrayBuffer) {
    return pipe(
      webSocketMessageToUint8Array(message),
      Codec.decodeClientMessage,
      Effect.catchTag("ParseError", () =>
        Effect.fail(
          new Errors.ProtocolViolationError({
            reason: "Malformed client message",
          }),
        ),
      ),
      Effect.runSyncExit,
    );
  }

  private executeWebSocketMessage(message: Messages.ClientMessage) {
    const plan = Protocol.getExecutionPlan(message);

    return Boolean.match(plan.runSerialized, {
      onFalse: () => this.runtime.runPromiseExit(plan.effect),
      onTrue: () =>
        this.ctx.blockConcurrencyWhile(() =>
          this.runtime.runPromiseExit(plan.effect),
        ),
    });
  }

  private respondToWebSocketMessage(
    ws: WebSocket,
    result: Protocol.ResponsePlan,
  ): void {
    for (const response of result.reply)
      ws.send(Codec.encodeServerMessageUnsfae(response));
    for (const response of result.broadcast) this.broadcast(response, ws);
  }

  private broadcast(message: Messages.ServerMessage, except: WebSocket): void {
    const encoded = Codec.encodeServerMessageUnsfae(message);

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      socket.send(encoded);
    }
  }

  private handleWebSocketFailure<E>(
    ws: WebSocket,
    cause: Cause.Cause<Errors.ProtocolViolationError | E>,
  ): void {
    const failure = Cause.failureOption(cause);

    if (
      Option.isSome(failure) &&
      Predicate.isTagged(failure.value, "GraphSyncProtocolViolationError")
    ) {
      this.runtime.runFork(
        Effect.logWarning("Graph sync protocol violation", {
          reason: failure.value.reason,
        }),
      );
      ws.close(1002, "Protocol violation");
      return;
    }

    this.runtime.runFork(
      Effect.logError("Graph sync websocket failure", Cause.pretty(cause)),
    );
    ws.close(1011, "Internal error");
  }

  private upgradeWebSocket(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.ctx.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  webSocketError(_ws: WebSocket, error: unknown): void {
    this.runtime.runFork(
      Effect.logWarning("Graph sync websocket error", error),
    );
  }

  webSocketClose(_ws: WebSocket, code: number, reason: string): void {
    this.runtime.runFork(
      Effect.logWarning("Graph sync websocket closed", { code, reason }),
    );
  }
}
