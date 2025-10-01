import { db } from "@/sqlocal/client";

export namespace TagRepo {
  export async function create(tag: { id: string; name: string }) {
    return await db
      .insertInto("tags")
      .values(tag)
      .returning(["id", "name as label"])
      .executeTakeFirstOrThrow();
  }

  export async function search({ name }: { name: string }) {
    return db
      .selectFrom("tags")
      .where("name", "like", `%${name}%`)
      .selectAll("tags")
      .execute();
  }
}
