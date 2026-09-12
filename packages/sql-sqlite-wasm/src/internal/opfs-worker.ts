/**
 * Adapted from Effect's `packages/sql/sqlite-wasm/src/internal/opfsWorker.ts`;
 * the copied revision was not recorded. This type mirrors the local client and
 * worker protocol, including cross-tab update messages.
 */
/* eslint-disable anti-slop/no-unknown-type-aliases -- Effect deliberately leaves SQL parameters open for the driver. */

/** @internal */
export type OpfsWorkerMessage =
  | [id: number, sql: string, params: ReadonlyArray<unknown>]
  | ["import", id: number, data: Uint8Array]
  | ["export", id: number]
  | ["update_hook"]
  | ["close"];
