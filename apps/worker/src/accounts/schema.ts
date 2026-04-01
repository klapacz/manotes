import * as Schema from "effect/Schema";

export const Account = Schema.Struct({
  accountId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
});

export type Account = typeof Account.Type;
export type RawAccount = typeof Account.Encoded;

export const encodeAccount = Schema.encodeEffect(Account);
export const decodeAccount = Schema.decodeEffect(Account);
