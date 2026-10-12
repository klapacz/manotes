import { useAtom } from "@effect/atom-solid";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropDef } from "@manotes/shared/prop-def.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import type { NoteRepo } from "@manotes/shared/note.repo";
import type { EnumOptionRepo } from "@manotes/shared/enum-option.repo";
import { Array, Data, Effect, Match, Option, Predicate, Stream } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt, createAtomResultStore, createSyncedAtom, MatchTag } from "../../lib";
import { QueryEngine } from "../../lib/query-engine";
import { MenuQuery } from "../../lib/menu-query";
import { CommandList, CommandScroll } from "../ui/command";
import { Picker } from "../ui/picker";
import { PropPicker } from "./prop-picker";
import { PropQuery } from "./prop-query";

export type Action = Data.TaggedEnum<{
  OpenProperty: { propId: AttrsSchema.NoteId };
  SetProperty: { propId: AttrsSchema.NoteId; propVal: AttrsSchema.PropVal };
}>;

export const Action = Data.taggedEnum<Action>();

export type Choice = Picker.Choice & Action & { builtin: boolean };

export function query(opts: {
  readonly recordId: AttrsSchema.NoteId;
  readonly doc: Y.Doc | undefined;
}): QueryEngine.Query<
  Choice,
  unknown,
  Attrs.Service | PropDef.Service | NoteRepo.Service | EnumOptionRepo.Service
> {
  return (request: QueryEngine.Request) => {
    if (!opts.doc) return Stream.succeed([]);
    const doc = opts.doc;

    return Stream.unwrap(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const defs = yield* PropDef.Service.use((repo) => repo.reactiveDefs());

        return attrs.watchProps({ doc, defs }).pipe(
          Stream.switchMap((entries) => {
            const editable = Array.filterMap(entries, editableEntry).filter(
              ({ def }) => def.id !== opts.recordId,
            );

            const properties = MenuQuery.choices<Choice>(() =>
              editable.map(({ def, value }) => ({
                ...Action.OpenProperty({ propId: def.id }),
                value: def.id,
                label: def.title || "Untitled",
                group: "properties",
                builtin: BuiltinAttrs.isBuiltin(def.id),
                suffix: <Picker.Caret />,
                detail: () =>
                  Match.value(value).pipe(
                    Match.tag("Unset", () => undefined),
                    Match.orElse((state) => <PropPicker.StateLabel state={state} />),
                  ),
              })),
            );

            const values = editable.flatMap(({ def, value }) => {
              // Invalid fields must be cleared through their submenu before accepting a value.
              if (Attrs.ValueState.$is("Invalid")(value)) return [];

              return [
                MenuQuery.nested({
                  label: def.title || "Untitled",
                  query: QueryEngine.map(
                    PropQuery.values({
                      propId: def.id,
                      type: def.prop_type,
                      defaultValue: Option.fromNullishOr(def.prop_default),
                    }),
                    (choice): Choice => ({
                      ...choice,
                      ...Action.SetProperty({ propId: def.id, propVal: choice.propVal }),
                      value: `prop:${def.id}:${choice.value}`,
                      group: "properties",
                      builtin: BuiltinAttrs.isBuiltin(def.id),
                    }),
                  ),
                }),
              ];
            });

            return QueryEngine.combine([properties, ...values])(request).pipe(
              // Browse actions first; searches rank property names and values normally.
              Stream.map((matches) => {
                if (request.text.trim()) return matches;

                return matches.map((match) => ({ ...match, score: 0.5 }));
              }),
            );
          }),
        );
      }),
    );
  };
}

const editableEntry = Match.type<Attrs.Entry>().pipe(
  Match.when({ def: { prop_type: Match.is(...PropQuery.editableTypes) } }, (entry) => entry),
  Match.result,
);

export function Menu(props: {
  noteId: AttrsSchema.NoteId;
  doc: Y.Doc;
  propId: AttrsSchema.NoteId;
  onBack: () => void;
  onOpenNote: (id: AttrsSchema.NoteId) => void;
}) {
  const input = createSyncedAtom(() => ({ doc: props.doc, propId: props.propId }));

  const state = createAtomResultStore(
    bindRt((rt) =>
      rt.atom((get) => {
        const { doc, propId } = get(input);

        return Stream.unwrap(
          Effect.gen(function* () {
            const attrs = yield* Attrs.Service;
            const defs = yield* PropDef.Service.use((repo) => repo.reactiveDefs());

            return attrs
              .watchProps({
                doc,
                defs: defs.pipe(Stream.map((rows) => rows.filter((row) => row.id === propId))),
              })
              .pipe(Stream.map((entries) => Array.filterMap(entries, editableEntry)[0]));
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
            {(entry) => (
              <PropPicker.Value
                propId={entry().def.id}
                label={entry().def.title || "Untitled"}
                type={entry().def.prop_type}
                defaultValue={Option.fromNullishOr(entry().def.prop_default)}
                state={entry().value}
                disabled={mutation().waiting}
                onChange={(value) => void change(value)}
                onOpenNote={props.onOpenNote}
              >
                {(items) => (
                  <CommandList>
                    <CommandScroll>{items}</CommandScroll>
                    <PropPicker.Invalid state={entry().value} />
                    <Show when={AsyncResult.isFailure(mutation())}>
                      <p role="alert" class="px-3 py-2 text-sm text-error-fg">
                        Unable to update property.
                      </p>
                    </Show>
                    <Picker.Footer>
                      <Picker.Back onSelect={props.onBack} />
                      <Picker.Clear
                        disabled={Predicate.isTagged(entry().value, "Unset") || mutation().waiting}
                        onSelect={() => void change(undefined)}
                      />
                    </Picker.Footer>
                  </CommandList>
                )}
              </PropPicker.Value>
            )}
          </Show>
        ),
      }}
    />
  );
}

export const Edit = bindRt((rt) =>
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

export * as NoteProps from "./note-props";
