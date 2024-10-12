import { type Migration } from "kysely";
import { Migration20241002 } from "./2024-10-02";
import { Migration20241006 } from "./2024-10-06";
import { Migration20241012 } from "./2024-10-12";

export const migrations: Record<string, Migration> = {
  "2023-08-01": Migration20241002,
  "2024-10-06": Migration20241006,
  "2024-10-12": Migration20241012,
};
