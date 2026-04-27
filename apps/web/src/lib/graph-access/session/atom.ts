import { Option, Cause, Result, identity } from "effect";
import { Atom, AtomHttpApi } from "effect/unstable/reactivity";
import * as SessionApi from "@manotes/shared/session/api";
import { AsyncResult } from "effect/unstable/reactivity";
import { FetchHttpClient } from "effect/unstable/http";

const SessionHttp = AtomHttpApi.Service()("GraphAccess.Session.HttpApi", {
  api: SessionApi.SessionApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "",
});

export const get = SessionHttp.query("session", "getSession", {
  timeToLive: "1 hour",
});

export const checkWaitlist = SessionHttp.mutation("session", "checkWaitlist");
export const requestOtp = SessionHttp.mutation("session", "requestOtp");
export const verifyOtp = SessionHttp.mutation("session", "verifyOtp");
export const logout = SessionHttp.mutation("session", "logout");

export const find = Atom.map(get, (result) => {
  return result.pipe(
    AsyncResult.map(Option.some),
    AsyncResult.match({
      onSuccess: identity,
      onInitial: identity,
      onFailure: (failure) => {
        const result = Cause.findError(failure.cause);
        if (Result.isFailure(result) || result.success._tag !== "Unauthorized") return failure;
        return AsyncResult.success(Option.none());
      },
    }),
  );
});
