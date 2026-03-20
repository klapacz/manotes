import type { Accessor, ComponentProps, JSX } from "solid-js";
import {
  Show,
  createContext,
  createMemo,
  createSignal,
  splitProps,
  useContext,
} from "solid-js";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "../icons";
import { Button } from "./button";
import { useIsMobile } from "../../lib/use-mobile";
import { callHandler } from "../../lib/call-handler";
import { combineStyle } from "../../lib/combine-style";
import { cx } from "../../lib/cva";

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
  const [openMobile, setOpenMobile] = createSignal(
    local.defaultOpenMobile ?? false,
  );

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
            "bg-bg-subtle text-fg border-border relative hidden h-svh border-r transition-all duration-200 ease-linear md:flex md:flex-col",
            open() ? "w-(--sidebar-width)" : "w-0 overflow-hidden border-r-0",
            local.class,
          )}
          {...rest}
        >
          {local.children}
        </aside>
      </Show>

      <Show when={isMobile() && openMobile()}>
        <div
          class="bg-overlay fixed inset-0 z-40"
          onClick={() => setOpenMobile(false)}
        />
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

  const onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent> = (
    event,
  ) => {
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
      <Show
        when={open()}
        fallback={
          <PanelLeftOpenIcon class="size-4" />
        }
      >
        <PanelLeftCloseIcon class="size-4" />
      </Show>
      <span class="sr-only">Toggle Sidebar</span>
    </Button>
  );
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
      class={cx(
        "text-fg-subtle flex h-8 items-center px-2 text-xs font-medium",
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
    <div
      data-slot="sidebar-group-content"
      class={cx("w-full text-sm", local.class)}
      {...rest}
    />
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
      class={cx("group/menu-item", local.class)}
      {...rest}
    />
  );
};

export type SidebarMenuButtonProps = ComponentProps<"button"> & {
  isActive?: boolean;
};

export const SidebarMenuButton = (props: SidebarMenuButtonProps) => {
  const [local, rest] = splitProps(props, ["class", "isActive"]);
  const { open } = useSidebar();
  const collapsed = createMemo(() => !open());

  return (
    <button
      data-slot="sidebar-menu-button"
      data-active={local.isActive}
      class={cx(
        "ring-primary-border hover:bg-control-hover hover:text-fg flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-2 text-left text-sm outline-hidden transition-colors focus-visible:ring-2",
        local.isActive && "bg-control-hover text-fg font-medium",
        collapsed() && "justify-center",
        local.class,
      )}
      {...rest}
    />
  );
};
