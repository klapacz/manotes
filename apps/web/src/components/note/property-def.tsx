import { useAtom } from "@effect/atom-solid";
import { getRouteApi } from "@tanstack/solid-router";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { Data, Effect, Match, Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt } from "../../lib";
import { CommandList, CommandScroll } from "../ui/command";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { PropQuery } from "./prop-query";
import { PropPicker } from "./prop-picker";
import { Focus } from "./focus";
import { MenuQuery } from "../../lib/menu-query";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneMake } from "@manotes/shared/note/pane.make";
import { PaneScroll } from "../../lib/note/pane.scroll";
import { NoteLink } from "../../lib/note/link-component";
import { Button } from "../ui/button";
import { ArrowUpRightIcon } from "../icons";
import { PropScope } from "./prop-scope";
import { EnumOptions } from "./enum-options";

const route = getRouteApi("/$graph/");

const typeLabels = {
  text: "Text",
  number: "Number",
  bool: "Boolean",
  enum: "Enum",
  link: "Reference",
} satisfies Record<AttrsSchema.PropValTag, string>;

type Change = Data.TaggedEnum<{
  Type: { type: PropQuery.EditableType };
  Default: { value: Option.Option<AttrsSchema.PropVal> };
}>;

const Change = Data.taggedEnum<Change>();

const typeChoices = PropQuery.editableTypes.map((value) => ({ value, label: typeLabels[value] }));

