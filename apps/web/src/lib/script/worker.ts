import {
  serveCodemodeRemote,
  type CodemodeRemoteRequest,
} from "@earendil-works/pi-codemode/portable";
import { BrowserRuntime, BrowserWorker, BrowserWorkerRunner } from "@effect/platform-browser";
import { Effect, FiberSet, Layer } from "effect";
import { RpcClient } from "effect/rpc";
import { WorkerRunner } from "effect/workers";
import { ExchangeRpc } from "./rpc";

export type HostMessage = [
  "execute",
  request: CodemodeRemoteRequest,
  wasm: WebAssembly.Module,
  port: MessagePort,
];

export type WorkerMessage = ["done"];

export const run = Effect.gen(function* () {
  const platform = yield* WorkerRunner.WorkerRunnerPlatform;
  const runner = yield* platform.start<WorkerMessage, HostMessage>();

  yield* runner.run((portId, message) => {
    // `port` is the transferred port2; `portId` identifies the separate execute/done channel.
    const [, request, wasm, port] = message;

    return Effect.gen(function* () {
      const client = yield* RpcClient.make(ExchangeRpc);
      // pi-codemode expects Promises; keep the RPC fibers scoped to this execution.
      const runPromise = yield* FiberSet.makeRuntimePromise();

      // Caps for every run in the browser; requests above them are lowered, including the 256 MiB
      // `ExecuteScript.run` asks for.
      yield* Effect.tryPromise(() => {
        return serveCodemodeRemote(
          request,
          (messages) => runPromise(client.exchange({ messages })),
          {
            wasm,
            maxInterruptBudget: 10_000_000,
            maxMemoryLimitBytes: 48 * 1024 * 1024,
          },
        );
      });
      yield* runner.send(portId, ["done"]);
    }).pipe(
      Effect.provide(
        // A script may issue another tool call before an earlier one finishes.
        RpcClient.layerProtocolWorker({ size: 1, concurrency: Infinity }).pipe(
          // Use the transferred port to call the host's exchange server on port1.
          Layer.provide(BrowserWorker.layer(() => port)),
        ),
      ),
      Effect.scoped,
    );
  });
}).pipe(Effect.scoped);

BrowserRuntime.runMain(run.pipe(Effect.provide(BrowserWorkerRunner.layer)));

export * as ScriptWorker from "./worker";
