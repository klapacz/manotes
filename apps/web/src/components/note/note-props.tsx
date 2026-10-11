import { useAtom } from "@effect/atom-solid";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { Array, Effect, Match, Predicate, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { QueryEngine } from "../../lib/query-engine";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";

export function query(opts: {
  readonly recordId: AttrsSchema.NoteId;
  readonly doc: Y.Doc | undefined;
}) {
  return (request: QueryEngine.Request) => {
    if (!opts.doc) return Stream.succeed([]);
    const doc = opts.doc;

    return Stream.unwrap(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const defs = yield* PropRecordRepo.Service.use((repo) => repo.reactiveDefs());

        return attrs.watchProps({ doc, defs }).pipe(
          Stream.map((entries) => Array.filterMap(entries, boolEntry)),
          Stream.map((entries) =>
            entries.flatMap(({ def, value }) => {
              if (def.id === opts.recordId) return [];
              const label = def.title || "Untitled";
              const score = QueryEngine.score({ text: request.text, label });

              if (!score) return [];

              return [
                {
                  // Browse actions first; searches rank property names normally.
                  score: request.text.trim() ? score : 0.5,
                  value: {
                    value: def.id,
                    propId: def.id,
                    label,
                    group: "properties",
                    builtin: def.builtin,
                    detail: () => valueLabel(value),
                  },
                },
              ];
            }),
          ),
        );
      }),
    );
  };
}

const boolEntry = Match.type<Attrs.Entry>().pipe(
  Match.when({ def: { prop_type: "bool" } }, (entry) => entry),
  Match.result,
);

export function Menu(props: {
  noteId: AttrsSchema.NoteId;
  doc: Y.Doc;
  propId: AttrsSchema.NoteId;
  onBack: () => void;
}) {
  const input = createSyncedAtom(() => ({ doc: props.doc, propId: props.propId }));

  const state = createAtomResultStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const { doc, propId } = get(input);

        return Stream.unwrap(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;
            const defs = yield* PropRecordRepo.Service.use((repo) => repo.reactiveDefs());

            return attrs
              .watchProps({
                doc,
                defs: defs.pipe(Stream.map((rows) => rows.filter((row) => row.id === propId))),
              })
              .pipe(Stream.map((entries) => Array.filterMap(entries, boolEntry)[0]));
          }),
        );
      }),
    ),
  );

  const [mutation, edit] = useAtom(Edit, { mode: "promise" });

  const change = async (value: AttrsSchema.PropVal | undefined) => {
    try {
      await edit({ doc: props.doc, recordId: props.noteId, propId: props.propId, value });
    } catch {}
  };

  return (
    <MatchTag
      when={state}
      cases={{
        Loading: () => <p class="px-3 py-2 text-sm text-fg-subtle">Loading property…</p>,
        Error: () => <p class="px-3 py-2 text-sm text-error-fg">Unable to load property.</p>,
        Success: (state) => (
          <Show
            when={state().value}
            fallback={
              <PropPicker.Unavailable>
                <Picker.Footer>
                  <Picker.Back onSelect={props.onBack} />
                </Picker.Footer>
              </PropPicker.Unavailable>
            }
          >
            {(entry) => {
              const value = () => {
                const state = entry().value;

                return Match.value(state).pipe(
                  Match.tag("Valid", ({ value }) => value),
                  Match.orElse(() => undefined),
                );
              };

              return (
                <PropPicker.Bool
                  def={entry().def}
                  value={value()}
                  disabled={mutation().waiting || Predicate.isTagged(entry().value, "Invalid")}
                  onChange={(value) => void change(value)}
                >
                  {(items) => (
                    <CommandList>
                      <CommandScroll>{items}</CommandScroll>
                      <MatchTag
                        when={entry().value}
                        cases={{
                          Invalid: (state) => (
                            <p class="px-3 py-2 text-sm text-error-fg">
                              Invalid value
                              <Show when={state().value}>
                                {(value) => <>: {JSON.stringify(value())}</>}
                              </Show>
                            </p>
                          ),
                        }}
                      />
                      <Show when={AsyncResult.isFailure(mutation())}>
                        <p role="alert" class="px-3 py-2 text-sm text-error-fg">
                          Unable to update property.
                        </p>
                      </Show>
                      <Picker.Footer>
                        <Picker.Back onSelect={props.onBack} />
                        <Picker.Clear
                          disabled={
                            Predicate.isTagged(entry().value, "Unset") || mutation().waiting
                          }
                          onSelect={() => void change(undefined)}
                        />
                      </Picker.Footer>
                    </CommandList>
                  )}
                </PropPicker.Bool>
              );
            }}
          </Show>
        ),
      }}
    />
  );
}

const Edit = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNoteNoteProps.edit")(function* (opts: {
      readonly doc: Y.Doc;
      readonly recordId: AttrsSchema.NoteId;
      readonly propId: AttrsSchema.NoteId;
      readonly value: AttrsSchema.PropVal | undefined;
    }) {
      const attrs = yield* Attrs.Service;

      if (opts.value === undefined) {
        return yield* attrs.clearProp({ doc: opts.doc, propId: opts.propId });
      }

      yield* attrs.setProp({
        doc: opts.doc,
        recordId: opts.recordId,
        propId: opts.propId,
        value: opts.value,
      });
    }),
  ),
);

function valueLabel(value: Attrs.Entry<"bool">["value"]): string | undefined {
  return Match.value(value).pipe(
    Match.tag("Unset", () => undefined),
    Match.tag("Valid", ({ value }) => PropQuery.valueLabel(value)),
    Match.tag("Invalid", () => "Invalid value"),
    Match.exhaustive,
  );
}

export * as NoteProps from "./note-props";
