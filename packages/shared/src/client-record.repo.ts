import { Array, Context, Effect, Layer, Predicate, Result } from "effect";
import { Query } from "effect-qb";
import * as Y from "yjs";
import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RecordDoc } from "./record/doc";
import { RecordFilter } from "./record/filter";
import { Filters } from "./record/filters";
import { YSchema } from "./y-schema";

const clientRowsPlan = Query.select({
  materializedYUpdate: Tables.records.materializedYUpdate,
}).pipe(
  Query.from(Tables.records),
  Query.where(
    RecordFilter.filterPredicate([
      AttrsSchema.makeTargetFilterExpr.cmp({ val: ["_tag", "=", "client"] }),
      Filters.aliases.unarchived.make(),
    ]),
  ),
  Query.where(Query.eq(Tables.records.attrs_valid, 1)),
);

export class Service extends Context.Service<Service>()("ClientRecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const listKeys = Effect.fn("ClientRecordRepo.listKeys")(function* () {
      const rows = yield* db.query(clientRowsPlan);

      const updates = Array.filterMap(rows, (row) => {
        if (row.materializedYUpdate === null) return Result.failVoid;

        return Result.succeed(row.materializedYUpdate);
      });

      return yield* Effect.forEach(updates, (update) => {
        return readClientKey(update).pipe(Effect.option);
      }).pipe(Effect.map(Array.getSomes));
    });

    return { listKeys };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

const readClientKey = Effect.fn("ClientRecordRepo.readClientKey")(function* (
  update: Uint8Array<ArrayBufferLike>,
) {
  const { doc, attrs } = yield* Effect.acquireRelease(
    Effect.sync(() => RecordDoc.make()),
    ({ doc }) => Effect.sync(() => doc.destroy()),
  );

  yield* Effect.sync(() => Y.applyUpdate(doc, update));
  const parsed = yield* YSchema.exportStrict(attrs);

  if (!Predicate.isTagged(parsed, "client")) return yield* Effect.fail("not-client");

  return parsed.client_key;
}, Effect.scoped);

export * as ClientRecordRepo from "./client-record.repo";
