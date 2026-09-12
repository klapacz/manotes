import { Effect, Match } from "effect";
import { CliError } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";
import type { NoteSearch } from "../lib/note/search";
import { PaneMake } from "../lib/note/pane.make";
import type { CliConfig } from "./cli.config";

export function make(config: Pick<CliConfig.Config, "origin" | "graphId">, id?: string): string {
  const url = new URL(`/${encodeURIComponent(config.graphId)}`, config.origin);

  if (id === undefined) return url.href;

  const search = {
    panes: [PaneMake.note(id)],
  } satisfies typeof NoteSearch.Schema.Encoded;

  url.searchParams.set("panes", JSON.stringify(search.panes));

  return url.href;
}

export const open = Effect.fn("CliUrl.open")(
  function* (url: string) {
    const command = Match.value(process.platform).pipe(
      Match.when("darwin", () => "open"),
      Match.when("linux", () => "xdg-open"),
      Match.orElse(() => undefined),
    );

    if (command === undefined) {
      return yield* Effect.fail(new Error(`Opening URLs is not supported on ${process.platform}.`));
    }

    const child = yield* ChildProcess.make(command, [url], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
    });

    const exitCode = yield* child.exitCode;

    if (exitCode === 0) return;

    return yield* Effect.fail(
      new Error(`${command} exited with code ${exitCode}. Open the printed URL manually.`),
    );
  },
  Effect.mapError((cause) => new CliError.UserError({ cause })),
);

export * as CliUrl from "./url";
