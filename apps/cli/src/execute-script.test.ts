import { RecordSchema } from "@manotes/shared/record.schema";
import { Console, Effect, Exit, Result } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Api } from "./execute-api";
import { ExecuteScript } from "./execute-script";
import type { CliList } from "./list";

const item: CliList.Item = {
  id: RecordSchema.Id.make("note"),
  title: null,
  text: "First paragraph. Second paragraph.",
  date: "2026-11-08",
  createdAt: "2026-11-08T10:00:00.000Z",
  updatedAt: "2026-11-08T11:00:00.000Z",
  markdown: "First paragraph.\n\nSecond paragraph.\n",
  snippets: ["First paragraph."],
};

describe("ExecuteScript.run", () => {
  it("has no Node globals, filesystem, network, or timers", async () => {
    const output: unknown[] = [];

    await Effect.runPromise(
      ExecuteScript.run(
        `text([
          typeof process, typeof require, typeof module, typeof Buffer,
          typeof fetch, typeof setTimeout, typeof globalThis.api.editRecord,
          typeof globalThis.api.createRecord, typeof globalThis.api.list,
          typeof globalThis.api.showList,
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
    'await api.editRecord("", []);',
    'await api.editRecord("note", [{ kind: "append", markdown: 7 }]);',
    'await api.editRecord("note", [{ kind: "replace", text: "a", with: "b", occurrence: -1 }]);',
    'await api.editRecord("note", [{ kind: "unknown" }]);',
    'await api.createRecord("", []);',
    'await api.createRecord("note", [{ kind: "replace", text: "a", with: "b" }]);',
    'await api.createRecord("note", [{ kind: "date", date: 7 }]);',
    'await api.list("wrong");',
    "await api.list({ limit: 0 });",
    "await api.list({ limit: -1 });",
    "await api.list({ limit: 1.5 });",
    'await api.list({ sort: "random" });',
    'await api.list({ filter: [{ _tag: "cmp", val: ["date", "=", "2026-02-30"] }] });',
    'await api.list({ filter: [{ _tag: "cmp", val: ["body", "regex", "x"] }] });',
    'await api.showList("json", []);',
    'await api.showList("short", [{ id: "note" }]);',
  ])("rejects malformed arguments before calling the host: %s", async (source) => {
    const api = makeApi();

    const result = await Effect.runPromise(
      ExecuteScript.run(source, "edit.js", api).pipe(Effect.result),
    );

    expect(Result.isFailure(result)).toBe(true);
    expect(api.editRecord).not.toHaveBeenCalled();
    expect(api.createRecord).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
  });

  it.each(["", "undefined", "null"])("accepts omitted list options: %s", async (argument) => {
    const api = makeApi();
    await Effect.runPromise(ExecuteScript.run(`await api.list(${argument});`, "list.js", api));
    expect(api.list).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it("prints selected records and skips empty lists", async () => {
    const api = makeApi();
    api.list.mockResolvedValue([item]);
    const output: unknown[] = [];

    await Effect.runPromise(
      ExecuteScript.run(
        'await api.showList("short", await api.list({ limit: 1 })); await api.showList("full", []);',
        "list.js",
        api,
      ).pipe(
        Effect.provideService(Console.Console, {
          ...console,
          log: (...args) => {
            output.push(...args);
          },
        }),
      ),
    );

    expect(output).toEqual(["Untitled note 2026-11-08\n\n  First paragraph."]);
    expect(api.list).toHaveBeenCalledWith({ limit: 1 }, expect.any(AbortSignal));
  });

  it("forwards cancellation to listing and waits for cleanup", async () => {
    const api = makeApi();
    const started = Promise.withResolvers<void>();
    const controller = new AbortController();
    let cleanedUp = false;
    api.list.mockImplementation((_options, signal) => {
      return Effect.runPromise(
        Effect.sync(() => started.resolve()).pipe(
          Effect.andThen(Effect.never),
          Effect.onExit(() => {
            return Effect.sync(() => {
              cleanedUp = true;
            });
          }),
        ),
        { signal },
      );
    });

    const execution = Effect.runPromiseExit(
      ExecuteScript.run("await api.list();", "list.js", api),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();
    expect(Exit.isFailure(await execution)).toBe(true);
    expect(api.list.mock.calls[0]?.[1]?.aborted).toBe(true);
    expect(cleanedUp).toBe(true);
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
    api.editRecord.mockImplementation((_id, _edits, signal) => {
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
      ExecuteScript.run('await api.editRecord("note", []);', "edit.js", api),
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();
    const result = await execution;

    expect(Exit.isFailure(result)).toBe(true);
    expect(api.editRecord.mock.calls[0]?.[2]?.aborted).toBe(true);
    expect(cleanedUp).toBe(true);
  });

  it.each(["", 'throw new Error("after starting a call");'])(
    "waits for unawaited host calls to clean up when a script ends: %s",
    async (ending) => {
      const api = makeApi();
      let cleanedUp = false;
      api.editRecord.mockImplementation((_id, _edits, signal) => {
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
        ExecuteScript.run(`api.editRecord("note", []); ${ending}`, "edit.js", api).pipe(
          Effect.result,
        ),
      );

      expect(Result.isFailure(result)).toBe(ending !== "");
      expect(api.editRecord).toHaveBeenCalledOnce();
      expect(api.editRecord.mock.calls[0]?.[2]?.aborted).toBe(true);
      expect(cleanedUp).toBe(true);
    },
  );
});

function makeApi() {
  return {
    list: vi.fn<Api["list"]>(async () => []),
    editRecord: vi.fn<Api["editRecord"]>(async () => undefined),
    createRecord: vi.fn<Api["createRecord"]>(
      async (id) => id ?? RecordSchema.Id.make("generated-id"),
    ),
  };
}
