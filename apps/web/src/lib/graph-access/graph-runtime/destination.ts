import { linkOptions as routerLinkOptions, useRouterState } from "@tanstack/solid-router";
import { Effect, Match, Option, Schema } from "effect";
import { NoteSearch } from "../../note/search";

export const Destination = Schema.TaggedUnion({
  notes: { ...NoteSearch.Schema.fields, hash: Schema.optional(Schema.String) },
  studio: { hash: Schema.optional(Schema.String) },
});
export type Destination = typeof Destination.Type;

export const UnlockSearch = Schema.Struct({
  returnTo: Schema.optional(Destination),
}).pipe(
  // A malformed returnTo must not block unlocking. On decode failure, Option.some({})
  // supplies an empty search object, so linkOptions falls back to the graph root.
  Schema.catchDecoding(() => Effect.succeed(Option.some({}))),
);

export function useCurrent() {
  return useRouterState({
    select: ({ matches, location }): Destination | undefined => {
      for (const match of matches.toReversed()) {
        const destination = Match.value(match).pipe(
          Match.when(
            { routeId: "/$graph/studio" },
            (): Destination => ({ _tag: "studio", hash: location.hash }),
          ),
          Match.when(
            { routeId: "/$graph/" },
            (match): Destination => ({
              _tag: "notes",
              panes: match.search.panes,
              hash: location.hash,
            }),
          ),
          Match.orElse(() => undefined),
        );
        if (destination) return destination;
      }
      return undefined;
    },
  });
}

export function linkOptions(graph: string, destination?: Destination) {
  if (!destination) {
    return routerLinkOptions({ to: "/$graph", params: { graph }, replace: true });
  }
  return Match.value(destination).pipe(
    Match.tag("notes", (destination) =>
      routerLinkOptions({
        to: "/$graph",
        params: { graph },
        search: { panes: destination.panes },
        hash: destination.hash,
        replace: true,
      }),
    ),
    Match.tag("studio", (destination) =>
      routerLinkOptions({
        to: "/$graph/studio",
        params: { graph },
        hash: destination.hash,
        replace: true,
      }),
    ),
    Match.exhaustive,
  );
}

export * as GraphDestination from "./destination";
