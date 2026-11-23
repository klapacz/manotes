import {
  createContext,
  createMemo,
  createSignal,
  Show,
  For,
  Loading,
  useContext,
  omit,
} from "solid-js";
import type { JSX, ComponentProps } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import * as Drawer from "@ui-sdk/solid/drawer";
import * as Popover from "./popover";
import { useIsMobile } from "../../lib/use-mobile";
import { buttonVariants, type ButtonProps } from "./button";
import { cx } from "../../lib/cva";
import { SelectedIcon, EnterSubmenuIcon, BackIcon, XIcon, ApplyIcon } from "../icons";
import { Positions, PickerQuery } from "./picker-query";
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandScroll,
  type CommandInputProps,
} from "./command";

type PickerContext = {
  label: () => string;
  mobile: () => boolean;
  open: () => boolean;
  change: (value: boolean) => void;
  trigger?: HTMLElement;
  afterClose?: () => void;
  placement?: string;
};

const Context = createContext<PickerContext>();

function usePicker() {
  const context = useContext(Context);

  if (!context) throw new Error("Picker components must be inside Picker.Root");

  return context;
}

export function Root(props: {
  label: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  placement?: string;
  children?: JSX.Element;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = createSignal(false);

  const ctx: PickerContext = {
    label: () => props.label,
    mobile,
    open: () => props.open ?? open(),
    change: (v: boolean) => {
      if (v) ctx.afterClose = undefined;

      setOpen(v);
      props.onOpenChange?.(v);
    },
    trigger: undefined,
    afterClose: undefined,
    placement: props.placement,
  };

  return (
    <Context value={ctx}>
      <Dynamic
        component={mobile() ? Drawer.Drawer : Popover.Popover}
        open={ctx.open()}
        onOpenChange={ctx.change}
      >
        {props.children}
      </Dynamic>
    </Context>
  );
}

type TriggerProps = {
  [K in keyof ComponentProps<"button">]: K extends "ref"
    ? (element: HTMLButtonElement) => void
    : K extends "class"
      ? string
      : ComponentProps<"button">[K];
} & Pick<ButtonProps, "variant" | "size" | "rounded" | "intent"> & {
    modified?: boolean;
    title?: string;
  };

export function Trigger(props: TriggerProps) {
  const ctx = usePicker();

  return (
    <Dynamic
      component={ctx.mobile() ? Drawer.DrawerTrigger : Popover.PopoverTrigger}
      {...omit(
        props,
        "class",
        "children",
        "modified",
        "ref",
        "variant",
        "size",
        "rounded",
        "intent",
        "style",
      )}
      disabled={!!props.disabled}
      style={props.style || undefined}
      ref={(el: HTMLButtonElement) => {
        ctx.trigger = el;

        if (props.ref) props.ref(el);
      }}
      aria-label={ctx.label()}
      render={(part) => <button {...part} aria-expanded={ctx.open() ? "true" : "false"} />}
      class={buttonVariants({
        variant: props.variant ?? "outline",
        size: props.size ?? "chip",
        class: cx("relative text-sm font-normal", props.class),
      })}
    >
      <span class="inline-flex min-w-0 items-center gap-1.5 truncate">{props.children}</span>
      <Show when={props.modified}>
        <span
          aria-label="Non-default setting"
          class="pointer-events-none absolute right-0 top-0 size-1.5 rounded-full bg-primary-solid"
        />
      </Show>
    </Dynamic>
  );
}

export function Content(props: {
  class?: string;
  onCloseAutoFocus?: (event: Event) => void;
  children: (close: (action?: () => void) => void) => JSX.Element;
}) {
  const ctx = usePicker();

  // Fresh history map per open session so closing always clears search/input
  // (including controlled opens like F or /), while Back inside a session still restores it.
  const history = createMemo(() => {
    ctx.open();

    return new Map();
  });

  let content: HTMLDivElement | undefined;

  const close = (action?: () => void) => {
    ctx.afterClose = action;
    ctx.change(false);
  };

  const finalFocus = () => {
    if (ctx.open()) return null;
    const action = ctx.afterClose;
    ctx.afterClose = undefined;

    if (action) {
      queueMicrotask(action);

      return null;
    }

    const event = new Event("closeAutoFocus", { cancelable: true });
    props.onCloseAutoFocus?.(event);

    return event.defaultPrevented ? null : ctx.trigger;
  };

  return (
    <>
      <Show when={ctx.mobile()}>
        <Drawer.DrawerBackdrop class="bg-overlay fixed inset-0 z-50" />
      </Show>
      <Dynamic
        component={ctx.mobile() ? Drawer.DrawerContent : Popover.PopoverContent}
        ref={(el: HTMLDivElement) => (content = el)}
        aria-label={ctx.label()}
        initialFocus={() => content?.querySelector("input") ?? content}
        finalFocus={finalFocus}
        side={ctx.placement === "left-start" ? "left" : "bottom"}
        align="start"
        sideOffset={4}
        class={cx(
          ctx.mobile()
            ? "bg-bg-subtle text-fg z-50 flex max-h-[85dvh] w-full flex-col rounded-t-xl border border-border-subtle pb-[env(safe-area-inset-bottom)] shadow-lg"
            : "bg-bg-subtle text-fg z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border-subtle p-0 shadow-md outline-hidden",
          props.class,
        )}
      >
        <Show when={ctx.mobile()}>
          <div class="shrink-0">
            <div data-drawer-grip="" class="flex justify-center pt-2 pb-1" aria-hidden="true">
              <div class="bg-border h-1 w-10 rounded-full" />
            </div>
            <div class="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
              <Drawer.DrawerTitle
                render={(part) => <div {...part} />}
                class="truncate text-sm font-normal"
              >
                {ctx.label()}
              </Drawer.DrawerTitle>
              <Drawer.DrawerClose
                aria-label="Close picker"
                class={buttonVariants({ variant: "ghost", size: "icon-xs" })}
              >
                <XIcon />
              </Drawer.DrawerClose>
            </div>
          </div>
        </Show>
        <div data-drawer-no-drag="" class="min-h-0 overflow-y-auto">
          <Loading fallback={null}>
            <Positions value={history}>{props.children(close)}</Positions>
          </Loading>
        </div>
      </Dynamic>
    </>
  );
}

export type Choice = {
  value: string;
  label: string;
  labelSuffix?: JSX.Element;
  badge?: string;
  group?: string;
  groupLabel?: () => JSX.Element;
  icon?: JSX.Element;
  shortcut?: string;
  modified?: boolean;
  detail?: () => JSX.Element;
  suffix?: JSX.Element;
  keywords?: readonly string[];
  path?: readonly string[];
};

type QueryProps<Option extends Choice> = PickerQuery.Options<Option> & {
  selected?: string | readonly string[];
  onSelect: (choice: Option, event: Event) => void;
  disabled?: boolean;
  placeholder?: string;
  children?: (items: JSX.Element, search: () => string) => JSX.Element;
};

export function Query<Option extends Choice>(props: QueryProps<Option>) {
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
                choice.group &&
                (index() === 0 || query.visible()[index() - 1]?.group !== choice.group)
              }
            >
              <Show when={index() > 0}>
                <div role="separator" class="my-1 border-t border-border-subtle" />
              </Show>
              <Show when={!query.search().trim() && choice.groupLabel}>
                {(heading) => {
                  return <div class="px-2 py-1.5 text-xs text-fg-subtle">{heading()()}</div>;
                }}
              </Show>
            </Show>
            <CommandItem
              value={choice.value}
              keywords={[choice.label, ...(choice.keywords ?? [])]}
              disabled={props.disabled}
              onSelect={(event) => {
                query.setHighlighted(choice.value);
                props.onSelect(choice, event);
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
              <Show when={choice.badge}>
                <span class="shrink-0 text-sm text-fg-subtle">{choice.badge}</span>
              </Show>
              <Show when={choice.detail}>
                {(detail) => (
                  <span class={cx("relative min-w-0 max-w-[50%]", choice.modified && "pr-2")}>
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
        filter={false}
        autoHighlight={false}
        query={query.search()}
        onQueryChange={query.changeSearch}
        value={query.highlighted()}
        onValueChange={(value) => query.setHighlighted(value ?? "")}
      >
        <CommandInput
          aria-label={props.label}
          placeholder={props.placeholder ?? props.label + "…"}
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
    <CommandItem value="back" onSelect={() => props.onSelect()} tabindex={props.tabIndex}>
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
      ref={(input) => {
        return requestAnimationFrame(() => {
          if (!input.isConnected) return;
          input.focus();
          input.select();
        });
      }}
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

export function Apply(props: { onSelect: () => void; disabled?: boolean }) {
  return (
    <CommandItem value="apply" disabled={props.disabled} onSelect={props.onSelect}>
      <ApplyIcon />
      Apply
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
