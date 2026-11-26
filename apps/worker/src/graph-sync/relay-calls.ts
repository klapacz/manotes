import type * as Cloudflare from "@alchemy.run/cloudflare";
import { GraphSyncCodec } from "@manotes/shared/graph-sync/contract/codec";
import { GraphSyncMessages } from "@manotes/shared/graph-sync/contract/messages";
import { Data, Duration, Effect, HashSet, Match, PubSub, Ref, Result, Stream } from "effect";

export type DeviceSocket = Pick<Cloudflare.WebSocket, "send">;

export const RELAY_TIMEOUT = Duration.seconds(30);

export type SendReason = "Duplicate" | "NoDevice" | "SendFailed" | "Disconnected" | "Timeout";

export class SendError extends Data.TaggedError("GraphSyncRelayCalls.SendError")<{
  readonly reason: SendReason;
}> {}

export interface Registry {
  readonly send: (input: {
    readonly requestId: string;
    readonly envelope: string;
  }) => Effect.Effect<string, SendError>;
  readonly reply: (message: GraphSyncMessages.RelayReply) => Effect.Effect<void>;
  readonly disconnect: (socket: DeviceSocket) => Effect.Effect<void>;
}

type RelayEvent = Data.TaggedEnum<{
  Reply: { readonly requestId: string; readonly envelope: string };
  Disconnected: { readonly socket: DeviceSocket };
}>;

const RelayEvent = Data.taggedEnum<RelayEvent>();

export const make = Effect.fn("GraphSyncRelayCalls.make")(function* (
  sockets: Effect.Effect<ReadonlyArray<DeviceSocket>>,
) {
  const events = yield* PubSub.unbounded<RelayEvent>();
  const active = yield* Ref.make(HashSet.empty<string>());

  const claimRequestId = (requestId: string) => {
    return Effect.acquireRelease(
      Ref.modify(active, (ids) => {
        if (HashSet.has(ids, requestId)) return [false, ids] as const;

        return [true, HashSet.add(ids, requestId)] as const;
      }).pipe(
        Effect.filterOrFail(
          (claimed) => claimed,
          () => new SendError({ reason: "Duplicate" }),
        ),
      ),
      () => Ref.update(active, HashSet.remove(requestId)),
    );
  };

  const send = Effect.fn("GraphSyncRelayCalls.send")(function* ({
    requestId,
    envelope,
  }: {
    readonly requestId: string;
    readonly envelope: string;
  }) {
    yield* claimRequestId(requestId);

    // Subscribe before sending so a fast reply or disconnect cannot be missed.
    const subscription = yield* PubSub.subscribe(events);
    const connected = yield* sockets;
    // Dispatch to one socket only so connected devices do not run the same script twice.
    const target = connected[0];

    if (target === undefined) return yield* new SendError({ reason: "NoDevice" });

    const frame = GraphSyncCodec.encodeServerMessageUnsafe(
      new GraphSyncMessages.RelayRequest({ requestId, envelope }),
    );

    yield* target.send(frame).pipe(Effect.mapError(() => new SendError({ reason: "SendFailed" })));

    // Take the first event for this request or its assigned socket; the scoped wrapper releases
    // both the PubSub subscription and the active requestId on any exit path.
    return yield* Stream.fromSubscription(subscription).pipe(
      Stream.filterMap((event) => {
        return Match.value(event).pipe(
          Match.tagsExhaustive({
            Reply: (reply) => {
              if (reply.requestId !== requestId) return Result.failVoid;

              return Result.succeed(Effect.succeed(reply.envelope));
            },
            Disconnected: ({ socket }) => {
              if (socket !== target) return Result.failVoid;

              return Result.succeed(Effect.fail(new SendError({ reason: "Disconnected" })));
            },
          }),
        );
      }),
      Stream.runHead,
      Effect.flatMap(Effect.fromOption(() => new SendError({ reason: "Disconnected" }))),
      Effect.flatten,
      Effect.timeoutOrElse({
        duration: RELAY_TIMEOUT,
        orElse: () => Effect.fail(new SendError({ reason: "Timeout" })),
      }),
    );
  }, Effect.scoped);

  const reply = Effect.fn("GraphSyncRelayCalls.reply")(function* (
    message: GraphSyncMessages.RelayReply,
  ) {
    yield* PubSub.publish(
      events,
      RelayEvent.Reply({ requestId: message.requestId, envelope: message.envelope }),
    );
  });

  const disconnect = Effect.fn("GraphSyncRelayCalls.disconnect")(function* (socket: DeviceSocket) {
    yield* PubSub.publish(events, RelayEvent.Disconnected({ socket }));
  });

  return { send, reply, disconnect } satisfies Registry;
});

export * as RelayCalls from "./relay-calls.ts";
