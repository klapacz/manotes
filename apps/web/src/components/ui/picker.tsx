// Adapted from bazza/ui filter-selector.tsx at fe486a6a2ee1779482c0696b5a7008de6039983b.
// Source: https://github.com/bazzalabs/ui/tree/fe486a6a2ee1779482c0696b5a7008de6039983b/apps/web/registry/data-table-filter/components
// Shared searchable command pickers; ported to Solid/Kobalte, capped at 50 mounted options.
import {
  For,
  Show,
  Suspense,
  startTransition,
  createContext,
  createEffect,
  createSignal,
  useContext,
  type JSX,
  splitProps,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import Drawer from "@corvu/drawer";
import { PickerQuery } from "./picker-query";
import { useIsMobile } from "../../lib/use-mobile";
import { SelectedIcon, EnterSubmenuIcon, BackIcon, XIcon } from "../icons";
import { Button, type ButtonProps } from "./button";
import { cx } from "../../lib/cva";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandScroll,
  type CommandInputProps,
} from "./command";
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
  type PopoverProps,
} from "./popover";

export type Choice = {
  value: string;
  label: string;
  labelSuffix?: JSX.Element;
  group?: string;
  icon?: JSX.Element;
  shortcut?: string;
  modified?: boolean;
  detail?: () => JSX.Element;
  suffix?: JSX.Element;
  keywords?: readonly string[];
  path?: readonly string[];
};

type PickerContextValue = {
  label: () => string;
  mobile: () => boolean;
  open: () => boolean;
  changeOpen: (open: boolean) => void;
  trigger: () => HTMLButtonElement | undefined;
  setTrigger: (element: HTMLButtonElement) => void;
  onInitialFocus?: (event: Event) => void;
  onFinalFocus?: (event: Event) => void;
};

const PickerContext = createContext<PickerContextValue>();

