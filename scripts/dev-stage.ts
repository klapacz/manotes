import { Config, Effect, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const WorkspaceName = Schema.Trim.check(Schema.isNonEmpty());

const decodeWorkspaceName = Schema.decodeEffect(WorkspaceName);

export const get = Effect.fn("DevStage.get")(function* (root: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const workspace = yield* spawner
    .string(
      ChildProcess.make(
        "jj",
        [
          "workspace",
          "list",
          "--ignore-working-copy",
          "-T",
          'if(target.current_working_copy(), name ++ "\\n")',
        ],
        { cwd: root, stderr: "inherit" },
      ),
    )
    .pipe(Effect.flatMap(decodeWorkspaceName));

  const username = yield* Config.schema(Schema.Trim.check(Schema.isNonEmpty()), "USER");

  return {
    workspace,
    stage: `dev_${username.replace(/[^a-zA-Z0-9_-]/g, "_")}_${workspace}`,
  };
});

export * as DevStage from "./dev-stage.ts";
