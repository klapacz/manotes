import { Root as ButtonPrimitive } from "@kobalte/core/button";
import type { Accessor, ComponentProps, JSX, ValidComponent } from "solid-js";
import { Show, createContext, createMemo, createSignal, splitProps, useContext } from "solid-js";
import type { VariantProps } from "cva";

import { callHandler } from "../../lib/call-handler";
import { combineStyle } from "../../lib/combine-style";
import { cva, cx } from "../../lib/cva";
import { useIsMobile } from "../../lib/use-mobile";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "../icons";
import { Button } from "./button";
import { Separator } from "./separator";

const SIDEBAR_WIDTH = "16rem";

const SIDEBAR_WIDTH_MOBILE = "18rem";

interface SidebarContextProps {
  open: Accessor<boolean>;
  setOpen: (value: boolean | ((value: boolean) => boolean)) => void;
  openMobile: Accessor<boolean>;
  setOpenMobile: (value: boolean | ((value: boolean) => boolean)) => void;
  isMobile: Accessor<boolean>;
  toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextProps | null>(null);

export const useSidebar = () => {
  const context = useContext(SidebarContext);

  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
};

export type SidebarProviderProps = ComponentProps<"div"> & {
  defaultOpen?: boolean;
  defaultOpenMobile?: boolean;
};

export const SidebarProvider = (props: SidebarProviderProps) => {
  const [local, rest] = splitProps(props, [
    "defaultOpen",
    "defaultOpenMobile",
    "class",
    "style",
    "children",
  ]);

  const isMobile = useIsMobile();
  const [open, setOpen] = createSignal(local.defaultOpen ?? true);
  const [openMobile, setOpenMobile] = createSignal(local.defaultOpenMobile ?? false);

  const toggleSidebar = () => {
    if (isMobile()) {
      setOpenMobile((prev) => !prev);

      return;
    }

    setOpen((prev) => !prev);
  };

  const contextValue: SidebarContextProps = {
    open,
    setOpen,
    openMobile,
    setOpenMobile,
    isMobile,
    toggleSidebar,
  };

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={combineStyle({ "--sidebar-width": SIDEBAR_WIDTH }, local.style)}
        class={cx("group/sidebar-wrapper flex min-h-svh w-full", local.class)}
        {...rest}
      >
        {local.children}
      </div>
    </SidebarContext.Provider>
  );
};

export type SidebarProps = ComponentProps<"aside">;

export const Sidebar = (props: SidebarProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();

  return (
    <>
      <Show when={!isMobile()}>
        <aside
          data-slot="sidebar"
          data-state={open() ? "expanded" : "collapsed"}
          class={cx(
            "bg-bg-subtle text-fg border-border sticky top-0 hidden h-svh border-r transition-all duration-200 ease-linear md:flex md:flex-col",
            open() ? "w-(--sidebar-width)" : "w-0 overflow-hidden border-r-0",
            local.class,
          )}
          {...rest}
        >
          {local.children}
        </aside>
      </Show>

      <Show when={isMobile() && openMobile()}>
        <div class="bg-overlay fixed inset-0 z-40" onClick={() => setOpenMobile(false)} />
        <aside
          data-slot="sidebar"
          class={cx(
            "bg-bg-subtle text-fg border-border fixed inset-y-0 left-0 z-50 flex w-(--sidebar-width-mobile) flex-col border-r",
            local.class,
          )}
          style={{ "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE }}
          {...rest}
        >
          {local.children}
        </aside>
      </Show>
    </>
  );
};

export type SidebarInsetProps = ComponentProps<"main">;

export const SidebarInset = (props: SidebarInsetProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <main
      data-slot="sidebar-inset"
      class={cx("bg-bg flex min-w-0 flex-1 flex-col", local.class)}
      {...rest}
    />
  );
};

export type SidebarTriggerProps = ComponentProps<typeof Button>;

export const SidebarTrigger = (props: SidebarTriggerProps) => {
  const [local, rest] = splitProps(props, ["class", "onClick"]);
  const { open, toggleSidebar } = useSidebar();

  const onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> = (event) => {
    callHandler(event, local.onClick);
    toggleSidebar();
  };

  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      class={cx("size-8", local.class)}
      onClick={onClick}
      {...rest}
    >
      <Show when={open()} fallback={<PanelLeftOpenIcon class="size-4" />}>
        <PanelLeftCloseIcon class="size-4" />
      </Show>
      <span class="sr-only">Toggle Sidebar</span>
    </Button>
  );
};

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10.
// Source: .reference/shadcn-solid/apps/docs/src/registry/ui/sidebar.tsx
// Why: the graph dropdown uses the same sidebar account-menu building blocks as the shadcn-solid sidebar examples.
// Modifications: kept the project's simpler sidebar layout/state model, reused existing local helpers, and remapped shadcn design tokens to Manotes tokens.
export type SidebarRailProps = ComponentProps<"button">;

