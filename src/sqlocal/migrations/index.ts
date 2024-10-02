import { type Migration } from "kysely";
import { Migration20241002 } from "./2024-10-02";

export const migrations: Record<string, Migration> = {
  "2023-08-01": Migration20241002,
};
