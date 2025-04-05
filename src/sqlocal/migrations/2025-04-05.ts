import type { Kysely, Migration } from "kysely";

import * as Y from "yjs";
import { sqlocal } from "../client";
import { YjsUtils } from "@/lib/yjs.utils";

export const getClientId = () => {
  const clientId = localStorage.getItem("clientId");
  if (!clientId) {
    const newClientId = Math.random().toString(36).substring(2, 15);
    localStorage.setItem("clientId", newClientId);
    return newClientId;
  }
  return clientId;
};

export const Migration20250405: Migration = {
  async up(db: Kysely<any>) {
    await sqlocal.transaction(async (tx) => {
      const notes = await tx.query(
        db.selectFrom("notes").selectAll().compile(),
      );
      await tx.sql`
        ALTER TABLE notes ADD COLUMN content_binary BLOB;
        ALTER TABLE notes ADD COLUMN vector_clock JSON NOT NULL DEFAULT '{}'
      `;

      const clientId = getClientId();

      for (const note of notes) {
        const content = JSON.parse(note.content);
        try {
          const ydoc = YjsUtils.prosemirrorJSONToYDoc(content);
          await tx.query(
            db
              .updateTable("notes")
              .set({
                content_binary: Y.encodeStateAsUpdate(ydoc),
                vector_clock: JSON.stringify({ [clientId]: 0 }),
              })
              .where("id", "=", note.id)
              .compile(),
          );
        } catch (error) {
          console.error(`Error processing note ${note.id}: ${error}`);
          console.log(content);
          throw error;
        }
      }

      await tx.sql`
        CREATE TABLE notes_new (
          id TEXT PRIMARY KEY,
          title TEXT DEFAULT 'Untitled' NOT NULL,
          daily_at DATE,
          content BLOB NOT NULL,
          vector_clock JSON NOT NULL
        );
        INSERT INTO notes_new(id, title, daily_at, content, vector_clock)
        SELECT id, title, daily_at, content_binary, vector_clock FROM notes;
        DROP TABLE notes;
        ALTER TABLE notes_new RENAME TO notes;
      `;
    });
  },

  async down() {
    throw new Error("Downgrade not supported");
  },
};