export const SidebarRail = (props: SidebarRailProps) => {
  const [local, rest] = splitProps(props, ["class", "onClick"]);
  const { toggleSidebar } = useSidebar();

  const onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> = (event) => {
    callHandler(event, local.onClick);
    toggleSidebar();
  };

  return (
    <button
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      title="Toggle Sidebar"
      tabIndex={-1}
      onClick={onClick}
      class={cx(
        "hover:after:bg-border-subtle absolute inset-y-0 right-0 z-20 hidden w-4 translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-px md:flex",
        "cursor-e-resize data-[state=collapsed]:cursor-w-resize",
        local.class,
      )}
      data-state={useSidebar().open() ? "expanded" : "collapsed"}
      {...rest}
    />
  );
};

export type SidebarHeaderProps = ComponentProps<"div">;

export const SidebarHeader = (props: SidebarHeaderProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="sidebar-header" class={cx("flex flex-col gap-2 p-2", local.class)} {...rest} />
  );
};

export type SidebarFooterProps = ComponentProps<"div">;

export const SidebarFooter = (props: SidebarFooterProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="sidebar-footer" class={cx("flex flex-col gap-2 p-2", local.class)} {...rest} />
  );
};

export type SidebarSeparatorProps = ComponentProps<typeof Separator>;

export const SidebarSeparator = (props: SidebarSeparatorProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return <Separator data-slot="sidebar-separator" class={cx("mx-2", local.class)} {...rest} />;
};

export type SidebarContentProps = ComponentProps<"div">;

export const SidebarContent = (props: SidebarContentProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="sidebar-content"
      class={cx("flex min-h-0 flex-1 flex-col overflow-auto", local.class)}
      {...rest}
    />
  );
};

export type SidebarGroupProps = ComponentProps<"div">;

export const SidebarGroup = (props: SidebarGroupProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="sidebar-group"
      class={cx("flex w-full min-w-0 flex-col p-2", local.class)}
      {...rest}
    />
  );
};

export type SidebarGroupLabelProps = ComponentProps<"div">;

export const SidebarGroupLabel = (props: SidebarGroupLabelProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div
      data-slot="sidebar-group-label"
      class={cx("text-fg-subtle flex h-8 items-center px-2 text-xs font-medium", local.class)}
      {...rest}
    />
  );
};

export type SidebarGroupActionProps = ComponentProps<"button">;

export const SidebarGroupAction = (props: SidebarGroupActionProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <button
      data-slot="sidebar-group-action"
      class={cx(
        "text-fg-subtle hover:bg-control-hover hover:text-fg focus-visible:ring-primary-border/30 absolute top-3 right-3 flex size-5 items-center justify-center rounded-md outline-hidden focus-visible:ring-[3px]",
        local.class,
      )}
      {...rest}
    />
  );
};

export type SidebarGroupContentProps = ComponentProps<"div">;

export const SidebarGroupContent = (props: SidebarGroupContentProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <div data-slot="sidebar-group-content" class={cx("w-full text-sm", local.class)} {...rest} />
  );
};

export type SidebarMenuProps = ComponentProps<"ul">;

export const SidebarMenu = (props: SidebarMenuProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <ul
      data-slot="sidebar-menu"
      class={cx("flex w-full min-w-0 flex-col gap-1", local.class)}
      {...rest}
    />
  );
};

export type SidebarMenuItemProps = ComponentProps<"li">;

