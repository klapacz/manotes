import { linkOptions, redirect } from "@tanstack/solid-router";
import { Effect, Match, Types } from "effect";
import * as GraphAccessRuntime from "../runtime";
import { Service, State, type RuntimeContext } from "./manager";
import type { GraphDestination } from "./destination";

export const redirectLinkOptions = (
  state: Types.ExtractTag<State, "Locked" | "Missing">,
  returnTo?: GraphDestination.Destination,
) =>
  Match.value(state).pipe(
    Match.tagsExhaustive({
      Missing: () =>
        linkOptions({
          to: "/",
          replace: true,
        }),
      Locked: ({ record }) =>
        linkOptions({
          to: "/$graph/unlock",
          params: { graph: record.localGraphId },
          search: { returnTo },
          replace: true,
        }),
    }),
  );

export const getReadyOrRedirect = async (localGraphId: string) => {
  const state = await GraphAccessRuntime.rt.runPromise(
    Service.use((manager) => manager.find(localGraphId)),
  );

  if (State.$is("Ready")(state)) return state;

  throw redirect(redirectLinkOptions(state));
};

export const runPromiseOrRedirect = <A, E>(
  localGraphId: string,
  effect: Effect.Effect<A, E, RuntimeContext>,
) => getReadyOrRedirect(localGraphId).then((ready) => ready.runtime.runPromise(effect));

export const runPromiseExitOrRedirect = <A, E>(
  localGraphId: string,
  effect: Effect.Effect<A, E, RuntimeContext>,
) => getReadyOrRedirect(localGraphId).then((ready) => ready.runtime.runPromiseExit(effect));
