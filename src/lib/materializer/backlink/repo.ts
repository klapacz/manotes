import { Effect, pipe, Stream } from "effect";
import { desc, eq, sql } from "drizzle-orm";
import * as DB from "../../db.service";
import * as Tables from "../../db.tables";
import * as BacklinkSchema from "./schema";

export class Service extends Effect.Service<Service>()(
  "Materializer.BacklinkRepo.Service",
  {
    dependencies: [DB.Service.Default],
    effect: Effect.gen(function* () {
      const db = yield* DB.Service;

      const replaceForSource = Effect.fn(
        "Materializer.BacklinkRepo.replaceForSource",
      )(function* (sourceId: string, targetIds: ReadonlyArray<string>) {
        yield* db.query((db) =>
          db
            .delete(Tables.backlinks)
            .where(eq(Tables.backlinks.sourceId, sourceId))
            .returning({ sourceId: Tables.backlinks.sourceId }),
        );

        if (targetIds.length === 0) return;

        yield* db.query((db) =>
          db
            .insert(Tables.backlinks)
            .values(
              targetIds.map((targetId) => ({
                sourceId,
                targetId,
              })),
            )
            .returning({ sourceId: Tables.backlinks.sourceId }),
        );
      });

      const listIncomingNotes = Effect.fn(
        "Materializer.BacklinkRepo.listIncomingNotes",
      )(function* (targetId: string) {
        const rows = yield* db.query((db) =>
          db
            .select({
              id: Tables.notes.id,
              title: Tables.notes.title,
              content: Tables.notes.content,
              isDaily: Tables.notes.isDaily,
              updatedAt: Tables.notes.updatedAt,
            })
            .from(Tables.backlinks)
            .innerJoin(
              Tables.notes,
              eq(Tables.notes.id, Tables.backlinks.sourceId),
            )
            .where(eq(Tables.backlinks.targetId, targetId))
            .orderBy(
              desc(Tables.notes.isDaily),
              sql`CASE WHEN ${Tables.notes.isDaily} THEN ${Tables.notes.id} ELSE ${Tables.notes.updatedAt} END DESC`,
            ),
        );

        return yield* pipe(rows, BacklinkSchema.decodeIncomingBacklinks);
      });

      const reactiveListIncomingNotes = Effect.fn(
        "Materializer.BacklinkRepo.reactiveListIncomingNotes",
      )(function* (targetId: string) {
        const stream = yield* db.reactiveQuery((db) =>
          db
            .select({
              id: Tables.notes.id,
              title: Tables.notes.title,
              content: Tables.notes.content,
              isDaily: Tables.notes.isDaily,
              updatedAt: Tables.notes.updatedAt,
            })
            .from(Tables.backlinks)
            .innerJoin(
              Tables.notes,
              eq(Tables.notes.id, Tables.backlinks.sourceId),
            )
            .where(eq(Tables.backlinks.targetId, targetId))
            .orderBy(
              desc(Tables.notes.isDaily),
              sql`CASE WHEN ${Tables.notes.isDaily} THEN ${Tables.notes.id} ELSE ${Tables.notes.updatedAt} END DESC`,
            ),
        );

        return stream.pipe(
          Stream.mapEffect(BacklinkSchema.decodeIncomingBacklinks),
        );
      });

      return {
        listIncomingNotes,
        reactiveListIncomingNotes,
        replaceForSource,
      };
    }),
  },
) {}
