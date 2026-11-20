import type { StyledProps } from "../../lib/cva";
import { Portal, Dynamic, type ValidComponent, type ComponentProps } from "@solidjs/web";
import { Show, merge, omit } from "solid-js";
import * as SDK from "@ui-sdk/solid/dialog";

import { cx } from "../../lib/cva";
import { XIcon } from "../icons";

export function DialogPortal(props: { children?: import("@solidjs/web").JSX.Element }) {
  return <Portal>{props.children}</Portal>;
}

export type DialogProps = StyledProps<typeof SDK.Dialog>;

export const Dialog = (props: DialogProps) => {
  return <SDK.Dialog data-slot="dialog" {...props} />;
};

export type DialogTriggerProps<T extends ValidComponent = ValidComponent> = StyledProps<
  typeof SDK.DialogTrigger
> &
  Partial<import("./button").ButtonProps> & {
    as?: T;
    closeOnSelect?: boolean;
  };

export const DialogTrigger = (props: DialogTriggerProps) => {
  return (
    <SDK.DialogTrigger
      {...omit(props, "as", "closeOnSelect")}
      render={
        props.as
          ? (part) => <Dynamic component={props.as} {...part} closeOnSelect={props.closeOnSelect} />
          : props.render
      }
    />
  );
};

export type DialogCloseButtonProps = StyledProps<typeof SDK.DialogClose>;

export const DialogCloseButton = (props: DialogCloseButtonProps) => {
  return <SDK.DialogClose data-slot="dialog-close" {...props} />;
};

export type DialogContentProps = StyledProps<typeof SDK.DialogContent> & {
  showCloseButton?: boolean;
};

export const DialogContent = (props: DialogContentProps) => {
  const mergedProps = merge({ showCloseButton: true }, props);
  const rest = omit(mergedProps, "class", "children", "showCloseButton");

  return (
    <>
      <SDK.DialogBackdrop
        data-slot="dialog-overlay"
        class="transition-opacity data-[closed]:opacity-0 data-[starting-style]:opacity-0 bg-overlay fixed inset-0 z-50 duration-200"
      />
      <SDK.DialogContent
        render={(part) => <div {...part} role="alertdialog" />}
        data-slot="dialog-content"
        class={cx(
          "bg-bg-subtle text-fg transition-[opacity,scale] data-[closed]:opacity-0 data-[starting-style]:opacity-0 data-[closed]:scale-95 data-[starting-style]:scale-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border border-border-subtle p-6 shadow-lg duration-200 sm:max-w-lg",
          mergedProps.class,
        )}
        {...rest}
      >
        {mergedProps.children}
        <Show when={mergedProps.showCloseButton}>
          <SDK.DialogClose
            aria-label="Close"
            class="text-fg-subtle hover:bg-control hover:text-fg active:bg-control-active focus-visible:border-primary-border focus-visible:ring-primary-border/30 absolute top-4 right-4 rounded-sm p-1 opacity-70 transition-[opacity,color,background-color,box-shadow] duration-200 hover:opacity-100 focus-visible:ring-[3px] focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4"
          >
            <XIcon />
          </SDK.DialogClose>
        </Show>
      </SDK.DialogContent>
    </>
  );
};

export type DialogHeaderProps = ComponentProps<"div">;

export const DialogHeader = (props: DialogHeaderProps) => {
  const rest = omit(props, "class");

  return (
    <div
      data-slot="dialog-header"
      class={cx("flex flex-col gap-2 text-center sm:text-left", props.class)}
      {...rest}
    />
  );
};

export type DialogFooterProps = ComponentProps<"div">;

export const DialogFooter = (props: DialogFooterProps) => {
  const rest = omit(props, "class");

  return (
    <div
      data-slot="dialog-footer"
      class={cx("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", props.class)}
      {...rest}
    />
  );
};

export type DialogTitleProps = StyledProps<typeof SDK.DialogTitle>;

export const DialogTitle = (props: DialogTitleProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.DialogTitle
      data-slot="dialog-title"
      class={cx("text-lg leading-none font-semibold", props.class)}
      {...rest}
    />
  );
};

export type DialogDescriptionProps = StyledProps<typeof SDK.DialogDescription>;

export const DialogDescription = (props: DialogDescriptionProps) => {
  const rest = omit(props, "class");

  return (
    <SDK.DialogDescription
      data-slot="dialog-description"
      class={cx("text-fg-subtle text-sm", props.class)}
      {...rest}
    />
  );
};