export function Root(props: {
  recordId: AttrsSchema.NoteId;
  doc: Y.Doc;
  attrs: {
    prop_type: AttrsSchema.PropValTag;
    prop_default: AttrsSchema.PropVal | undefined;
    prop_targets: AttrsSchema.TargetFilter | undefined;
  };
}) {
  const focus = Focus.useNode();
  const ctx = PaneCtx.use();
  const scroll = PaneScroll.use();
  const navigate = route.useNavigate();
  const [mutation, edit] = useAtom(Edit, { mode: "promise" });

  const change = async (change: Change) => {
    try {
      await edit({ doc: props.doc, change });
    } catch {}
  };

  const editableType = () => PropQuery.editableTypes.find((type) => type === props.attrs.prop_type);

  const defaultState = () =>
    PropQuery.valueState({
      type: props.attrs.prop_type,
      value: Option.fromNullishOr(props.attrs.prop_default),
    });

  const defaultLink = () =>
    Match.value(defaultState()).pipe(
      Match.when(
        { _tag: "Valid", value: { _tag: Match.is("link", "enum") } },
        ({ value }) => value.val,
      ),
      Match.orElse(() => undefined),
    );

  const openNote = (id: AttrsSchema.NoteId) => {
    const input = PaneMake.note(id);

    if (scroll.scrollToPane(input).found) return;

    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
  };

  const openOptions = () => {
    const input = PaneMake.enumOptions({ enum_parent: props.recordId });

    if (scroll.scrollToPane(input).found) return;

    void navigate(PaneCtx.linkOptions(ctx, PaneCursor.openNext(input)));
  };

  return (
    <div class="px-4 pb-4">
      <div
        class="rounded-lg bg-bg-subtle px-2 py-2 text-sm transition-colors"
        classList={{ "bg-control": focus.highlightWithin() }}
      >
        <div class="flex items-center gap-2 px-2 pb-2">
          <span>PROPERTY</span>
        </div>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Value kind</DescriptionList.Term>
            <DescriptionList.Details>
              <Picker.Root label="Value kind">
                <Picker.Trigger
                  variant="ghost"
                  rounded="default"
                  class="h-7 border-0 px-2 text-sm"
                  disabled={mutation().waiting}
                >
                  {typeLabels[props.attrs.prop_type]}
                </Picker.Trigger>
                <Picker.Content>
                  {(close) => (
                    <Picker.Query<(typeof typeChoices)[number]>
                      label="Value kind"
                      query={MenuQuery.choices(() => typeChoices)}
                      selected={props.attrs.prop_type}
                      onSelect={(choice) => {
                        void change(Change.Type({ type: choice.value }));
                        close();
                      }}
                    />
                  )}
                </Picker.Content>
              </Picker.Root>
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>Default</DescriptionList.Term>
            <DescriptionList.Details>
              <Picker.Root label="Default value">
                <Picker.Trigger
                  variant="ghost"
                  rounded="default"
                  aria-invalid={Attrs.ValueState.$is("Invalid")(defaultState())}
                  class="h-7 border-0 px-2 text-sm aria-[invalid=true]:bg-error-control aria-[invalid=true]:text-error-fg aria-[invalid=true]:hover:bg-error-control-hover"
                  disabled={!editableType() || mutation().waiting}
                >
                  <PropPicker.StateLabel state={defaultState()} />
                </Picker.Trigger>
                <Picker.Content>
                  {(close) => (
                    <Show when={editableType()}>
                      {(type) => (
                        <PropPicker.Value
                          propId={props.recordId}
                          label="Default value"
                          type={type()}
                          targets={
                            props.attrs.prop_type === "link" ? props.attrs.prop_targets : undefined
                          }
                          defaultValue={Option.none()}
                          state={defaultState()}
                          disabled={mutation().waiting}
                          onChange={(value) => {
                            void change(Change.Default({ value: Option.some(value) }));
                            close();
                          }}
                          onOpenNote={(id) => close(() => openNote(id))}
                        >
                          {(items) => (
                            <CommandList>
                              <CommandScroll>{items}</CommandScroll>
                              <PropPicker.Invalid state={defaultState()} />
                              <Picker.Footer>
                                <Picker.Clear
                                  disabled={!props.attrs.prop_default || mutation().waiting}
                                  onSelect={() => {
                                    void change(Change.Default({ value: Option.none() }));
                                    close();
                                  }}
                                />
                              </Picker.Footer>
                            </CommandList>
                          )}
                        </PropPicker.Value>
                      )}
                    </Show>
                  )}
                </Picker.Content>
              </Picker.Root>
              <Show when={defaultLink()}>
                {(id) => (
                  <Button
                    as={NoteLink}
                    id={id()}
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Open default reference"
                  >
                    <ArrowUpRightIcon />
                  </Button>
                )}
              </Show>
            </DescriptionList.Details>
          </DescriptionList.Row>
          <Show when={props.attrs.prop_type === "link"}>
            <DescriptionList.Row>
              <DescriptionList.Term>Scope</DescriptionList.Term>
              <DescriptionList.Details>
                <PropScope.Link propId={props.recordId} targets={props.attrs.prop_targets} />
              </DescriptionList.Details>
            </DescriptionList.Row>
          </Show>
          <Show when={props.attrs.prop_type === "enum"}>
            <DescriptionList.Row>
              <DescriptionList.Term>Options</DescriptionList.Term>
              <DescriptionList.Details>
                <EnumOptions.Link propId={props.recordId} onOpen={openOptions} />
              </DescriptionList.Details>
            </DescriptionList.Row>
          </Show>
        </DescriptionList.Root>
        <Show when={AsyncResult.isFailure(mutation())}>
          <p role="alert" class="px-2 pt-2 text-error-fg">
            Unable to update property.
          </p>
        </Show>
      </div>
    </div>
  );
}

const Edit = bindRt((rt) =>
  rt.fn(
    Effect.fn("ComponentsNotePropertyDef.edit")(function* (opts: {
      readonly doc: Y.Doc;
      readonly change: Change;
    }) {
      const attrs = yield* Attrs.Service;

      yield* Match.value(opts.change).pipe(
        Match.tag("Type", ({ type }) => attrs.setPropType({ doc: opts.doc, type })),
        Match.tag("Default", ({ value }) =>
          value.pipe(
            Option.match({
              onNone: () => attrs.clearPropDefault({ doc: opts.doc }),
              onSome: (value) => attrs.setPropDefault({ doc: opts.doc, value }),
            }),
          ),
        ),
        Match.exhaustive,
      );
    }),
  ),
);

export * as PropertyDef from "./property-def";
