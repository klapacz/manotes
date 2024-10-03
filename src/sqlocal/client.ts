import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely, ParseJSONResultsPlugin } from "kysely";
import type { Database } from "./schema";

type ExecParams = Parameters<SQLocalKysely["exec"]>;

class PublicExecSQLocalKysely extends SQLocalKysely {
  execSQL = (...args: ExecParams): Promise<RawResultData> => {
    return this.exec(...args);
  };
}

export type RawResultData = {
  rows: unknown[] | unknown[][];
  columns: string[];
};

export const sqlocal = new PublicExecSQLocalKysely("database.sqlite3");
export const db = new Kysely<Database>({
  dialect: sqlocal.dialect,

  plugins: [new ParseJSONResultsPlugin()],
});
