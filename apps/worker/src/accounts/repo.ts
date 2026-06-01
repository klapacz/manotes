import { DateTime, Effect, Layer, Schema as S, Context, Option } from "effect";
import { nanoid } from "nanoid";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import * as Schema from "./schema.ts";

const ACCOUNT_ID_LENGTH = 12;
const ACCOUNT_COLUMNS = "accountId, email, status, createdAt, updatedAt";

const CreateAccountRequest = S.Struct({
  email: S.String,
  status: Schema.Status,
});

export class Service extends Context.Service<Service>()("AccountsRepo.Service", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    const getAccountByEmail = SqlSchema.findOneOption({
      Request: S.Struct({ email: S.String }),
      Result: Schema.Account,
      execute: ({ email }) => sql`
        SELECT ${sql.literal(ACCOUNT_COLUMNS)}
        FROM accounts
        WHERE email = ${email}
        LIMIT 1
      `,
    });

    const createAccount = SqlSchema.findOne({
      Request: CreateAccountRequest,
      Result: Schema.Account,
      execute: Effect.fn("AccountsRepo.createAccount.execute")(function* ({ email, status }) {
        const timestamp = yield* DateTime.now;
        const values = yield* Schema.encodeAccount({
          accountId: nanoid(ACCOUNT_ID_LENGTH),
          email,
          status,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        return yield* sql`
          INSERT INTO accounts ${sql.insert(values)}
          RETURNING ${sql.literal(ACCOUNT_COLUMNS)}
        `;
      }),
    });

    const findOrCreate = Effect.fn("AccountsRepo.findOrCreate")(function* (
      request: typeof CreateAccountRequest.Type,
    ) {
      const existing = yield* getAccountByEmail({ email: request.email });

      if (Option.isSome(existing)) return existing.value;

      return yield* createAccount(request);
    });

    return {
      getAccountByEmail,
      createAccount,
      findOrCreate,
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
      status TEXT NOT NULL DEFAULT 'WAITLIST',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `;

  // Run separately from CREATE TABLE so existing Accounts DO storage gets the new column too.
  // Ignore the duplicate-column error for fresh DBs where CREATE TABLE already included it.
  yield* sql`
    ALTER TABLE accounts ADD COLUMN status TEXT NOT NULL DEFAULT 'WAITLIST'
  `.pipe(Effect.ignore);
});
