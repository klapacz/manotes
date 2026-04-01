import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpApiClient from "effect/unstable/httpapi/HttpApiClient";
import * as SessionApi from "@manotes/shared/session/api";
import * as GraphAccessRuntime from "./runtime";

const get = Effect.fn("GraphAccessSession.get")(function* () {
  const client = yield* HttpApiClient.make(SessionApi.SessionApi).pipe(
    Effect.provide(FetchHttpClient.layer),
  );

  return yield* client.getSession();
});

export const atom = GraphAccessRuntime.atom.atom(get);

export type Session = SessionApi.Session;
