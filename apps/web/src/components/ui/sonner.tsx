import { createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
import { CircleCheck, Info, LoaderCircle, OctagonX, TriangleAlert } from "lucide-solid";
import { Toaster as Sonner, type ToasterProps as SonnerProps } from "somoto";

// Adapted from shadcn-solid using @kobalte/core 0.13.11 / solid-js 1.9.10 / somoto 0.0.2.
// Source: .reference/shadcn-solid/apps/docs/src/registry/ui/sonner.tsx
// Why: this repo was missing the shared shadcn-solid toast/toaster wrapper.
// Modifications: replaced Kobalte color-mode usage with the app's existing data-kb-theme tracking, enabled richColors by default, and remapped Sonner CSS variables to Manotes design tokens.
const readTheme = (): "light" | "dark" =>
  document.documentElement.dataset.kbTheme === "dark" ? "dark" : "light";

export const Toaster = (props: SonnerProps) => {
  const [local, rest] = splitProps(props, ["style", "theme"]);
  const [theme, setTheme] = createSignal<"light" | "dark">("light");

  onMount(() => {
    const syncTheme = () => setTheme(readTheme());

    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-kb-theme"],
    });

    onCleanup(() => observer.disconnect());
  });

  return (
    <Sonner
      richColors
      theme={local.theme ?? theme()}
      icons={{
        success: <CircleCheck class="size-4" />,
        info: <Info class="size-4" />,
        warning: <TriangleAlert class="size-4" />,
        error: <OctagonX class="size-4" />,
        loading: <LoaderCircle class="size-4 animate-spin" />,
      }}
      style={{
        "--normal-bg": "var(--color-bg-subtle)",
        "--normal-text": "var(--color-fg)",
        "--normal-border": "var(--color-border-subtle)",
        "--success-bg": "var(--color-success-bg-subtle)",
        "--success-border": "var(--color-success-border-subtle)",
        "--success-text": "var(--color-success-fg)",
        "--info-bg": "var(--color-primary-bg-subtle)",
        "--info-border": "var(--color-primary-border-subtle)",
        "--info-text": "var(--color-primary-fg)",
        "--warning-bg": "var(--color-warning-bg-subtle)",
        "--warning-border": "var(--color-warning-border-subtle)",
        "--warning-text": "var(--color-warning-fg)",
        "--error-bg": "var(--color-error-bg-subtle)",
        "--error-border": "var(--color-error-border-subtle)",
        "--error-text": "var(--color-error-fg)",
        "--border-radius": "var(--radius)",
        ...(local.style as JSX.CSSProperties | undefined),
      }}
      {...rest}
    />
  );
};
