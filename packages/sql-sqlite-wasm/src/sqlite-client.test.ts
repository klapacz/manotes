import { Cause, Deferred, Effect, Exit } from "effect";
import { Reactivity } from "effect/reactivity";
import { SqlError } from "effect/sql/SqlError";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { OpfsWorkerMessage } from "./internal/opfs-worker";
import { make } from "./sqlite-client";

beforeEach(() => vi.stubGlobal("ErrorEvent", WorkerErrorEvent));

afterEach(() => vi.unstubAllGlobals());

it("fails acquisition and releases the worker when startup errors before ready", async () => {
  const worker = new TestWorker(1, true);
  const removeListener = vi.spyOn(worker, "removeEventListener");

  const result = await Effect.runPromise(
    make({ worker: acquireWorker(worker), initMessage: { dbName: "test.sqlite3" } }).pipe(
      Effect.exit,
      Effect.scoped,
      Effect.provide(Reactivity.layer),
    ),
  );

  expect(Exit.isFailure(result)).toBe(true);

  if (Exit.isSuccess(result)) throw new Error("Worker startup unexpectedly succeeded");
  const error = Cause.squash(result.cause);
  expect(error).toBeInstanceOf(SqlError);
  expect(String(error)).toContain("Worker failed to initialize");
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(removeListener).toHaveBeenCalledWith("message", expect.any(Function));
  expect(removeListener).toHaveBeenCalledWith("error", expect.any(Function));
});

it("replaces a worker that errors after ready and executes queries on its replacement", async () => {
  const first = new TestWorker(1);
  const second = new TestWorker(2);
  let acquired = 0;

  await Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* make({
        worker: Effect.suspend(() => acquireWorker(acquired++ === 0 ? first : second)),
        initMessage: { dbName: "test.sqlite3" },
      });

      expect(yield* client`SELECT 1`).toEqual([{ workerId: 1 }]);
      first.fail();
      yield* Deferred.await(first.terminated);
      // ScopedRef installs the replacement immediately after releasing the old worker.
      yield* Effect.yieldNow;
      expect(yield* client`SELECT 1`).toEqual([{ workerId: 2 }]);
      expect(acquired).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(Reactivity.layer)),
  );

  expect(first.terminate).toHaveBeenCalledOnce();
  expect(second.terminate).toHaveBeenCalledOnce();
});

function acquireWorker(worker: TestWorker) {
  return Effect.acquireRelease(Effect.succeed(worker), () => Effect.sync(() => worker.terminate()));
}

class WorkerErrorEvent extends Event {
  readonly message = "Worker script could not load";
  readonly error = new Error(this.message);

  constructor() {
    super("error");
  }
}

class TestWorker extends EventTarget implements Worker {
  readonly onerror = null;
  readonly onmessage = null;
  readonly onmessageerror = null;
  readonly terminated = Deferred.makeUnsafe<void>();
  readonly terminate = vi.fn(() => Deferred.doneUnsafe(this.terminated, Exit.void));

  constructor(
    readonly id: number,
    private readonly failOnStart = false,
  ) {
    super();
  }

  fail() {
    this.dispatchEvent(new WorkerErrorEvent());
  }

  postMessage(message: OpfsWorkerMessage | { dbName: string }) {
    if ("dbName" in message) {
      queueMicrotask(() => {
        if (this.failOnStart) this.fail();
        else this.dispatchEvent(new MessageEvent("message", { data: ["ready"] }));
      });

      return;
    }

    if (!Number.isInteger(message[0])) return;

    queueMicrotask(() => {
      this.dispatchEvent(
        new MessageEvent("message", { data: [message[0], undefined, [["workerId"], [[this.id]]]] }),
      );
    });
  }
}
