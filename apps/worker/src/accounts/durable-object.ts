import { Data, Effect, Layer, ManagedRuntime } from "effect";
import { Struct } from "effect";
import { DurableObject } from "cloudflare:workers";
import { SqliteClient } from "@effect/sql-sqlite-do";
import * as Repo from "./repo";

export type ResolvedAccount = {
  readonly accountId: string;
  readonly email: string;
};

export class AccountsDurableObject extends DurableObject<Env> {
  private readonly runtime = ManagedRuntime.make(
    Repo.Service.layer.pipe(
      Layer.provideMerge(
        SqliteClient.layer({
          db: this.ctx.storage.sql,
          spanAttributes: { durableObject: "AccountsDurableObject" },
        }),
      ),
    ),
  );

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => this.runtime.runPromise(Repo.migrate));
  }

  ensureAccount(email: string): Promise<ResolvedAccount> {
    return this.ctx.blockConcurrencyWhile(() =>
      this.runtime.runPromise(
        ensureAccount(email).pipe(
          Effect.map(
            // Durable Objects should return plain structured-clone-safe values. The repo entity
            // includes decoded DateTime fields, so for now we narrow the transport shape here.
            // We'll replace this with a proper RPC boundary later.
            Struct.pick(["email", "accountId"]),
          ),
        ),
      ),
    );
  }
}

const ensureAccount = Effect.fn("AccountsDurableObject.ensureAccount")(function* (email: string) {
  const repo = yield* Repo.Service;
  const account = yield* repo.findOrCreate({ email, status: "ACTIVE" });

  if (account.status !== "ACTIVE") {
    return yield* Effect.fail(new AccountNotActiveError({ email }));
  }

  return account;
});

class AccountNotActiveError extends Data.TaggedError("Accounts.AccountNotActiveError")<{
  readonly email: string;
}> {}