function PickerRoot(props: {
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placement?: PopoverProps["placement"];
  getAnchorRect?: PopoverProps["getAnchorRect"];
  children?: JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const [trigger, setTrigger] = createSignal<HTMLButtonElement>();
  const mobile = useIsMobile();

  const context: PickerContextValue = {
    label: () => props.label,
    mobile,
    open: () => props.open ?? open(),
    changeOpen: (next) => {
      setOpen(next);
      props.onOpenChange?.(next);
    },
    trigger,
    setTrigger,
  };

  return (
    <Dynamic
      component={mobile() ? Drawer : Popover}
      open={context.open()}
      onOpenChange={context.changeOpen}
      modal={mobile()}
      {...(mobile()
        ? {
            onInitialFocus: (event: Event) => context.onInitialFocus?.(event),
            onFinalFocus: (event: Event) => context.onFinalFocus?.(event),
          }
        : {
            placement: props.placement ?? "bottom-start",
            flip: props.placement === "left-start" ? "bottom-start" : true,
            getAnchorRect: props.getAnchorRect,
          })}
    >
      <PickerContext.Provider value={context}>{props.children}</PickerContext.Provider>
    </Dynamic>
  );
}

function PickerTrigger(
  props: Omit<ButtonProps, "ref"> & {
    ref?: (element: HTMLButtonElement) => void;
    modified?: boolean;
  },
) {
  const context = usePicker();
  const [, rest] = splitProps(props, ["children", "class", "modified", "ref"]);

  return (
    <Dynamic
      component={context.mobile() ? Drawer.Trigger : PopoverTrigger}
      as={Button}
      aria-label={context.label()}
      variant="outline"
      size="chip"
      {...rest}
      ref={(element: HTMLButtonElement) => {
        context.setTrigger(element);

        props.ref?.(element);
      }}
      class={cx("relative text-sm font-normal", props.class)}
    >
      <span class="inline-flex min-w-0 items-center gap-1.5 truncate">{props.children}</span>
      <Show when={props.modified}>
        <Indicator />
      </Show>
    </Dynamic>
  );
}

function PickerContent(props: {
  onCloseAutoFocus?: (event: Event) => void;
  class?: string;
  children: (close: (action?: () => void) => void) => JSX.Element;
}) {
  const context = usePicker();
  let content: HTMLDivElement | undefined;
  let afterClose: (() => void) | undefined;

  createEffect(() => {
    if (context.open()) afterClose = undefined;
  });

  const close = (action?: () => void) => {
    afterClose = action;
    context.changeOpen(false);
  };

  const focusInput = (event: Event) => {
    const input = content?.querySelector("input");

    if (!input) return;
    event.preventDefault();
    input.focus();
  };

  const restoreFocus = (event: Event) => {
    // A previous content's deferred cleanup must not steal focus after reopening.
    if (context.open()) return event.preventDefault();

    const action = afterClose;
    afterClose = undefined;

    // Navigation owns focus after dismissal, instead of restoring the old trigger.
    if (action) {
      event.preventDefault();
      queueMicrotask(action);

      return;
    }

    props.onCloseAutoFocus?.(event);

    if (event.defaultPrevented) return;

    if (context.mobile()) {
      event.preventDefault();
      context.trigger()?.focus();
    }
  };

  context.onInitialFocus = focusInput;
  context.onFinalFocus = restoreFocus;

  return (
    <Dynamic component={context.mobile() ? Drawer.Portal : PopoverPortal}>
      <Show when={context.mobile()}>
        <Drawer.Overlay class="bg-overlay fixed inset-0 z-50" />
      </Show>
      <Dynamic
        component={context.mobile() ? Drawer.Content : PopoverContent}
        ref={(element: HTMLDivElement) => (content = element)}
        class={cx(
          context.mobile()
            ? "bg-bg-subtle text-fg fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl border border-border-subtle pb-[env(safe-area-inset-bottom)] shadow-lg data-transitioning:transition-transform data-transitioning:duration-200"
            : "w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0",
          props.class,
        )}
        aria-label={context.label()}
        {...(!context.mobile() && { onOpenAutoFocus: focusInput, onCloseAutoFocus: restoreFocus })}
      >
        <Show when={context.mobile()}>
          <div class="shrink-0">
            <div class="flex justify-center pt-2 pb-1" aria-hidden="true">
              <div class="bg-border h-1 w-10 rounded-full" />
            </div>
            <div class="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <Drawer.Label class="truncate text-sm font-normal">{context.label()}</Drawer.Label>
              <Drawer.Close as={Button} variant="ghost" size="icon-xs" aria-label="Close picker">
                <XIcon />
              </Drawer.Close>
            </div>
          </div>
        </Show>
        <div data-corvu-no-drag="" class="min-h-0 overflow-y-auto">
          <PickerQuery.Positions.Provider value={new Map()}>
            <Suspense>{props.children(close)}</Suspense>
          </PickerQuery.Positions.Provider>
        </div>
      </Dynamic>
    </Dynamic>
  );
}

function usePicker() {
  const context = useContext(PickerContext);

  if (!context) throw new Error("Picker components must be inside Picker.Root");

  return context;
}

export { PickerRoot as Root, PickerTrigger as Trigger, PickerContent as Content };

export function Query<Option extends Choice>(
  props: PickerQuery.Options<Option> & {
    selected?: string | readonly string[];
    onSelect: (choice: Option) => void;
    disabled?: boolean;
    children?: (items: JSX.Element, search: () => string) => JSX.Element;
  },
) {
  const query = PickerQuery.use(props);

  const items = () => (
    <>
      <Show when={!query.matches().length}>
        <div role="status" class="min-h-8 px-2 py-1.5 text-sm text-fg-subtle">
          {query.status()}
        </div>
      </Show>
      <For each={query.visible()}>
        {(choice, index) => (
          <>
            <Show
              when={
                index() > 0 && choice.group && query.visible()[index() - 1]?.group !== choice.group
              }
            >
              <div role="separator" class="my-1 border-t border-border-subtle" />
            </Show>
            <CommandItem
              value={choice.value}
              keywords={[choice.label, ...(choice.keywords ?? [])]}
              disabled={props.disabled}
              onSelect={() => {
                query.setHighlighted(choice.value);
                void startTransition(() => props.onSelect(choice));
              }}
            >
              <Show when={"selected" in props}>
                <span class="flex size-4 shrink-0 items-center justify-center">
                  <Show
                    when={
                      props.selected === choice.value ||
                      (Array.isArray(props.selected) && props.selected.includes(choice.value))
                    }
                  >
                    <SelectedIcon aria-label="Selected" class="size-4" />
                  </Show>
                </span>
              </Show>
              {choice.icon}
              <span
                class="inline-flex min-w-0 flex-1 items-center gap-1"
                title={[...(choice.path ?? []), choice.label].join(" › ")}
              >
                <For each={choice.path}>
                  {(parent, index) => (
                    <>
                      <span
                        class={
                          index() === 0
                            ? "shrink-0 text-fg-subtle"
                            : "min-w-0 truncate text-fg-subtle"
                        }
                      >
                        {parent}
                      </span>
                      <Caret />
                    </>
                  )}
                </For>
                <span class="min-w-0 truncate">{choice.label}</span>
                {choice.labelSuffix}
              </span>
              <Show when={choice.detail}>
                {(detail) => (
                  <span
                    class="relative min-w-0 max-w-[50%]"
                    classList={{ "pr-2": choice.modified }}
                  >
                    <span class="block truncate text-sm text-fg-subtle">{detail()()}</span>
                    <Show when={choice.modified}>
                      <Indicator />
                    </Show>
                  </span>
                )}
              </Show>
              <Show when={choice.shortcut}>
                <span class="text-xs text-fg-subtle">{choice.shortcut}</span>
              </Show>
              {choice.suffix}
            </CommandItem>
          </>
        )}
      </For>
      <Show when={query.matches().length > query.visible().length}>
        <p class="px-2 py-2 text-sm text-fg-subtle">Keep typing to narrow results.</p>
      </Show>
    </>
  );

  return (
    <Show when={query.ready()}>
      <Command
        ref={query.attach}
        shouldFilter={false}
        value={query.highlighted()}
        onValueChange={query.setHighlighted}
      >
        <CommandInput
          aria-label={props.label}
          placeholder={props.label + "…"}
          value={query.search()}
          onValueChange={query.changeSearch}
        />
        {props.children ? (
          props.children(items(), query.search)
        ) : (
          <CommandList>
            <CommandScroll>{items()}</CommandScroll>
          </CommandList>
        )}
      </Command>
    </Show>
  );
}

export function Back(props: { onSelect: () => void; tabIndex?: number }) {
  return (
    <CommandItem
      value="back"
      onSelect={() => void startTransition(props.onSelect)}
      tabIndex={props.tabIndex}
    >
      <BackIcon />
      Back
    </CommandItem>
  );
}

export function Indicator() {
  return (
    <span
      aria-label="Non-default setting"
      data-picker-modified=""
      class="pointer-events-none absolute right-0 top-0 size-1.5 rounded-full bg-primary-solid"
    />
  );
}

export function Caret() {
  return <EnterSubmenuIcon aria-hidden="true" class="size-3.5 shrink-0 text-fg-subtle" />;
}

export function Input(props: Omit<CommandInputProps, "ref">) {
  return (
    <CommandInput
      {...props}
      ref={(input) =>
        requestAnimationFrame(() => {
          if (!input.isConnected) return;
          input.focus();
          input.select();
        })
      }
    />
  );
}

export function Clear(props: { onSelect?: () => void; disabled?: boolean }) {
  return (
    <CommandItem
      value="clear"
      disabled={props.disabled || !props.onSelect}
      onSelect={props.onSelect}
    >
      <XIcon />
      Clear
    </CommandItem>
  );
}

export function Footer(props: { children?: JSX.Element }) {
  return (
    <div data-picker-footer="" class="shrink-0 border-t border-border-subtle bg-bg p-1">
      {props.children}
    </div>
  );
}

export * as Picker from "./picker";
