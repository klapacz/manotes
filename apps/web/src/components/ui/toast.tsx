import * as ToastPrimitive from "@kobalte/core/toast";
import { Match, Switch } from "solid-js";
import type { JSX } from "@solidjs/web";
import { CircleCheck, LoaderCircle, OctagonX, X } from "lucide-solid";

import { cva } from "../../lib/cva";

// Replaces the somoto (Sonner) toaster, which has no Solid 2 build. Kobalte
// owns the region, queue and swipe handling; variants keep the previous Sonner
// colors mapped to Manotes design tokens.
const toastVariants = cva({
  base: "pointer-events-auto flex w-full items-center gap-2 rounded-(--radius) border px-4 py-3 text-sm shadow-lg data-[opened]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[opened]:slide-in-from-bottom-2 data-[swipe=move]:translate-x-(--kb-toast-swipe-move-x) data-[swipe=end]:animate-out data-[swipe=end]:translate-x-(--kb-toast-swipe-end-x)",
  variants: {
    variant: {
      default: "bg-bg-subtle text-fg border-border-subtle",
      success: "bg-success-bg-subtle text-success-fg border-success-border-subtle",
      error: "bg-error-bg-subtle text-error-fg border-error-border-subtle",
    },
  },
  defaultVariants: { variant: "default" },
});

type Variant = "default" | "success" | "error";

export function Toaster() {
  return (
    <ToastPrimitive.Region swipeDirection="right">
      <ToastPrimitive.List class="fixed right-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
    </ToastPrimitive.Region>
  );
}

function show(variant: Variant, icon: () => JSX.Element, message: string) {
  return ToastPrimitive.toaster.show((props) => (
    <ToastItem toastId={props.toastId} variant={variant} icon={icon()} message={message} />
  ));
}

export const toast = {
  success: (message: string) => show("success", () => <CircleCheck class="size-4" />, message),
  error: (message: string) => show("error", () => <OctagonX class="size-4" />, message),
  promise: <A,>(
    promise: Promise<A>,
    messages: { loading: string; success: (value: A) => string; error: string },
  ) => {
    ToastPrimitive.toaster.promise(promise, (props) => (
      <Switch>
        <Match when={props.state === "pending"}>
          <ToastItem
            toastId={props.toastId}
            variant="default"
            icon={<LoaderCircle class="size-4 animate-spin" />}
            message={messages.loading}
            persistent
          />
        </Match>
        <Match when={props.state === "fulfilled"}>
          <ToastItem
            toastId={props.toastId}
            variant="success"
            icon={<CircleCheck class="size-4" />}
            // SAFETY: Kobalte sets `data` to the resolved value in the fulfilled state.
            message={messages.success(props.data as A)}
          />
        </Match>
        <Match when={props.state === "rejected"}>
          <ToastItem
            toastId={props.toastId}
            variant="error"
            icon={<OctagonX class="size-4" />}
            message={messages.error}
          />
        </Match>
      </Switch>
    ));
  },
};

function ToastItem(props: {
  toastId: number;
  variant: Variant;
  icon: JSX.Element;
  message: string;
  persistent?: boolean;
}) {
  return (
    <ToastPrimitive.Root
      toastId={props.toastId}
      persistent={props.persistent}
      class={toastVariants({ variant: props.variant })}
    >
      {props.icon}
      <ToastPrimitive.Title class="flex-1 font-medium">{props.message}</ToastPrimitive.Title>
      <ToastPrimitive.CloseButton class="opacity-60 hover:opacity-100" aria-label="Close">
        <X class="size-4" />
      </ToastPrimitive.CloseButton>
    </ToastPrimitive.Root>
  );
}
