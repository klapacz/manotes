import { Data, Effect, Runtime } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export const run = Effect.fn("DevCmd.run")(function* ({
  cwd,
  command,
  args,
  env = process.env,
}: {
  cwd: string;
  command: string;
  args: ReadonlyArray<string>;
  env?: NodeJS.ProcessEnv;
}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const code = yield* spawner.exitCode(
    ChildProcess.make(command, args, {
      cwd,
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      forceKillAfter: "5 seconds",
    }),
  );

  if (code !== 0) return yield* new CommandFailed({ command, code });
});

class CommandFailed extends Data.TaggedError("CommandFailed")<{
  readonly command: string;
  readonly code: number;
}> {
  readonly [Runtime.errorExitCode] = this.code;

  override get message() {
    return `${this.command} exited with code ${this.code}.`;
  }
}

export * as DevCmd from "./dev-cmd.ts";
