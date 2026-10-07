import { Effect, Match } from "effect";
import { CliError } from "effect/unstable/cli";
import { ChildProcess } from "effect/unstable/process";
import type { NoteSearch } from "@manotes/shared/note/search";
import { PaneMake } from "@manotes/shared/note/pane.make";
import type { CliConfig } from "./cli.config";

export function make(config: Pick<CliConfig.Config, "origin" | "graphId">, id?: string): string {
  const url = new URL(`/open/${encodeURIComponent(config.graphId)}`, config.origin);

  if (id === undefined) return url.href;

  const search = {
    panes: [PaneMake.note(id)],
  } satisfies typeof NoteSearch.Schema.Encoded;

  url.searchParams.set("panes", JSON.stringify(search.panes));

  return url.href;
}

export const open = Effect.fn("CliUrl.open")(
  function* (url: string) {
    const opener = Match.value(process.platform).pipe(
      Match.when("darwin", () => ({ command: "open", args: [url] })),
      Match.when("linux", () => ({ command: "xdg-open", args: [url] })),
      Match.when("win32", () => ({
        command: "rundll32.exe",
        args: ["url.dll,FileProtocolHandler", url],
      })),
      Match.orElse(() => undefined),
    );

    if (opener === undefined) {
      return yield* Effect.fail(new Error(`Opening URLs is not supported on ${process.platform}.`));
    }

    const child = yield* ChildProcess.make(opener.command, opener.args, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });

    const exitCode = yield* child.exitCode;

    if (exitCode === 0) return;

    return yield* Effect.fail(
      new Error(`${opener.command} exited with code ${exitCode}. Open the printed URL manually.`),
    );
  },
  Effect.mapError(
    (cause) =>
      new CliError.UserError({
        cause,
        userMessage: "Could not open the browser. Open the printed URL manually.",
      }),
  ),
);

export * as CliUrl from "./url";
