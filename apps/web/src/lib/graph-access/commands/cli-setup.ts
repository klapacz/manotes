import { Effect, Option, Schema } from "effect";
import { HttpApiClient } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as KeyStore from "../key-store/service";
import type * as LocalRegistry from "../local-registry/schema";

export const prepare = Effect.fn("GraphAccessCommandsCliSetup.prepare")(function* (input: {
  readonly graph: LocalRegistry.CloudRecord;
  readonly origin: string;
}) {
  const keyStore = yield* KeyStore.Service;
  const key = yield* keyStore.get(input.graph.graphKeyEnvelope);
  if (Option.isNone(key)) {
    return yield* Effect.fail(new Error("Unlock the graph before setting up the CLI."));
  }
  const graphKey = yield* Schema.encodeEffect(Schema.Uint8ArrayFromBase64)(key.value);

  // The graph key decrypts content; a separate bearer session authorizes server access.
  // Only issue it on the user's prepare action, never when opening the menu or dialog.
  const client = yield* HttpApiClient.make(SessionApi.SessionApi, { baseUrl: input.origin });
  const { apiKey } = yield* client.session.createApiKey();

  return [
    " manotes init",
    `--origin ${shellQuote(input.origin)}`,
    `--token ${shellQuote(apiKey)}`,
    `--graph-id ${shellQuote(input.graph.graphId)}`,
    `--graph-key ${shellQuote(graphKey)}`,
  ].join(" ");
});

export const copy = Effect.fn("GraphAccessCommandsCliSetup.copy")((command: string) =>
  Effect.tryPromise({
    try: () => navigator.clipboard.writeText(command),
    catch: () => new Error("Could not copy the init command."),
  }),
);

// POSIX quoting keeps every value a single literal argument, including apostrophes.
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export * as CliSetup from "./cli-setup";
