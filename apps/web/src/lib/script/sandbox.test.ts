import { BrowserWorkerRunner } from "@effect/platform-browser";
import { Effect, Fiber } from "effect";
import { WorkerRunner } from "effect/workers";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { ScriptSandbox } from "./sandbox";
import { ScriptWorker, type HostMessage } from "./worker";

const serve = vi.hoisted(() => {
  return vi.fn<typeof import("@earendil-works/pi-codemode/portable").serveCodemodeRemote>();
});

vi.mock("@earendil-works/pi-codemode/portable", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-codemode/portable")>();

  return { ...actual, serveCodemodeRemote: serve };
});

vi.mock("@effect/platform-browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@effect/platform-browser")>();

  return { ...actual, BrowserRuntime: { ...actual.BrowserRuntime, runMain: vi.fn() } };
});

const workers: LocalWorker[] = [];

let failBeforeReady = false;

// Real Effect transports and RPC over MessagePorts, without a browser or QuickJS VM.
class LocalWorker extends EventTarget {
  private readonly endpoint: MessagePort;
  readonly fiber: Fiber.Fiber<void, unknown>;
  readonly terminate = vi.fn(() => {
    this.fiber.interruptUnsafe();
    this.endpoint.close();
  });

  constructor() {
    super();
    const { port1, port2 } = new MessageChannel();
    this.endpoint = port2;
    port2.addEventListener("message", (event) => {
      this.dispatchEvent(new MessageEvent("message", { data: event.data }));
    });
    port2.start();
    workers.push(this);

    if (failBeforeReady) {
      port1.close();
      this.fiber = Effect.runFork(Effect.never);
      setTimeout(() => {
        const error = new Error("Worker boot failed");
        this.dispatchEvent(Object.assign(new Event("error"), { error }));
      }, 0);
    } else {
      this.fiber = Effect.runFork(
        ScriptWorker.run.pipe(
          Effect.provideService(WorkerRunner.WorkerRunnerPlatform, BrowserWorkerRunner.make(port1)),
        ),
      );
    }
  }

  postMessage(message: WorkerRunner.PlatformMessage<HostMessage>, transfers: Transferable[] = []) {
    this.endpoint.postMessage(message, transfers);
  }
}

beforeEach(() => {
  serve.mockReset();
  failBeforeReady = false;
  vi.stubGlobal("Worker", LocalWorker);
  const wasm = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  vi.spyOn(WebAssembly, "compileStreaming").mockResolvedValue(wasm);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
});

afterEach(async () => {
  for (const worker of workers.splice(0)) {
    worker.terminate();
    await Effect.runPromise(Fiber.await(worker.fiber));
  }

  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("routes concurrent RPC exchange replies and preserves output fields", async () => {
  const first = Promise.withResolvers<string>();
  const textOutput = { type: "text", text: "finished", console: true, extra: "preserved" } as const;
  serve.mockImplementation(async (_request, exchange) => {
    const slow = exchange([{ type: "call", id: 1, target: "global", name: "slow", args: "[]" }]);

    const fast = await exchange([
      { type: "call", id: 2, target: "global", name: "fast", args: "[]" },
    ]);

    expect(fast).toMatchObject({ type: "result", id: 2, payload: '"fast"' });
    first.resolve("slow");
    expect(await slow).toMatchObject({ type: "result", id: 1, payload: '"slow"' });
    await exchange([
      { type: "output", item: textOutput },
      { type: "output", item: { type: "image", data: "aW1hZ2U=", mimeType: "image/png" } },
      { type: "done", ok: true, value: undefined, writes: "[]" },
    ]);
  });

  const sandbox = ScriptSandbox.browserSandbox.make({
    globals: [
      { name: "slow", execute: () => first.promise },
      { name: "fast", execute: () => "fast" },
    ],
  });

  try {
    const result = await sandbox.execute("test");
    expect(result.ok).toBe(true);
    expect(result.output).toEqual([
      textOutput,
      { type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
    ]);
  } finally {
    await sandbox.close();
  }

  expect(workers[0]?.terminate).toHaveBeenCalledOnce();
});

it.each([
  {
    terminal: { type: "done", ok: false, error: '{"message":"Script failed"}' },
    kind: "script",
    message: "Script failed",
  },
  {
    terminal: { type: "failure", error: { kind: "timeout", message: "Interrupt budget exceeded" } },
    kind: "timeout",
    message: "Interrupt budget exceeded",
  },
] as const)("returns $kind errors through RPC", async ({ terminal, kind, message }) => {
  serve.mockImplementation(async (_request, exchange) => {
    await exchange([terminal]);
  });
  const sandbox = ScriptSandbox.browserSandbox.make({});

  try {
    expect(await sandbox.execute("test")).toMatchObject({ ok: false, error: { kind, message } });
  } finally {
    await sandbox.close();
  }

  expect(workers[0]?.terminate).toHaveBeenCalledOnce();
});

it.each(["abort", "close"] as const)(
  "cancels a pending host call on %s and terminates its worker",
  async (action) => {
    const started = Promise.withResolvers<void>();
    const aborted = vi.fn();
    serve.mockImplementation(async (_request, exchange) => {
      await exchange([{ type: "call", id: 1, target: "global", name: "wait", args: "[]" }]);
    });

    const sandbox = ScriptSandbox.browserSandbox.make({
      globals: [
        {
          name: "wait",
          execute: (_args, { signal }) => {
            return new Promise<void>((resolve) => {
              signal.addEventListener(
                "abort",
                () => {
                  aborted();
                  resolve();
                },
                { once: true },
              );
              started.resolve();
            });
          },
        },
      ],
    });

    const controller = new AbortController();

    try {
      const execution = sandbox.execute("test", { signal: controller.signal });
      await started.promise;

      if (action === "abort") controller.abort();
      else await sandbox.close();
      expect(await execution).toMatchObject({ ok: false, error: { kind: "aborted" } });
    } finally {
      await sandbox.close();
    }

    expect(aborted).toHaveBeenCalledOnce();
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
  },
);

it("returns a worker error before readiness and cleans up", async () => {
  failBeforeReady = true;
  const sandbox = ScriptSandbox.browserSandbox.make({});

  try {
    const result = await sandbox.execute("test");
    expect(result).toMatchObject({ ok: false, error: { kind: "sandbox" } });
  } finally {
    await sandbox.close();
  }

  expect(workers[0]?.terminate).toHaveBeenCalledOnce();
  expect(serve).not.toHaveBeenCalled();
});

it("retries failed WASM compilation and caches success across sandbox runs", async () => {
  vi.resetModules();
  const { ScriptSandbox } = await import("./sandbox");

  const compile = vi
    .mocked(WebAssembly.compileStreaming)
    .mockRejectedValueOnce(new Error("Failed to compile WASM"));

  serve.mockImplementation(async (_request, exchange) => {
    await exchange([{ type: "done", ok: true, value: undefined, writes: "[]" }]);
  });

  const run = async () => {
    const sandbox = ScriptSandbox.browserSandbox.make({});

    try {
      return await sandbox.execute("test");
    } finally {
      await sandbox.close();
    }
  };

  expect(await run()).toMatchObject({ ok: false, error: { kind: "sandbox" } });
  const results = await Promise.all([run(), run()]);
  expect(results.map((result) => result.ok)).toEqual([true, true]);
  expect((await run()).ok).toBe(true);
  expect(compile).toHaveBeenCalledTimes(2);
});
