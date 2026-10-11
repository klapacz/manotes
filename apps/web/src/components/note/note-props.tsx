import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { Array, Effect, Match, Predicate, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import { Command, CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";

export function query(opts: {
  readonly recordId: AttrsSchema.NoteId;
  readonly doc: Y.Doc | undefined;
}) {
  return (request: QueryEngine.Request) => {
    if (!opts.doc) return Stream.succeed([]);
    const doc = opts.doc;

    return Stream.unwrap(
      Effect.gen(function* () {
        const repo = yield* PropRecordRepo.Service;
        const attrs = yield* Attrs.Service;
        const defs = yield* repo.reactiveDefs();

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
            const repo = yield* PropRecordRepo.Service;
            const attrs = yield* Attrs.Service;
            const defs = yield* repo.reactiveDefs();

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

  const change = async (value: boolean | undefined) => {
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
              <Command shouldFilter={false}>
                <CommandList>
                  <p class="px-3 py-2 text-sm text-fg-subtle">Property is unavailable.</p>
                  <Picker.Footer>
                    <Picker.Back onSelect={props.onBack} />
                  </Picker.Footer>
                </CommandList>
              </Command>
            }
          >
            {(entry) => {
              const selected = () => {
                const state = entry().value;

                return Match.value(state).pipe(
                  Match.tag("Valid", ({ value }) => String(value.val)),
                  Match.orElse(() => ""),
                );
              };

              return (
                <Picker.Query
                  label={entry().def.title || "Untitled"}
                  query={boolQuery({ defaultValue: entry().def.prop_default?.val })}
                  selected={selected()}
                  disabled={mutation().waiting || Predicate.isTagged(entry().value, "Invalid")}
                  onSelect={(choice) => void change(choice.bool)}
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
                </Picker.Query>
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
      readonly value: boolean | undefined;
    }) {
      const attrs = yield* Attrs.Service;

      if (opts.value === undefined) {
        return yield* attrs.clearProp({ doc: opts.doc, propId: opts.propId });
      }

      yield* attrs.setProp({
        doc: opts.doc,
        recordId: opts.recordId,
        propId: opts.propId,
        value: AttrsSchema.PropVal.cases.bool.make({ val: opts.value }),
      });
    }),
  ),
);

function boolQuery(opts: { defaultValue: boolean | undefined }) {
  return MenuQuery.choices(() =>
    [
      { value: "true", label: "True", bool: true },
      { value: "false", label: "False", bool: false },
    ].map((choice) => ({
      ...choice,
      detail: choice.bool === opts.defaultValue ? () => "Default" : undefined,
    })),
  );
}

function valueLabel(value: Attrs.Entry<"bool">["value"]): string | undefined {
  return Match.value(value).pipe(
    Match.tag("Unset", () => undefined),
    Match.tag("Valid", ({ value }) => (value.val ? "True" : "False")),
    Match.tag("Invalid", () => "Invalid value"),
    Match.exhaustive,
  );
}

export * as NoteProps from "./note-props";
