import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as S from "effect/Schema";
import * as ServiceMap from "effect/ServiceMap";
import { nanoid } from "nanoid";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Schema from "./schema";

const ACCOUNT_ID_LENGTH = 12;

export class Service extends ServiceMap.Service<Service>()("AccountsRepo.Service", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const getAccountByEmail = SqlSchema.findOneOption({
      Request: S.Struct({ email: S.String }),
      Result: Schema.Account,
      execute: ({ email }) => sql`
        SELECT accountId, email, createdAt, updatedAt
        FROM accounts
        WHERE email = ${email}
        LIMIT 1
      `,
    });

    const createAccount = SqlSchema.findOne({
      Request: S.Struct({ email: S.String }),
      Result: Schema.Account,
      execute: Effect.fn(function* ({ email }) {
        const timestamp = yield* DateTime.now;
        const values = yield* Schema.encodeAccount({
          accountId: nanoid(ACCOUNT_ID_LENGTH),
          email,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        return yield* sql`
          INSERT INTO accounts ${sql.insert(values)}
          RETURNING accountId, email, createdAt, updatedAt
        `;
      }),
    });

    return {
      getAccountByEmail,
      createAccount,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export const migrate = Effect.gen(function* () {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms();

  yield* sql`
    CREATE TABLE IF NOT EXISTS accounts (
      accountId TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `;
});
