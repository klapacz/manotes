import path from "node:path";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { ExecuteApi } from "@manotes/shared/execute-api";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { Effect, FileSystem, Stdio, Stream } from "effect";
import { CliPaths } from "./cli.paths";

/** Runs each script VM in a Node worker thread. */
export const nodeSandbox = ExecuteScript.Sandbox.of({
  make: (options) => new CodemodeSandbox(options),
});

export const runScript = Effect.fn("CliExecute.runScript")(function* (scriptPath: string) {
  const fs = yield* FileSystem.FileSystem;
  const source = yield* fs.readFileString(scriptPath);
  const api = yield* ExecuteApi.makeApi();
  yield* ExecuteScript.run(source, scriptPath, api).pipe(
    Effect.provideService(ExecuteScript.Sandbox, nodeSandbox),
  );
});

export const acquireStdinScript = Effect.fn("CliExecute.acquireStdinScript")(function* () {
  return yield* Effect.acquireRelease(
    Effect.gen(function* () {
      const paths = yield* CliPaths.Service;
      const fs = yield* FileSystem.FileSystem;
      const stdio = yield* Stdio.Stdio;
      const script = yield* stdio.stdin.pipe(Stream.decodeText(), Stream.mkString);
      const scriptPath = path.join(paths.manotesDir, `execute-${process.pid}-${Date.now()}.js`);

      yield* fs.writeFileString(scriptPath, script, { mode: 0o600 });

      return scriptPath;
    }),
    Effect.fnUntraced(function* (scriptPath) {
      const fs = yield* FileSystem.FileSystem;
      yield* fs.remove(scriptPath, { force: true }).pipe(Effect.ignore);
    }),
  );
});

export * as CliExecute from "./cli.execute.ts";
