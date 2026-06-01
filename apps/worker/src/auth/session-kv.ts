import * as Cloudflare from "alchemy/Cloudflare";
import { Context, Data, Duration, Effect, Layer, Schema } from "effect";

const StoredSession = Schema.Struct({
  email: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString,
});
const StoredSessionJson = Schema.fromJsonString(StoredSession);
const encodeSession = Schema.encodeEffect(StoredSessionJson);
const decodeSession = Schema.decodeEffect(StoredSessionJson);

const SESSION_TTL = Duration.days(30);

export class SessionKvService extends Context.Service<SessionKvService>()("Auth.SessionKvService", {
  make: Effect.gen(function* () {
    const SESSION_KV = yield* Cloudflare.KVNamespace("SESSION_KV");
    const kv = yield* Cloudflare.KVNamespace.bind(SESSION_KV);

    const create = Effect.fn("AuthSessionKv.create")(function* (email: string, accountId: string) {
      const token = crypto.randomUUID();
      const encoded = yield* encodeSession({ email, accountId });
      yield* kv
        .put(token, encoded, {
          expirationTtl: Duration.toSeconds(SESSION_TTL),
        })
        .pipe(Effect.mapError((cause) => new SessionStoreError({ operation: "write", cause })));
      return token;
    });

    const resolve = Effect.fn("AuthSessionKv.resolve")(function* (token: string) {
      const raw = yield* kv
        .get(token)
        .pipe(Effect.mapError((cause) => new SessionStoreError({ operation: "read", cause })));
      if (raw === null) return yield* Effect.fail(new SessionNotFoundError());
      return yield* decodeSession(raw);
    });

    const destroy = Effect.fn("AuthSessionKv.destroy")(function* (token: string) {
      yield* kv
        .delete(token)
        .pipe(Effect.mapError((cause) => new SessionStoreError({ operation: "delete", cause })));
    });

    return { create, resolve, destroy, SESSION_TTL };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export class SessionStoreError extends Data.TaggedError("Auth.SessionStoreError")<{
  readonly operation: "write" | "read" | "delete";
  readonly cause: unknown;
}> {}

export class SessionNotFoundError extends Data.TaggedError("Auth.SessionNotFoundError")<{}> {}
