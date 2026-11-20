import { createRenderEffect, createSignal, omit, type Component } from "solid-js";
import { dynamic, type JSX } from "@solidjs/web";
import { useEditorContext } from "./editor";

import type {
  AutocompleteRootProps,
  AutocompletePositionerProps,
  AutocompleteItemProps,
} from "prosekit/web/autocomplete";
import type { InlinePopoverRootProps } from "prosekit/web/inline-popover";
import type { TableHandleColumnMenuRootProps } from "prosekit/web/table-handle";

type WebEvents = {
  onOpenChange?: (event: CustomEvent<boolean>) => void;
  onQueryChange?: (event: CustomEvent<string>) => void;
  onValueChange?: (event: CustomEvent<string>) => void;
  onValuesChange?: (event: CustomEvent<string[]>) => void;
  onSelect?: (event: Event) => void;
};

export type WebProps = JSX.HTMLAttributes<HTMLElement> &
  Partial<
    AutocompleteRootProps &
      AutocompletePositionerProps &
      AutocompleteItemProps &
      InlinePopoverRootProps &
      TableHandleColumnMenuRootProps
  > &
  WebEvents & {
    eventTarget?: HTMLElement;
    closeOnSelect?: boolean;
    ref?: (element: HTMLElement) => void;
  };

const eventKeys = {
  openChange: "onOpenChange",
  queryChange: "onQueryChange",
  valueChange: "onValueChange",
  valuesChange: "onValuesChange",
  select: "onSelect",
} as const;

// The property/event lists come from the published generated wrappers, not DOM attributes.
export function webComponent(
  tag: string,
  register: () => void,
  properties: (keyof WebProps)[],
  events: (keyof typeof eventKeys)[],
): Component<WebProps> {
  return (props) => {
    register();
    const editor = useEditorContext();
    const [element, setElement] = createSignal<HTMLElement>();
    const Tag = dynamic(() => tag, { static: true });
    const handlerKeys = events.map((name) => eventKeys[name]);
    const rest = omit(props, ...properties, ...handlerKeys, "ref", "children");
    createRenderEffect(element, (el) => {
      if (!el) return;
      const controller = new AbortController();

      for (const [index, event] of events.entries()) {
        el.addEventListener(
          event,
          (value) => {
            // SAFETY: each key is generated from the matching custom event name.
            const handler = props[handlerKeys[index]!] as ((event: Event) => void) | undefined;

            handler?.(value);
          },
          { signal: controller.signal },
        );
      }

      return () => controller.abort();
    });
    createRenderEffect(
      () => ({
        element: element(),
        values: Object.fromEntries(
          properties.map((key) => {
            return [key, props[key] ?? (key === "editor" ? editor : undefined)];
          }),
        ),
      }),
      ({ element, values }) => {
        if (element) Object.assign(element, values);
      },
    );

    return (
      <Tag
        {...rest}
        ref={(el: HTMLElement) => {
          setElement(el);

          props.ref?.(el);
        }}
      >
        {props.children}
      </Tag>
    );
  };
}
