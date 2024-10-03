import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely, ParseJSONResultsPlugin } from "kysely";
import type { Database } from "./schema";

export const sqlocal = new SQLocalKysely("database.sqlite3");
export const db = new Kysely<Database>({
  dialect: sqlocal.dialect,

  plugins: [new ParseJSONResultsPlugin()],
});
