import { createSignal, onCleanup, onMount, splitProps, type JSX } from "solid-js";
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
        success: (
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24">
            <g
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12l2 2l4-4" />
            </g>
          </svg>
        ),
        info: (
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24">
            <g
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4m0-4h.01" />
            </g>
          </svg>
        ),
        warning: (
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24">
            <path
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4m0 4h.01"
            />
          </svg>
        ),
        error: (
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24">
            <path
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="m15 9l-6 6m-6.414 1.726A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2h6.624a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586zM9 9l6 6"
            />
          </svg>
        ),
        loading: (
          <svg xmlns="http://www.w3.org/2000/svg" class="size-4 animate-spin" viewBox="0 0 24 24">
            <path
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 2v4m4.2 1.8l2.9-2.9M18 12h4m-5.8 4.2l2.9 2.9M12 18v4m-7.1-2.9l2.9-2.9M2 12h4M4.9 4.9l2.9 2.9"
            />
          </svg>
        ),
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
