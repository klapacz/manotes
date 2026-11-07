import {
  RemoteCodemodeSandbox,
  type CodemodeRemote,
  type CodemodeSandboxBaseOptions,
} from "@earendil-works/pi-codemode/portable";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { BrowserWorker, BrowserWorkerRunner } from "@effect/platform-browser";
import { Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect";
import { RpcServer } from "effect/rpc";
import { Worker as EffectWorker } from "effect/workers";
import quickjsWasmUrl from "quickjs-wasi/quickjs.wasm?url";
import type { HostMessage, WorkerMessage } from "./worker";
import { ExchangeRpc } from "./rpc";

/** Runs each script VM in its own Web Worker, terminated when the sandbox closes. */
export const browserSandbox = ExecuteScript.Sandbox.of({
  make: (options) => new WorkerSandbox(options),
});

// Like the CLI's Node sandbox, the deadline or an abort ends a run and terminating the
// worker is the hard kill. `ExecuteScript.run` closes the sandbox after every run. The VM's
// interrupt budget and memory are capped in `worker.ts`.
class WorkerSandbox extends RemoteCodemodeSandbox {
  private readonly scope = Effect.runSync(Scope.make());

  constructor(options: CodemodeSandboxBaseOptions) {
    super({
      ...options,
      timeoutMs: 15_000,
      remote: () => connect(this.scope),
    });
  }

  override close(): Promise<void> {
    return Effect.runPromise(
      Effect.promise(() => super.close()).pipe(Effect.ensuring(Scope.close(this.scope, Exit.void))),
    );
  }
}

// Effect owns the transport and handler fibers; pi-codemode owns the VM protocol.
function connect(scope: Scope.Scope): CodemodeRemote {
  return {
    execute: (request, exchange) => {
      return Effect.runPromise(
        Effect.gen(function* () {
          const nativeWorker = yield* Effect.acquireRelease(
            Effect.sync(() => {
              return new Worker(new URL("./worker.ts", import.meta.url), {
                type: "module",
                name: "script-sandbox",
              });
            }),
            (w) => Effect.sync(() => w.terminate()),
          );

          // The worker's own channel carries execute/done. Tool calls return to this host
          // over RPC: port1 stays here as the server, port2 moves to the VM worker as the client.
          const channel = yield* Effect.acquireRelease(
            Effect.sync(() => new MessageChannel()),
            (channel) => {
              return Effect.sync(() => {
                // If startup failed before transferring port2, we still own both ends.
                channel.port1.close();
                channel.port2.close();
              });
            },
          );

          yield* Effect.gen(function* () {
            const platform = yield* EffectWorker.WorkerPlatform;
            const worker = yield* platform.spawn<WorkerMessage, HostMessage>(0);
            const done = yield* Deferred.make<void>();

            const receive = worker.run(() => Deferred.succeed(done, undefined));

            const server = RpcServer.layer(ExchangeRpc).pipe(
              Layer.provide(
                ExchangeRpc.toLayer({
                  exchange: ({ messages }) => {
                    return Effect.tryPromise(() => exchange(messages)).pipe(Effect.orDie);
                  },
                }),
              ),
              Layer.provide(RpcServer.layerProtocolWorkerRunner),
              Layer.provide(BrowserWorkerRunner.layerMessagePort(channel.port1)),
            );

            const execute = loadWasm.pipe(
              Effect.flatMap((wasm) => {
                // The payload gives the worker access to port2; the transfer list moves ownership.
                return worker.send(["execute", request, wasm, channel.port2], [channel.port2]);
              }),
              Effect.andThen(Deferred.await(done)),
            );

            // Keep RPC and the worker listener alive until done or failure, then close both.
            yield* Effect.raceFirst(Layer.launch(server), Effect.raceFirst(receive, execute));
          }).pipe(Effect.provide(BrowserWorker.layer(() => nativeWorker)));
        }).pipe(Effect.scoped, Effect.forkIn(scope), Effect.flatMap(Fiber.join)),
      );
    },
  };
}

// Compiled once; each worker receives the compiled module. `quickjs-wasi` stays at the exact
// version `@earendil-works/pi-codemode` pins, because pi-codemode runs this binary with its own
// copy of the package's JavaScript.
const loadWasm = Effect.runSync(
  Effect.tryPromise(() => WebAssembly.compileStreaming(fetch(quickjsWasmUrl))).pipe(
    Effect.cachedWithTTL((exit) => (Exit.isSuccess(exit) ? Infinity : 0)),
  ),
);

export * as ScriptSandbox from "./sandbox";
