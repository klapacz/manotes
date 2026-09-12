/* eslint-disable anti-slop/no-unknown-parameters -- wa-sqlite does not expose the Emscripten module type used by this example VFS. */

declare module "wa-sqlite/src/examples/OPFSCoopSyncVFS" {
  import type { SQLiteVFS } from "wa-sqlite";

  export class OPFSCoopSyncVFS {
    static create(name: string, module: unknown): Promise<SQLiteVFS>;
  }
}

declare module "wa-sqlite/dist/wa-sqlite.wasm?url" {
  const string: string;
  export default string;
}
