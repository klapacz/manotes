import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Console, Effect, Exit, Result } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { ExecuteApi, type Api } from "@manotes/shared/execute-api";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { CliExecute } from "./cli.execute";
import { CliList } from "@manotes/shared/list";

const item = CliList.Item.cases.note.make({
  props: { top: [], groups: [] },
  id: RecordSchema.Id.make("note"),
  title: null,
  text: "First paragraph. Second paragraph.",
  date: "2026-11-08",
  createdAt: "2026-11-08T10:00:00.000Z",
  updatedAt: "2026-11-08T11:00:00.000Z",
  markdown: "First paragraph.\n\nSecond paragraph.\n",
  snippets: ["First paragraph."],
});

describe("ExecuteScript.run", () => {
  it("has no Node globals, filesystem, network, or timers", async () => {
    const output: unknown[] = [];

    await Effect.runPromise(
      run(
        `text([
          typeof process, typeof require, typeof module, typeof Buffer,
          typeof fetch, typeof setTimeout, typeof globalThis.api.editRecord,
          typeof globalThis.api.createRecord, typeof globalThis.api.list,
          typeof globalThis.api.showList, typeof globalThis.api.listProps,
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
    const result = await Effect.runPromise(run(source, "edit.js", makeApi()).pipe(Effect.result));

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
    'await api.editRecord("note", [{ kind: "append", markdown: "Legacy kind" }]);',
    'await api.editRecord("note", [{ kind: "replace", text: "a", with: "b" }]);',
    'await api.editRecord("note", [{ kind: "date", date: "2026-11-13" }]);',
    'await api.editRecord("note", [{ kind: "body.append", markdown: 7 }]);',
    'await api.editRecord("note", [{ kind: "body.replace", text: "a", with: "b", occurrence: -1 }]);',
    'await api.editRecord("note", [{ kind: "unknown" }]);',
    'await api.editRecord("note", [{ kind: "prop.set", propId: "", value: { _tag: "bool", val: true } }]);',
    'await api.editRecord("note", [{ kind: "prop.set", propId: "flag", ruleId: "", value: { _tag: "bool", val: true } }]);',
    'await api.editRecord("note", [{ kind: "prop.set", propId: "flag" }]);',
    'await api.editRecord("note", [{ kind: "prop.set", propId: "flag", value: { _tag: "bool", val: "true" } }]);',
    'await api.editRecord("note", [{ kind: "prop.set", propId: "number", value: { _tag: "number", val: NaN } }]);',
    'await api.editRecord("note", [{ kind: "prop.clear", propId: "" }]);',
    'await api.editRecord("note", [{ kind: "preset_default.set", value: "true" }]);',
    'await api.editRecord("note", [{ kind: "prop_type.set", value: "invalid" }]);',
    'await api.editRecord("note", [{ kind: "prop_targets.set", value: [{ _tag: "cmp", val: ["rules", "violation", true] }] }]);',
    'await api.editRecord("note", [{ kind: "rule_storage.set", value: { _tag: "other" } }]);',
    'await api.editRecord("note", [{ kind: "rule_expects.set", propId: "", value: { _tag: "required" } }]);',
    'await api.editRecord("note", [{ kind: "rule_expects.clear", propId: "" }]);',
    'await api.createRecord("note", []);',
    "await api.createRecord(undefined, []);",
    'await api.createRecord({ _tag: "note", id: "" }, []);',
    'await api.createRecord({ _tag: "unknown" }, []);',
    'await api.createRecord({ _tag: "preset" }, []);',
    'await api.createRecord({ _tag: "preset", preset_filter: [], preset_default: "yes" }, []);',
    'await api.createRecord({ _tag: "prop", prop_type: "text", prop_default: { _tag: "number", val: 1 } }, []);',
    'await api.createRecord({ _tag: "prop", prop_type: "text", prop_targets: [] }, []);',
    'await api.createRecord({ _tag: "prop", prop_type: "link", prop_targets: [{ _tag: "cmp", val: ["rules", "violation", true] }] }, []);',
    'await api.createRecord({ _tag: "rule" }, []);',
    'await api.createRecord({ _tag: "rule", rule_targets: [{ _tag: "cmp", val: ["rules", "violation", true] }] }, []);',
    'await api.createRecord({ _tag: "owned", owned_type: "enum_option" }, []);',
    'await api.createRecord({ _tag: "owned", owned_type: "other", owned_parent: "p" }, []);',
    'await api.createRecord({ _tag: "note", id: "note" }, [{ kind: "body.replace", text: "a", with: "b" }]);',
    'await api.createRecord({ _tag: "note", id: "note" }, [{ kind: "date.set", date: 7 }]);',
    'await api.createRecord({ _tag: "note", id: "note" }, [{ kind: "prop.clear", propId: "flag" }]);',
    'await api.list("wrong");',
    'await api.listProps("wrong");',
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

    const result = await Effect.runPromise(run(source, "edit.js", api).pipe(Effect.result));

    expect(Result.isFailure(result)).toBe(true);
    expect(api.editRecord).not.toHaveBeenCalled();
    expect(api.createRecord).not.toHaveBeenCalled();
    expect(api.list).not.toHaveBeenCalled();
    expect(api.listProps).not.toHaveBeenCalled();
  });

  it("forwards prop sets during creation and grouped sets and clears during editing", async () => {
    const api = makeApi();

    await Effect.runPromise(
      run(
        `
      const id = await api.createRecord({ _tag: "note", id: "note" }, [
        { kind: "prop.set", propId: "builtin:archived", value: { _tag: "bool", val: true } },
      ]);
      await api.editRecord(id, [
        { kind: "prop.set", propId: "status", ruleId: "task", value: { _tag: "enum", val: "done" } },
        { kind: "prop.clear", propId: "priority", ruleId: "task" },
      ]);
    `,
        "props.js",
        api,
      ),
    );

    expect(api.createRecord).toHaveBeenCalledWith(
      ExecuteApi.CreateInit.members[0].make({ id: RecordSchema.Id.make("note") }),
      [
        {
          kind: "prop.set",
          propId: "builtin:archived",
          value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
        },
      ],
      expect.any(AbortSignal),
    );
    expect(api.editRecord).toHaveBeenCalledWith(
      "note",
      [
        {
          kind: "prop.set",
          propId: "status",
          ruleId: "task",
          value: AttrsSchema.PropVal.cases.enum.make({ val: RecordSchema.Id.make("done") }),
        },
        { kind: "prop.clear", propId: "priority", ruleId: "task" },
      ],
      expect.any(AbortSignal),
    );
  });

  it("forwards non-note createRecord inits and attr edit ops", async () => {
    const api = makeApi();

    await Effect.runPromise(
      run(
        `
      const id = await api.createRecord(
        {
          _tag: "preset",
          id: "inbox",
          preset_filter: [{ _tag: "cmp", val: ["_tag", "=", "note"] }],
          preset_default: true,
        },
        [],
      );
      await api.editRecord(id, [
        { kind: "preset_filter.set", value: [] },
        { kind: "preset_default.set", value: false },
      ]);
    `,
        "preset.js",
        api,
      ),
    );

    expect(api.createRecord).toHaveBeenCalledWith(
      ExecuteApi.CreateInit.members[1].make({
        id: RecordSchema.Id.make("inbox"),
        preset_filter: [AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "note"] })],
        preset_default: true,
      }),
      [],
      expect.any(AbortSignal),
    );
    expect(api.editRecord).toHaveBeenCalledWith(
      "inbox",
      [
        { kind: "preset_filter.set", value: [] },
        { kind: "preset_default.set", value: false },
      ],
      expect.any(AbortSignal),
    );
  });

  it.each(["", "undefined", "null"])("accepts omitted list options: %s", async (argument) => {
    const api = makeApi();
    await Effect.runPromise(run(`await api.list(${argument});`, "list.js", api));
    expect(api.list).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
  });

  it("returns property definitions through the sandbox", async () => {
    const api = makeApi();
    api.listProps.mockResolvedValue([
      {
        id: RecordSchema.Id.make("builtin:archived"),
        title: "Archived",
        prop_type: "bool",
        prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
      },
    ]);
    const output: unknown[] = [];

    await Effect.runPromise(
      run("text(await api.listProps());", "props.js", api).pipe(
        Effect.provideService(Console.Console, {
          ...console,
          log: (...args) => {
            output.push(...args);
          },
        }),
      ),
    );

    expect(api.listProps).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(JSON.parse(String(output[0]))).toEqual(await api.listProps.mock.results[0]?.value);
  });

  it("prints selected records and skips empty lists", async () => {
    const api = makeApi();
    api.list.mockResolvedValue([item]);
    const output: unknown[] = [];

    await Effect.runPromise(
      run(
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

  it.each(["list", "listProps"] as const)(
    "forwards cancellation to %s and waits for cleanup",
    async (method) => {
      const api = makeApi();
      const started = Promise.withResolvers<void>();
      const controller = new AbortController();
      let cleanedUp = false;
      let receivedSignal: AbortSignal | undefined;

      const request = (signal?: AbortSignal) => {
        receivedSignal = signal;

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
      };

      api.list.mockImplementation((_options, signal) => request(signal));
      api.listProps.mockImplementation(request);

      const execution = Effect.runPromiseExit(run(`await api.${method}();`, "list.js", api), {
        signal: controller.signal,
      });

      await started.promise;
      controller.abort();
      expect(Exit.isFailure(await execution)).toBe(true);
      expect(receivedSignal?.aborted).toBe(true);
      expect(cleanedUp).toBe(true);
    },
  );

  it("keeps output before a tagged script failure", async () => {
    const output: unknown[] = [];

    const result = await Effect.runPromise(
      run(
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
      run('await api.editRecord("note", []);', "edit.js", api),
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
        run(`api.editRecord("note", []); ${ending}`, "edit.js", api).pipe(Effect.result),
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
    listProps: vi.fn<Api["listProps"]>(async () => []),
    editRecord: vi.fn<Api["editRecord"]>(async () => undefined),
    createRecord: vi.fn<Api["createRecord"]>(
      async (init) => init.id ?? RecordSchema.Id.make("generated-id"),
    ),
  };
}

function run(...args: Parameters<typeof ExecuteScript.run>) {
  return ExecuteScript.run(...args).pipe(
    Effect.provideService(ExecuteScript.Sandbox, CliExecute.nodeSandbox),
  );
}
