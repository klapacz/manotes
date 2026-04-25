import { Data, Effect, Layer, ManagedRuntime } from "effect";
import { Struct } from "effect";
import { DurableObject } from "cloudflare:workers";
import { SqliteClient } from "@effect/sql-sqlite-do";
import * as Repo from "./repo";

export const NAMESPACE_KEY = "accounts-v1";

export type ResolvedAccount = {
  readonly accountId: string;
  readonly email: string;
};

export type WaitlistResult = {
  readonly status: "WAITLIST" | "ACTIVE";
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

  checkOrWaitlist(email: string): Promise<WaitlistResult> {
    return this.ctx.blockConcurrencyWhile(() =>
      this.runtime.runPromise(checkOrWaitlist(email).pipe(Effect.map(Struct.pick(["status"])))),
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

const checkOrWaitlist = Effect.fn("AccountsDurableObject.checkOrWaitlist")(function* (
  email: string,
) {
  const repo = yield* Repo.Service;

  return yield* repo.findOrCreate({ email, status: "WAITLIST" });
});

class AccountNotActiveError extends Data.TaggedError("Accounts.AccountNotActiveError")<{
  readonly email: string;
}> {}
