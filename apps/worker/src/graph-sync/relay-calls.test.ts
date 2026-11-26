import { GraphSyncCodec } from "@manotes/shared/graph-sync/contract/codec";
import { GraphSyncMessages } from "@manotes/shared/graph-sync/contract/messages";
import { Effect, Fiber, Predicate } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";
import { RELAY_TIMEOUT, RelayCalls, type DeviceSocket } from "./relay-calls.ts";

function makeSocket() {
  const sent: Array<GraphSyncMessages.ServerMessage> = [];

  const socket: DeviceSocket = {
    send: (frame) => {
      if (Predicate.isString(frame)) return Effect.die("expected binary frame");

      const bytes = frame instanceof Uint8Array ? frame : new Uint8Array(frame);

      return GraphSyncCodec.decodeServerMessage(bytes).pipe(
        Effect.tap((message) => Effect.sync(() => sent.push(message))),
        Effect.asVoid,
        Effect.orDie,
      );
    },
  };

  return { socket, sent };
}

describe("RelayCalls", () => {
  it("dispatches to a single connected socket and resolves on reply", async () => {
    const first = makeSocket();
    const second = makeSocket();

    const answer = await Effect.runPromise(
      Effect.gen(function* () {
        const calls = yield* RelayCalls.make(Effect.succeed([first.socket, second.socket]));

        const pending = yield* calls
          .send({ requestId: "req-1", envelope: "enc-req" })
          .pipe(Effect.forkChild);

        yield* Effect.yieldNow;

        expect(first.sent).toEqual([
          new GraphSyncMessages.RelayRequest({ requestId: "req-1", envelope: "enc-req" }),
        ]);
        expect(second.sent).toEqual([]);

        yield* calls.reply(
          new GraphSyncMessages.RelayReply({ requestId: "req-1", envelope: "enc-ans" }),
        );

        return yield* Fiber.join(pending);
      }),
    );

    expect(answer).toBe("enc-ans");
  });

  it("refuses immediately when no device is connected or on duplicate requestId", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const empty = yield* RelayCalls.make(Effect.succeed([]));

        const noDevice = yield* empty
          .send({ requestId: "req-1", envelope: "enc" })
          .pipe(Effect.flip);

        expect(noDevice.reason).toBe("NoDevice");

        const device = makeSocket();
        const calls = yield* RelayCalls.make(Effect.succeed([device.socket]));

        const pending = yield* calls
          .send({ requestId: "req-0", envelope: "enc" })
          .pipe(Effect.forkChild);

        yield* Effect.yieldNow;

        const dup = yield* calls.send({ requestId: "req-0", envelope: "enc" }).pipe(Effect.flip);
        expect(dup.reason).toBe("Duplicate");

        yield* Fiber.interrupt(pending);
      }),
    );
  });

  it("fails immediately when the assigned socket disconnects", async () => {
    const device = makeSocket();

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const calls = yield* RelayCalls.make(Effect.succeed([device.socket]));

        const pending = yield* calls
          .send({ requestId: "req-1", envelope: "enc" })
          .pipe(Effect.flip, Effect.forkChild);

        yield* Effect.yieldNow;
        yield* calls.disconnect(device.socket);

        return yield* Fiber.join(pending);
      }),
    );

    expect(error.reason).toBe("Disconnected");
  });

  it("times out after RELAY_TIMEOUT if no reply arrives", async () => {
    const device = makeSocket();

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const calls = yield* RelayCalls.make(Effect.succeed([device.socket]));

        const pending = yield* calls
          .send({ requestId: "req-1", envelope: "enc" })
          .pipe(Effect.flip, Effect.forkChild);

        yield* Effect.yieldNow;
        yield* TestClock.adjust(RELAY_TIMEOUT);

        return yield* Fiber.join(pending);
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(error.reason).toBe("Timeout");
  });
});
