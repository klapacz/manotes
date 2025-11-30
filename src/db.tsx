import { SQLocal } from "sqlocal";

export const db = new SQLocal("database.sqlite3");

db.sql`select 1`.then(console.log);
