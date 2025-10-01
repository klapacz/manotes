import { db } from "@/sqlocal/client";

export namespace BacklinkRepo {
  export async function deleteForNote({ noteId }: { noteId: string }) {
    await db.deleteFrom("backlinks").where("source_id", "=", noteId).execute();
  }

  export async function createMany(
    backlinks: { source_id: string; target_id: string }[],
  ) {
    if (backlinks.length > 0) {
      await db.insertInto("backlinks").values(backlinks).execute();
    }
  }
}
