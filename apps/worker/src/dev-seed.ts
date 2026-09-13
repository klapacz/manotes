import { DevEnv } from "@manotes/shared/dev-env";
import * as Alchemy from "alchemy";
import { Config, Effect, Layer, Option, Redacted, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import AccountsDurableObject, { NAMESPACE_KEY } from "./accounts/durable-object.ts";
import { SessionKvService } from "./auth/session-kv.ts";

export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const DEV = yield* Alchemy.ALCHEMY_DEV;

    if (!DEV) return Layer.empty;

    const secret = yield* Config.redacted(DevEnv.names.seedSecret).pipe(Config.option);

    if (Option.isNone(secret) || Redacted.value(secret.value).length === 0) return Layer.empty;

    const accounts = yield* AccountsDurableObject;
    const sessions = yield* SessionKvService;

    return HttpRouter.add(
      "POST",
      "/api/dev/seed-session",
      Effect.fn("DevSeed.createSession")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        if (request.headers["x-manotes-dev-seed-secret"] !== Redacted.value(secret.value)) {
          return HttpServerResponse.empty({ status: 403 });
        }

        const input = yield* HttpServerRequest.schemaBodyJson(Request).pipe(Effect.option);

        if (Option.isNone(input)) return HttpServerResponse.empty({ status: 400 });

        const email = `demo-${input.value.seedId.toLowerCase()}@dev.manotes.local`;
        const account = yield* accounts.getByName(NAMESPACE_KEY).ensureAccount(email);
        const sessionToken = yield* sessions.create(account.email, account.accountId);

        return HttpServerResponse.jsonUnsafe(
          {
            email: account.email,
            accountId: account.accountId,
            sessionToken,
          },
          { headers: { "cache-control": "no-store" } },
        );
      })().pipe(
        // Do not expose provisioning failures or credentials in responses or logs.
        Effect.catchCause(() => Effect.succeed(HttpServerResponse.empty({ status: 500 }))),
      ),
    );
  }),
);

const Request = Schema.Struct({ seedId: Schema.String.check(Schema.isUUID(4)) });

export * as DevSeed from "./dev-seed.ts";
