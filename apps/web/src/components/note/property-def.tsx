import { useAtom } from "@effect/atom-solid";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { Effect, Predicate } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Show } from "solid-js";
import type * as Y from "yjs";
import { bindRt } from "../../lib";
import { Button } from "../ui/button";
import { DescriptionList } from "../ui/description-list";
import { Picker } from "../ui/picker";
import { PropQuery } from "./prop-query";
import { PropPicker } from "./prop-picker";
import { Focus } from "./focus";

const typeLabels = {
  text: "Text",
  number: "Number",
  bool: "Boolean",
  enum: "Enum",
  link: "Reference",
} satisfies Record<AttrsSchema.PropValTag, string>;

export function Root(props: {
  doc: Y.Doc;
  attrs: {
    builtin: boolean;
    prop_type: AttrsSchema.PropValTag;
    prop_default: AttrsSchema.PropVal | undefined;
  };
}) {
  const focus = Focus.useNode();
  const [mutation, edit] = useAtom(Edit, { mode: "promise" });

  const change = async (value: AttrsSchema.PropVal) => {
    try {
      await edit({ doc: props.doc, value });
    } catch {}
  };

  const defaultLabel = () => {
    const value = props.attrs.prop_default;

    if (!value) {
      return "Choose";
    }

    if (value._tag !== props.attrs.prop_type) {
      return "Invalid value";
    }

    return PropQuery.valueLabel(value);
  };

  return (
    <div class="px-4 pb-4">
      <div
        class="rounded-lg bg-bg-subtle px-2 py-2 text-sm transition-colors"
        classList={{ "bg-control": focus.highlightWithin() }}
      >
        <div class="flex items-center gap-2 px-2 pb-2">
          <span>PROPERTY</span>
          <PropPicker.BuiltinBadge builtin={props.attrs.builtin} />
        </div>
        <DescriptionList.Root>
          <DescriptionList.Row>
            <DescriptionList.Term>Value kind</DescriptionList.Term>
            <DescriptionList.Details>
              <Button variant="ghost" size="chip" class="h-7 px-2 text-sm font-normal" disabled>
                {typeLabels[props.attrs.prop_type]}
              </Button>
            </DescriptionList.Details>
          </DescriptionList.Row>
          <DescriptionList.Row>
            <DescriptionList.Term>Default</DescriptionList.Term>
            <DescriptionList.Details>
              <Picker.Root label="Default value">
                <Picker.Trigger
                  variant="ghost"
                  rounded="default"
                  class="h-7 border-0 px-2 text-sm"
                  disabled={
                    props.attrs.builtin || props.attrs.prop_type !== "bool" || mutation().waiting
                  }
                >
                  {defaultLabel()}
                </Picker.Trigger>
                <Picker.Content>
                  {(close) => (
                    <Picker.Query
                      label="Default value"
                      query={PropQuery.boolQuery({ defaultValue: undefined })}
                      selected={
                        Predicate.isTagged(props.attrs.prop_default, "bool")
                          ? String(props.attrs.prop_default.val)
                          : undefined
                      }
                      onSelect={(choice) => {
                        void change(choice.propVal);
                        close();
                      }}
                    />
                  )}
                </Picker.Content>
              </Picker.Root>
            </DescriptionList.Details>
          </DescriptionList.Row>
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
      readonly value: AttrsSchema.PropVal;
    }) {
      const attrs = yield* Attrs.Service;
      yield* attrs.setPropDefault(opts);
    }),
  ),
);

export * as PropertyDef from "./property-def";
