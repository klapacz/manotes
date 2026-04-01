import * as Effect from "effect/Effect";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";

export const get = Effect.fn("HttpWebRequest.get")(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;

  if (request.source instanceof Request) return request.source;

  return yield* Effect.die(new Error("Expected web Request"));
});
