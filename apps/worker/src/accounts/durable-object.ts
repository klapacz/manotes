import { Config, Data, Effect, Layer, Option } from "effect";
import { Struct } from "effect";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { AccountsRepo } from "./repo.ts";
import * as Cloudflare from "alchemy/Cloudflare";
import { Email } from "@manotes/shared/schema/email";

export const NAMESPACE_KEY = "accounts-v1";

export type ResolvedAccount = {
  readonly accountId: string;
  readonly email: string;
};

export type WaitlistResult = {
  readonly status: "WAITLIST" | "ACTIVE";
};

export default class AccountsDurableObject extends Cloudflare.DurableObject<AccountsDurableObject>()(
  "AccountsDurableObject",
  // Resolve configuration in Alchemy's shared phase so it is available in the deployed worker.
  Effect.gen(function* () {
    const bootstrapEmail = yield* Config.schema(Email, "BOOTSTRAP_ACCOUNT_EMAIL").pipe(
      Config.option,
      Effect.orDie,
    );

    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      const layer = AccountsRepo.Service.layer.pipe(
        Layer.provideMerge(
          SqliteClient.layer({
            db: state.storage.sql.raw,
            spanAttributes: { durableObject: "AccountsDurableObject" },
          }),
        ),
      );

      yield* state.blockConcurrencyWhile(() => {
        return Effect.gen(function* () {
          yield* AccountsRepo.migrate;

          // One-way bootstrap: removing the setting does not deactivate an existing account.
          if (Option.isSome(bootstrapEmail)) {
            const repo = yield* AccountsRepo.Service;
            yield* repo.activateByEmail({ email: bootstrapEmail.value });
          }
        }).pipe(Effect.provide(layer), Effect.orDie);
      });

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
  const repo = yield* AccountsRepo.Service;
  const account = yield* repo.findOrCreate({ email, status: "ACTIVE" });

  if (account.status !== "ACTIVE") return yield* Effect.fail(new AccountNotActiveError({ email }));

  return account;
});

const checkOrWaitlist = Effect.fn("AccountsDurableObject.checkOrWaitlist")(function* (
  email: string,
) {
  const repo = yield* AccountsRepo.Service;

  return yield* repo.findOrCreate({ email, status: "WAITLIST" });
});

class AccountNotActiveError extends Data.TaggedError("Accounts.AccountNotActiveError")<{
  readonly email: string;
}> {}

export * as Accounts from "./durable-object.ts";
