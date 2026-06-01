import { Data, Effect, Layer } from "effect";
import { Struct } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-do";
import * as Repo from "./repo.ts";
import * as Cloudflare from "alchemy/Cloudflare";

export const NAMESPACE_KEY = "accounts-v1";

export type ResolvedAccount = {
  readonly accountId: string;
  readonly email: string;
};

export type WaitlistResult = {
  readonly status: "WAITLIST" | "ACTIVE";
};

export default class AccountsDurableObject extends Cloudflare.DurableObjectNamespace<AccountsDurableObject>()(
  "AccountsDurableObject",
  // oxlint-disable-next-line require-yield
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;
      const layer = Repo.Service.layer.pipe(
        Layer.provideMerge(
          SqliteClient.layer({
            db: state.storage.sql.raw,
            spanAttributes: { durableObject: "AccountsDurableObject" },
          }),
        ),
      );

      yield* state.blockConcurrencyWhile(() =>
        Repo.migrate.pipe(Effect.provide(layer), Effect.orDie),
      );

      return {
        ensureAccount: Effect.fn(function* (email: string) {
          const result: ResolvedAccount = yield* ensureAccount(email).pipe(
            Effect.map(
              // Durable Objects should return plain structured-clone-safe values. The repo entity
              // includes decoded DateTime fields, so for now we narrow the transport shape here.
              // We'll replace this with a proper RPC boundary later.
              Struct.pick(["email", "accountId"]),
            ),
          );
          return result;
        }, Effect.provide(layer)),

        checkOrWaitlist: Effect.fn(function* (email: string) {
          const result: WaitlistResult = yield* checkOrWaitlist(email).pipe(
            Effect.map(Struct.pick(["status"])),
          );
          return result;
        }, Effect.provide(layer)),
      };
    });
  }),
) {}

const ensureAccount = Effect.fn("AccountsDurableObject.ensureAccount")(function* (email: string) {
  const repo = yield* Repo.Service;
  const account = yield* repo.findOrCreate({ email, status: "ACTIVE" });

  if (account.status !== "ACTIVE") {
    return yield* Effect.fail(new AccountNotActiveError({ email }));
  }

  return account;
});

const checkOrWaitlist = Effect.fn("AccountsDurableObject.checkOrWaitlist")(function* (
  email: string,
) {
  const repo = yield* Repo.Service;

  return yield* repo.findOrCreate({ email, status: "WAITLIST" });
});

class AccountNotActiveError extends Data.TaggedError("Accounts.AccountNotActiveError")<{
  readonly email: string;
}> {}
