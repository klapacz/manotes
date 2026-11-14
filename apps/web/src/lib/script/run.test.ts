import { ExecuteScript } from "@manotes/shared/execute-script";
import type { Api } from "@manotes/shared/execute-api";
import { Console, Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ScriptRun } from "./run";

const mockMakeApi = vi.fn();

const mockRun = vi.fn();

vi.mock("@manotes/shared/execute-api", () => ({
  ExecuteApi: {
    makeApi: (...args: unknown[]) => mockMakeApi(...args),
  },
}));

vi.mock("@manotes/shared/execute-script", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@manotes/shared/execute-script")>();

  return {
    ...actual,
    ExecuteScript: {
      ...actual.ExecuteScript,
      run: (...args: unknown[]) => mockRun(...args),
    },
  };
});

const provideMock = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  // SAFETY: Mocked dependencies require no real services.
  return Effect.provide(effect, Layer.empty) as Effect.Effect<A, E, never>;
};

const runScript = (source: string, label: string) => provideMock(ScriptRun.run(source, label));

describe("ScriptRun.run", () => {
  const dummyApi: Api = {
    list: vi.fn(),
    listProps: vi.fn(),
    editRecord: vi.fn(),
    createRecord: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMakeApi.mockReturnValue(Effect.succeed(dummyApi));
  });

  it("captures output printed via Console.log and returns { output, error: null }", async () => {
    mockRun.mockImplementation((source: string, label: string, api: Api) => {
      return Effect.gen(function* () {
        expect(source).toBe("console.log('hello world')");
        expect(label).toBe("agent");
        expect(api).toBe(dummyApi);

        yield* Console.log("first line");
        yield* Console.log("multiple", "tokens", 42);
      });
    });

    const result = await Effect.runPromise(runScript("console.log('hello world')", "agent"));

    expect(result).toEqual({
      output: ["first line", "multiple tokens 42"],
      error: null,
    });
  });

  it("returns empty output and null error when script produces no output", async () => {
    mockRun.mockImplementation(() => Effect.void);

    const result = await Effect.runPromise(runScript("const x = 1;", "test-script"));

    expect(result).toEqual({
      output: [],
      error: null,
    });
  });

  it("catches ScriptExecutionError and returns { output, error: message }", async () => {
    mockRun.mockImplementation(() => {
      return Effect.gen(function* () {
        yield* Console.log("log before error");

        return yield* Effect.fail(
          new ExecuteScript.ScriptExecutionError({
            scriptPath: "agent",
            message: "agent: ReferenceError: notDefined is not defined",
            cause: new Error("notDefined is not defined"),
          }),
        );
      });
    });

    const result = await Effect.runPromise(runScript("notDefined()", "agent"));

    expect(result).toEqual({
      output: ["log before error"],
      error: "agent: ReferenceError: notDefined is not defined",
    });
  });

  it("does not catch non-execution errors (fails the run effect)", async () => {
    mockRun.mockImplementation(() => Effect.die(new Error("Unexpected crash")));

    await expect(Effect.runPromise(runScript("console.log(1)", "agent"))).rejects.toThrow(
      "Unexpected crash",
    );
  });

  it("fails if ExecuteApi.makeApi fails", async () => {
    mockMakeApi.mockReturnValue(Effect.fail(new Error("Failed to initialize database API")));

    await expect(Effect.runPromise(runScript("console.log(1)", "agent"))).rejects.toThrow(
      "Failed to initialize database API",
    );
  });
});
