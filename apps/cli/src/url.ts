import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Effect, Match } from "effect";
import { CliError } from "effect/cli";
import { ChildProcess } from "effect/process";
import type { RecordSearch } from "@manotes/shared/record/search";
import type { CliConfig } from "./cli.config";

export function make(
  config: Pick<CliConfig.Config, "origin" | "graphId">,
  id?: RecordSchema.Id,
): string {
  const url = new URL(`/open/${encodeURIComponent(config.graphId)}`, config.origin);

  if (id === undefined) return url.href;

  const search = {
    panes: [PaneSchema.make.record({ id: id })],
  } satisfies typeof RecordSearch.Schema.Encoded;

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
  Effect.mapError((cause) => {
    return new CliError.UserError({
      cause,
      userMessage: "Could not open the browser. Open the printed URL manually.",
    });
  }),
);

export * as CliUrl from "./url";
