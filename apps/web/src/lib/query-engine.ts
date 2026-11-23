import { Effect, Scope, Stream } from "effect";

export type Request = { text: string };

export type Match<T> = { value: T; score: number };

export type Query<T, E = never, R = never> = (
  request: Request,
) => Stream.Stream<readonly Match<T>[], E, R | Scope.Scope>;

export function map<A, B, E, R>(query: Query<A, E, R>, transform: (value: A) => B): Query<B, E, R> {
  return (request) => {
    return query(request).pipe(
      Stream.map((matches) => {
        return matches.map((match) => ({ ...match, value: transform(match.value) }));
      }),
    );
  };
}

export function combine<T, E, R>(queries: readonly Query<T, E, R>[]): Query<T, E, R> {
  return (request) => {
    if (!queries.length) return Stream.succeed([]);

    return Stream.zipLatestAll(...queries.map((query) => query(request))).pipe(Stream.map(rank));
  };
}

export function share<T, E, R>(query: Query<T, E, R>): Query<T, E, R> {
  const requests = new WeakMap<
    Request,
    Effect.Effect<Stream.Stream<readonly Match<T>[], E>, never, R | Scope.Scope>
  >();

  const shared = Effect.fn("QueryEngine.share")(function* (request: Request) {
    const previous = requests.get(request);

    if (previous) return yield* previous;

    const cached = yield* Effect.cached(Stream.share(query(request), { capacity: 1, replay: 1 }));
    requests.set(request, cached);

    return yield* cached;
  });

  // The enclosing search owns the scope, so one child's exit cannot close sibling subscriptions.
  return (request) => Stream.fromEffect(shared(request)).pipe(Stream.flatten);
}

export function score(opts: { text: string; label: string; keywords?: readonly string[] }): number {
  const query = opts.text.trim().toLowerCase();

  if (!query) return 1;

  const labels = [opts.label, ...(opts.keywords ?? [])].map((label) => label.toLowerCase());

  // Score match quality in descending tiers: exact > prefix > word-prefix > substring.
  if (labels.some((label) => label === query)) return 1;

  if (labels.some((label) => label.startsWith(query))) return 0.9;

  // Prefer matches at the start of any word (e.g. "from" in "Links from") over mid-word hits.
  if (labels.some((label) => startsWord(label, query))) return 0.8;

  return labels.some((label) => label.includes(query)) ? 0.7 : 0;
}

export * as QueryEngine from "./query-engine";

function startsWord(label: string, query: string): boolean {
  return label.split(/\s+/).some((word) => word.startsWith(query));
}

function rank<T>(groups: readonly (readonly Match<T>[])[]): readonly Match<T>[] {
  const matches: Match<T>[] = [];
  const length = Math.max(0, ...groups.map((group) => group.length));

  // Interleave ties so one child cannot fill the entire visible list.
  for (let index = 0; index < length; index++) {
    for (const group of groups) {
      const match = group[index];

      if (match) matches.push(match);
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}