export const SidebarMenuItem = (props: SidebarMenuItemProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <li
      data-slot="sidebar-menu-item"
      class={cx("group/menu-item relative", local.class)}
      {...rest}
    />
  );
};

export const sidebarMenuButtonVariants = cva({
  base: "ring-primary-border hover:bg-control-hover hover:text-fg peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md text-left text-sm outline-hidden transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 data-[active=true]:bg-control-hover data-[active=true]:text-fg data-[active=true]:font-medium data-[state=open]:bg-control-hover data-[state=open]:text-fg [&>span:last-child]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4",
  variants: {
    variant: {
      default: "",
      outline: "border border-border-subtle bg-bg shadow-xs",
    },
    size: {
      default: "min-h-8 px-2 py-2",
      sm: "min-h-7 px-2 py-1.5 text-xs",
      lg: "min-h-12 px-2 py-2",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

export type SidebarMenuButtonProps<T extends ValidComponent = "button"> = ComponentProps<
  typeof ButtonPrimitive<T>
> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    isActive?: boolean;
  };

export const SidebarMenuButton = <T extends ValidComponent = "button">(
  props: SidebarMenuButtonProps<T>,
) => {
  // SAFETY: Erasing the polymorphic parameter lets Solid split wrapper-owned keys; all other props are forwarded unchanged to the same primitive.
  const [local, rest] = splitProps(props as SidebarMenuButtonProps, [
    "class",
    "isActive",
    "size",
    "variant",
  ]);

  const { open } = useSidebar();
  const collapsed = createMemo(() => !open());

  return (
    <ButtonPrimitive
      data-slot="sidebar-menu-button"
      data-active={local.isActive ? "true" : undefined}
      data-size={local.size}
      class={sidebarMenuButtonVariants({
        size: local.size,
        variant: local.variant,
        class: cx(collapsed() && "justify-center", local.class),
      })}
      {...rest}
    />
  );
};

export type SidebarMenuActionProps = ComponentProps<"button"> & {
  showOnHover?: boolean;
};

export const SidebarMenuAction = (props: SidebarMenuActionProps) => {
  const [local, rest] = splitProps(props, ["class", "showOnHover"]);

  return (
    <button
      data-slot="sidebar-menu-action"
      class={cx(
        "text-fg-subtle hover:bg-control-hover hover:text-fg peer-hover/menu-button:text-fg absolute top-1.5 right-1 flex size-5 items-center justify-center rounded-md outline-hidden transition-[opacity,color,background-color] focus-visible:ring-2 focus-visible:ring-primary-border",
        local.showOnHover &&
          "opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100",
        local.class,
      )}
      {...rest}
    />
  );
};

export type SidebarMenuSubProps = ComponentProps<"ul">;

export const SidebarMenuSub = (props: SidebarMenuSubProps) => {
  const [local, rest] = splitProps(props, ["class"]);
  const { open } = useSidebar();

  return (
    <ul
      data-slot="sidebar-menu-sub"
      class={cx(
        "border-border-subtle mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
        !open() && "hidden",
        local.class,
      )}
      {...rest}
    />
  );
};

export type SidebarMenuSubItemProps = ComponentProps<"li">;

export const SidebarMenuSubItem = (props: SidebarMenuSubItemProps) => {
  const [local, rest] = splitProps(props, ["class"]);

  return (
    <li
      data-slot="sidebar-menu-sub-item"
      class={cx("group/menu-sub-item relative", local.class)}
      {...rest}
    />
  );
};

export type SidebarMenuSubButtonProps = ComponentProps<"a"> & {
  isActive?: boolean;
  size?: "sm" | "md";
};

export const SidebarMenuSubButton = (props: SidebarMenuSubButtonProps) => {
  const [local, rest] = splitProps(props, ["class", "isActive", "size"]);
  const { open } = useSidebar();

  return (
    <a
      data-slot="sidebar-menu-sub-button"
      data-active={local.isActive ? "true" : undefined}
      data-size={local.size}
      class={cx(
        "ring-primary-border hover:bg-control-hover hover:text-fg flex min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4",
        local.isActive && "bg-control-hover text-fg",
        local.size === "sm" ? "h-7 text-xs" : "h-7 text-sm",
        !open() && "hidden",
        local.class,
      )}
      {...rest}
    />
  );
};
