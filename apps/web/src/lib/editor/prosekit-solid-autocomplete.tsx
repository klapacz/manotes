// Ported from @prosekit/solid 0.6.2 (dist/create-component-*.js and
// dist/prosekit-solid-autocomplete.js) for prosekit 0.16.3.
// Copied because @prosekit/solid renders through `solid-js/h` and the `on:`
// namespace, both removed in Solid 2.
// Modifications: elements render through Solid JSX; editor and declared
// element properties use `prop:`, and declared events attach in a ref.
/* eslint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/no-unknown-returns -- Generic custom-element bridge; prop and event names come from @prosekit/web. */
import {
  autocompleteEmptyEvents,
  autocompleteEmptyProps,
  autocompleteItemEvents,
  autocompleteItemProps,
  autocompleteListEvents,
  autocompleteListProps,
  autocompletePopoverEvents,
  autocompletePopoverProps,
  type AutocompleteEmptyElement,
  type AutocompleteEmptyEvents,
  type AutocompleteEmptyProps as AutocompleteEmptyElementProps,
  type AutocompleteItemElement,
  type AutocompleteItemEvents,
  type AutocompleteItemProps as AutocompleteItemElementProps,
  type AutocompleteListElement,
  type AutocompleteListEvents,
  type AutocompleteListProps as AutocompleteListElementProps,
  type AutocompletePopoverElement,
  type AutocompletePopoverEvents,
  type AutocompletePopoverProps as AutocompletePopoverElementProps,
} from "prosekit/web/autocomplete";
import { omit, useContext, type Component } from "solid-js";
import { dynamic, type JSX } from "@solidjs/web";
import { EditorContext } from "./prosekit-solid";

export const AutocompleteEmpty = createComponent<
  AutocompleteEmptyElementProps,
  AutocompleteEmptyEvents,
  AutocompleteEmptyElement
>("prosekit-autocomplete-empty", autocompleteEmptyProps, autocompleteEmptyEvents);

export const AutocompleteItem = createComponent<
  AutocompleteItemElementProps,
  AutocompleteItemEvents,
  AutocompleteItemElement
>("prosekit-autocomplete-item", autocompleteItemProps, autocompleteItemEvents);

export const AutocompleteList = createComponent<
  AutocompleteListElementProps,
  AutocompleteListEvents,
  AutocompleteListElement
>("prosekit-autocomplete-list", autocompleteListProps, autocompleteListEvents);

export const AutocompletePopover = createComponent<
  AutocompletePopoverElementProps,
  AutocompletePopoverEvents,
  AutocompletePopoverElement
>("prosekit-autocomplete-popover", autocompletePopoverProps, autocompletePopoverEvents);

type EventProps<Events> = {
  [Name in keyof Events as `on${Capitalize<string & Name>}`]?: (
    event: Name extends `${string}Change`
      ? Events[Name] extends CustomEvent<infer Detail>
        ? Detail
        : never
      : Events[Name],
  ) => void;
};

type Props<ElementProps, Events, Element extends HTMLElement> = Partial<ElementProps> &
  EventProps<Events> &
  JSX.HTMLAttributes<Element>;

function createComponent<ElementProps, Events, Element extends HTMLElement>(
  tagName: string,
  elementProps: Record<string, unknown>,
  elementEvents: Record<string, unknown>,
): Component<Props<ElementProps, Events, Element>> {
  const propNames = Object.keys(elementProps);
  const eventNames = Object.keys(elementEvents);
  const handlerNames = eventNames.map((name) => `on${name[0]!.toUpperCase()}${name.slice(1)}`);
  const Tag = dynamic(() => tagName);

  return (props) => {
    const editor = useContext(EditorContext);
    const record = props as Record<string, unknown>;
    const rest = omit(props, ...(propNames as []), ...(handlerNames as []));

    const properties = Object.fromEntries(
      propNames.map((name) => [
        `prop:${name}`,
        name === "editor" ? () => record.editor ?? editor : () => record[name],
      ]),
    );

    return (
      <Tag
        {...rest}
        {...withGetters(properties)}
        ref={(element: HTMLElement) => {
          eventNames.forEach((name, index) => {
            element.addEventListener(name, (event) => {
              const handler = record[handlerNames[index]!];

              if (typeof handler !== "function") return;

              handler(name.endsWith("Change") ? (event as CustomEvent).detail : event);
            });
          });
        }}
      />
    );
  };
}

function withGetters(accessors: Record<string, () => unknown>) {
  return Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(accessors).map(([name, get]) => [name, { enumerable: true, get }]),
    ),
  );
}
