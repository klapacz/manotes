import { ExecuteApi } from "@manotes/shared/execute-api";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { Console, Effect } from "effect";
import { ScriptSandbox } from "./sandbox";

/** Runs a script against the graph. Runs in the leader dedicated worker, beside the materializer. */
export const run = Effect.fn("ScriptRun.run")(function* (source: string, label: string) {
  const output: string[] = [];
  const api = yield* ExecuteApi.makeApi();

  const error = yield* ExecuteScript.run(source, label, api).pipe(
    Effect.provideService(ExecuteScript.Sandbox, ScriptSandbox.browserSandbox),
    Effect.provideService(Console.Console, {
      ...console,
      // `ExecuteScript.run` logs each text item the script printed.
      log: (...args) => {
        output.push(args.join(" "));
      },
    }),
    Effect.as(null),
    // Script failures sit next to the output; anything else fails the run.
    Effect.catchTag("ExecuteScript.ScriptExecutionError", (error) => Effect.succeed(error.message)),
  );

  return { output, error };
});

export * as ScriptRun from "./run";
