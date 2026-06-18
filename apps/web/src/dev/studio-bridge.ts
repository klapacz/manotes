// Bridge between an embedded Outerbase Studio iframe and a local query runner.
//
// Outerbase Studio's embed build (https://studio.outerbase.com/embed/<driver>)
// talks to its host over postMessage. The protocol is defined by their
// `EmbedQueryable` / `IframeConnection`:
//   - iframe -> parent:  { type: "query",       id, statement: string   }
//                        { type: "transaction", id, statements: string[] }
//   - parent -> iframe:  { type, id, data: DatabaseResultSet(|[]) }
//                        { type, id, error: string }
// Source: .reference/studio/src/drivers/iframe-driver.ts (studio v0.10.2).
//
// We answer those messages from manotes' wa-sqlite client, so no Studio code
// (React/Radix/AGPL) ends up in the manotes bundle — only this glue.

export interface ResultSet {
  rows: ReadonlyArray<Record<string, unknown>>;
  /** Optional, for INSERT feedback. */
  lastInsertRowid?: number;
  /** Optional, for write feedback. */
  rowsAffected?: number;
}

export interface StudioRunner {
  query(statement: string): Promise<ResultSet>;
  transaction(statements: Array<string>): Promise<Array<ResultSet>>;
}

type IncomingMessage =
  | { type: "query"; id: number; statement: string }
  | { type: "transaction"; id: number; statements: Array<string> };

/**
 * Wire a Studio iframe to a runner. Returns a disposer that removes the
 * listener. Call once the iframe element exists (it can mount before the
 * iframe finishes loading — Studio replays nothing, it only sends on demand).
 */
export function connectStudioBridge(iframe: HTMLIFrameElement, runner: StudioRunner): () => void {
  const handler = async (event: MessageEvent<IncomingMessage>) => {
    // Only trust messages coming from our own iframe document.
    if (event.source !== iframe.contentWindow) return;
    const msg = event.data;
    if (!msg || (msg.type !== "query" && msg.type !== "transaction")) return;

    try {
      const data =
        msg.type === "query"
          ? toDatabaseResultSet(await runner.query(msg.statement))
          : (await runner.transaction(msg.statements)).map(toDatabaseResultSet);
      reply(iframe, { type: msg.type, id: msg.id, data });
    } catch (cause) {
      reply(iframe, { type: msg.type, id: msg.id, error: errorMessage(cause) });
    }
  };

  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

function reply(iframe: HTMLIFrameElement, payload: unknown): void {
  iframe.contentWindow?.postMessage(payload, "*");
}

// Studio's DatabaseResultSet shape. `type` on headers is optional — when absent
// Studio infers the column type from the data, which is fine for a prototype.
// Source: .reference/studio/src/drivers/base-driver.ts + @outerbase/sdk-transform.
function toDatabaseResultSet(result: ResultSet) {
  const headerNames = collectColumnOrder(result.rows);
  return {
    headers: headerNames.map((name) => ({ name, displayName: name, originalType: null })),
    rows: result.rows,
    stat: {
      rowsAffected: result.rowsAffected ?? 0,
      rowsRead: null,
      rowsWritten: null,
      queryDurationMs: null,
    },
    lastInsertRowid: result.lastInsertRowid,
  };
}

// Preserve first-seen column order across rows so the grid columns are stable
// even when later rows are sparse.
function collectColumnOrder(rows: ReadonlyArray<Record<string, unknown>>): Array<string> {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return [...seen];
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return typeof cause === "string" ? cause : JSON.stringify(cause);
}
