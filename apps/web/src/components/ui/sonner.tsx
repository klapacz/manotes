import {
  ToastRegion,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  createToaster,
} from "@ui-sdk/solid/toast";
import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "@lucide/solid";
import { Show, Switch, Match } from "solid-js";
import type { ComponentProps } from "@solidjs/web";
import { buttonVariants } from "./button";

export const toast = createToaster();

export function Toaster(props: ComponentProps<typeof ToastRegion>) {
  return (
    <ToastRegion
      toaster={toast}
      expanded
      {...props}
      class="fixed right-4 bottom-4 z-100 w-89 max-w-[calc(100vw-2rem)] [&>ol]:flex [&>ol]:flex-col-reverse [&>ol]:gap-2"
    >
      {(item) => (
        <Toast class="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-4 text-[13px] text-fg shadow-md select-none [translate:var(--toast-swipe-x,0px)_var(--toast-swipe-y,0px)] data-[type=success]:border-success-border-subtle data-[type=success]:bg-success-bg-subtle data-[type=success]:text-success-fg data-[type=error]:border-error-border-subtle data-[type=error]:bg-error-bg-subtle data-[type=error]:text-error-fg data-[type=warning]:border-warning-border-subtle data-[type=warning]:bg-warning-bg-subtle data-[type=warning]:text-warning-fg data-[type=info]:border-primary-border-subtle data-[type=info]:bg-primary-bg-subtle data-[type=info]:text-primary-fg">
          <span class="shrink-0">
            <Switch fallback={<Info class="size-4" />}>
              <Match when={item.type === "success"}>
                <CircleCheck class="size-4" />
              </Match>
              <Match when={item.type === "error"}>
                <OctagonX class="size-4" />
              </Match>
              <Match when={item.type === "warning"}>
                <TriangleAlert class="size-4" />
              </Match>
              <Match when={item.type === "loading"}>
                <LoaderCircle class="size-4 animate-spin" />
              </Match>
            </Switch>
          </span>
          <div class="grid flex-1 gap-1">
            <ToastTitle class="font-medium" />
            <ToastDescription class="text-xs" />
          </div>
          <Show when={item.action}>
            <ToastAction class={buttonVariants({ size: "xs" })} />
          </Show>
        </Toast>
      )}
    </ToastRegion>
  );
}
