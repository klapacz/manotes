import { fileURLToPath } from "node:url";
import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";
// Bootstrap must load before the shared package has been built.
import { DevEnv } from "../packages/shared/src/dev-env.ts";
import { DevPorts } from "./dev-ports.ts";
import { DevStage } from "./dev-stage.ts";
import { DevCmd } from "./dev-cmd.ts";

const root = fileURLToPath(new URL("../", import.meta.url));

export const cli = Command.make(
  "dev",
  {
    extension: Flag.boolean("extension").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Also run the browser extension dev server."),
    ),
  },
  ({ extension }) => launch(extension),
).pipe(Command.withDescription("Run Manotes in the current Jujutsu workspace through Portless."));

// Stage selection and builds must happen before Alchemy imports the stack.
// A resource inside that stack cannot bootstrap its own stage or build inputs.
const launch = Effect.fn("Dev.launch")(function* (extension: boolean) {
  const { workspace, stage } = yield* DevStage.get(root);

  for (const task of ["@manotes/shared#build", "@manotes/sql-sqlite-wasm#build"]) {
    yield* DevCmd.run({ cwd: root, command: "vp", args: ["run", "--cache", task] });
  }

  const ports = yield* DevPorts.reservePorts();

  const env = {
    ...process.env,
    [DevEnv.names.stage]: stage,
    [DevEnv.names.webPort]: String(ports.web),
    [DevEnv.names.apiPort]: String(ports.api),
    [DevEnv.names.extensionPort]: String(ports.extension),
  };

  const packages = ["@manotes/shared", "@manotes/sql-sqlite-wasm", "@manotes/worker"];

  if (extension) packages.push("@manotes/extension");

  // Portless supplies PORTLESS_URL directly to the tasks, including Vite's config.
  const portless = fileURLToPath(new URL("./cli.js", import.meta.resolve("portless")));

  yield* DevCmd.run({
    cwd: root,
    // Use the launcher's Node binary rather than resolving another one from PATH.
    command: process.execPath,
    args: [
      portless,
      `${workspace}.manotes`,
      "--app-port",
      String(ports.web),
      "vp",
      "run",
      "--parallel",
      "--log",
      "labeled",
      ...packages.flatMap((name) => ["--filter", name]),
      "dev",
    ],
    env,
  });
}, Effect.scoped);

export const main = Command.run(cli, { version: "0.0.0" });

if (import.meta.main) {
  NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
}
