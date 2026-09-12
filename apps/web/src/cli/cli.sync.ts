import { Effect, Layer, Option, Redacted, Stream, SubscriptionRef } from "effect";
import { NodeWS } from "@effect/platform-node/NodeSocket";
import * as Socket from "effect/unstable/socket/Socket";
import * as GraphSync from "../lib/graph-sync/service";
import * as GraphSyncContext from "../lib/graph-sync/context";
import * as GraphSyncEncryption from "../lib/graph-sync/encryption/service";
import * as GraphSyncEventLog from "../lib/graph-sync/event-log.service";
import * as GraphSyncStatus from "../lib/graph-sync/status";
import { SyncStatusCloud } from "../lib/graph.worker-rpc";
import { CliConfig } from "./cli.config";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* CliConfig.Service;

    const syncStatusRef = yield* SubscriptionRef.make(
      new SyncStatusCloud({ mode: "cloud", syncState: "Disconnected", hasPending: false }),
    );

    const deps = Layer.mergeAll(
      Layer.succeed(GraphSyncContext.Context, {
        graphId: config.graphId,
        graphKey: Redacted.value(config.graphKey),
        origin: config.origin,
      }),
      webSocketConstructorLayer(config.token),
      Layer.succeed(GraphSyncStatus.Ref, syncStatusRef),
    );

    const base = Layer.mergeAll(
      GraphSyncEncryption.Service.layer,
      GraphSyncEventLog.Service.layer,
      GraphSync.Service.layer,
    );

    return base.pipe(Layer.provideMerge(deps));
  }),
);

export const run = Effect.fn("CliSync.run")(function* () {
  const graphSync = yield* GraphSync.Service;
  const statusRef = yield* GraphSyncStatus.Ref;

  const session = graphSync.run().pipe(
    Effect.andThen(Effect.fail(new Error("Graph sync session ended before synchronization."))),
    // Close the socket and its background tasks when Ready wins the race.
    Effect.scoped,
  );

  // A session failure must win too, rather than leaving the command waiting for Ready.
  yield* Effect.raceFirst(session, waitForReady(statusRef)).pipe(
    Effect.timeoutOrElse({
      duration: "1 minute",
      orElse: () => Effect.fail(new Error("Graph sync timed out before synchronization.")),
    }),
  );
});

function waitForReady(statusRef: SubscriptionRef.SubscriptionRef<SyncStatusCloud>) {
  // A fresh session enters Ready only after applying acknowledgements and finding
  // no pending rows. Writes arriving after that check belong to a later sync.
  return SubscriptionRef.changes(statusRef).pipe(
    Stream.filter((status) => status.syncState === "Ready"),
    Stream.runHead,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new Error("Graph sync status ended before synchronization.")),
        onSome: () => Effect.void,
      }),
    ),
  );
}

function webSocketConstructorLayer(token: string) {
  return Layer.succeed(
    Socket.WebSocketConstructor,
    (url, protocols) =>
      // eslint-disable-next-line anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- ws implements the WebSocket operations consumed by Effect's Node adapter.
      new NodeWS.WebSocket(url, protocols, {
        headers: { authorization: `Bearer ${token}` },
      }) as unknown as globalThis.WebSocket,
  );
}

export * as CliSync from "./cli.sync";
