import { Match, Option, Predicate, Stream } from "effect";
import { AttrsSchema } from "./attrs.schema";
import { Attrs } from "./attrs.service";
import { NoteRepo } from "./note.repo";
import { StreamFilter } from "./note/stream-filter";

export function watch<V extends AttrsSchema.PropVal>(opts: {
  readonly state: Attrs.ValueState<V, AttrsSchema.PropVal>;
  readonly targets: AttrsSchema.TargetFilter | undefined;
}): Stream.Stream<Attrs.ValueState<V, AttrsSchema.PropVal>, unknown, NoteRepo.Service> {
  const state = opts.state;

  if (!Predicate.isTagged(state, "Valid") || !AttrsSchema.PropVal.guards.link(state.value)) {
    return Stream.succeed(state);
  }

  const value = state.value;

  return NoteRepo.Service.use((repo) =>
    repo.reactiveFindPreviewById({
      id: value.val,
      filter: StreamFilter.fromAttrs(opts.targets),
    }),
  ).pipe(
    Stream.unwrap,
    // Keep the assignment unchanged; only its displayed validity follows the scope.
    Stream.map((note) => (Option.isSome(note) ? state : Attrs.ValueState.Invalid({ value }))),
  );
}

export function watchEntries(opts: {
  readonly entries: readonly Attrs.Entry[];
}): Stream.Stream<readonly Attrs.Entry[], unknown, NoteRepo.Service> {
  if (opts.entries.length === 0) return Stream.succeed([]);

  return Stream.zipLatestAll(
    ...opts.entries.map((entry) =>
      Match.value(entry).pipe(
        Match.when({ def: { prop_type: "link" } }, ({ def, value }) =>
          watch({ state: value, targets: def.prop_targets ?? undefined }).pipe(
            Stream.map((value) => ({ def, value }) satisfies Attrs.Entry<"link">),
          ),
        ),
        Match.orElse((entry) => Stream.succeed(entry)),
      ),
    ),
  );
}

export * as PropValidation from "./prop-validation";
