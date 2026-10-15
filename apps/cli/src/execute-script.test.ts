import { Console, Effect, Exit, Result } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Api } from "./execute-api";
import * as ExecuteScript from "./execute-script";

describe("ExecuteScript.run", () => {
  it("has no Node globals, filesystem, network, or timers", async () => {
    const output: unknown[] = [];

    await Effect.runPromise(
      ExecuteScript.run(
        `text([
          typeof process, typeof require, typeof module, typeof Buffer,
          typeof fetch, typeof setTimeout, typeof globalThis.api.editNote,
          typeof globalThis.api.createNote,
        ]);`,
        "edit.js",
        makeApi(),
      ).pipe(
        Effect.provideService(Console.Console, {
          ...console,
          log: (...args) => {
            output.push(...args);
          },
        }),
      ),
    );

    expect(output).toEqual([
      JSON.stringify([
        "undefined",
        "undefined",
        "undefined",
        "undefined",
        "undefined",
        "undefined",
        "function",
        "function",
      ]),
    ]);
  });

  it.each([
    'await import("node:fs");',
    'require("node:fs");',
    "export default async () => {};",
    'const value: string = "TypeScript";',
  ])("rejects host imports and unsupported script syntax: %s", async (source) => {
    const result = await Effect.runPromise(
      ExecuteScript.run(source, "edit.js", makeApi()).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);

    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(ExecuteScript.ScriptExecutionError);
      expect(result.failure).toMatchObject({
        scriptPath: "edit.js",
        cause: { kind: "script" },
      });
    }
  });

  it.each([
    'await api.editNote("", []);',
    'await api.editNote("note", [{ kind: "append", markdown: 7 }]);',
    'await api.editNote("note", [{ kind: "replace", text: "a", with: "b", occurrence: -1 }]);',
    'await api.editNote("note", [{ kind: "unknown" }]);',
    'await api.createNote("", []);',
    'await api.createNote("note", [{ kind: "replace", text: "a", with: "b" }]);',
    'await api.createNote("note", [{ kind: "date", date: 7 }]);',
  ])("rejects malformed arguments before calling the host: %s", async (source) => {
    const api = makeApi();

    const result = await Effect.runPromise(
      ExecuteScript.run(source, "edit.js", api).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    expect(api.editNote).not.toHaveBeenCalled();
    expect(api.createNote).not.toHaveBeenCalled();
  });

  it("keeps output before a tagged script failure", async () => {
    const output: unknown[] = [];

    const result = await Effect.runPromise(
      ExecuteScript.run(
        'console.log("before failure"); text({ count: 2 }); throw new Error("script failure");',
        "edit.js",
        makeApi(),
      ).pipe(
        Effect.provideService(Console.Console, {
          ...console,
          log: (...args) => {
            output.push(...args);
          },
        }),
        Effect.result,
      ),
    );

    expect(output).toEqual(["before failure", '{"count":2}']);
    expect(Result.isFailure(result)).toBe(true);

    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(ExecuteScript.ScriptExecutionError);
      expect(result.failure.message).toContain("script failure");
    }
  });

  it("forwards interruption and waits for host cleanup", async () => {
    const api = makeApi();
    const started = Promise.withResolvers<void>();
    const controller = new AbortController();
    let cleanedUp = false;
    api.editNote.mockImplementation((_id, _edits, signal) => {
      return Effect.runPromise(
        Effect.sync(() => started.resolve()).pipe(
          Effect.andThen(Effect.never),
          Effect.onExit(() => {
            return Effect.sleep("10 millis").pipe(
              Effect.andThen(
                Effect.sync(() => {
                  cleanedUp = true;
                }),
              ),
            );
          }),
        ),
        { signal },
      );
    });

    const execution = Effect.runPromiseExit(
      ExecuteScript.run('await api.editNote("note", []);', "edit.js", api),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();
    const result = await execution;

    expect(Exit.isFailure(result)).toBe(true);
    expect(api.editNote.mock.calls[0]?.[2]?.aborted).toBe(true);
    expect(cleanedUp).toBe(true);
  });

  it.each(["", 'throw new Error("after starting a call");'])(
    "waits for unawaited host calls to clean up when a script ends: %s",
    async (ending) => {
      const api = makeApi();
      let cleanedUp = false;
      api.editNote.mockImplementation((_id, _edits, signal) => {
        return Effect.runPromise(
          Effect.never.pipe(
            Effect.onExit(() => {
              return Effect.sleep("10 millis").pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    cleanedUp = true;
                  }),
                ),
              );
            }),
          ),
          { signal },
        );
      });

      const result = await Effect.runPromise(
        ExecuteScript.run(`api.editNote("note", []); ${ending}`, "edit.js", api).pipe(
          Effect.result,
        ),
      );

      expect(Result.isFailure(result)).toBe(ending !== "");
      expect(api.editNote).toHaveBeenCalledOnce();
      expect(api.editNote.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(cleanedUp).toBe(true);
    },
  );
});

function makeApi() {
  return {
    editNote: vi.fn<Api["editNote"]>(async () => undefined),
    createNote: vi.fn<Api["createNote"]>(async (id) => id ?? "generated-id"),
  };
}
