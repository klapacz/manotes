import { useAtom } from "@effect/atom-solid";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { onCleanup, onMount } from "solid-js";
import { bindRt } from "../lib";
import { connectStudioBridge, type ResultSet, type StudioRunner } from "./studio-bridge";

// Default embed: Outerbase's hosted SQLite embed build. Talking to the hosted
// build keeps the AGPL code off our origin entirely (we never ship it). Point
// this at a self-hosted embed build if you'd rather not depend on their host.
const DEFAULT_EMBED_URL = "https://studio.outerbase.com/embed/sqlite";

// Run a single statement and grab write metadata in the same serialized
// connection turn. wa-sqlite runs one statement per call, so changes() /
// last_insert_rowid() observed right after refer to that statement.
const RunQuery = bindRt((rt) =>
  rt.fn(
    Effect.fn("DevStudio.runQuery")(function* (statement: string) {
      const sql = yield* SqlClient.SqlClient;
      // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The SQL console accepts arbitrary queries and columns.
      const rows = yield* sql.unsafe<Record<string, unknown>>(statement);

      const [meta] = yield* sql.unsafe<{ id: number; changes: number }>(
        "SELECT last_insert_rowid() AS id, changes() AS changes",
      );

      return {
        rows,
        lastInsertRowid: meta?.id,
        rowsAffected: meta?.changes ?? 0,
      } satisfies ResultSet;
    }),
  ),
);

const RunTransaction = bindRt((rt) =>
  rt.fn(
    Effect.fn("DevStudio.runTransaction")(function* (statements: ReadonlyArray<string>) {
      const sql = yield* SqlClient.SqlClient;

      return yield* sql
        .withTransaction(
          Effect.forEach(statements, (statement) =>
            // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- The SQL console accepts arbitrary queries and columns.
            Effect.map(sql.unsafe<Record<string, unknown>>(statement), (rows): ResultSet => ({
              rows,
            })),
          ),
        )
        .pipe(Effect.orDie);
    }),
  ),
);

export interface SqliteStudioProps {
  /** Override the embed URL (e.g. a self-hosted Studio build). */
  embedUrl?: string;
  theme?: "dark" | "light";
  class?: string;
}

/**
 * Dev-only: embeds Outerbase Studio as a SQL console over the active graph's
 * wa-sqlite database. Must render under a `$graph` route so the graph runtime
 * (and its `SqlClient`) is in context via `bindRt`.
 */
export function SqliteStudio(props: SqliteStudioProps) {
  const [, runQuery] = useAtom(RunQuery, { mode: "promise" });
  const [, runTransaction] = useAtom(RunTransaction, { mode: "promise" });

  const runner: StudioRunner = {
    query: (statement) => runQuery(statement),
    transaction: (statements) => runTransaction(statements),
  };

  const url = new URL(props.embedUrl ?? DEFAULT_EMBED_URL);
  url.searchParams.set("theme", props.theme ?? "light");
  url.searchParams.set("name", "manotes (local)");

  let iframe: HTMLIFrameElement | undefined;

  // Attach before the iframe boots so Studio's initial schema query can't race
  // ahead of our listener.
  onMount(() => {
    if (iframe) onCleanup(connectStudioBridge(iframe, runner));
  });

  return (
    <iframe
      ref={(el) => (iframe = el)}
      src={url.toString()}
      title="SQLite Studio"
      class={props.class ?? "h-full w-full border-0"}
    />
  );
}
