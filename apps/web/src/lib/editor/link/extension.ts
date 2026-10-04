import { definePlugin, Priority, withPriority, type PlainExtension } from "prosekit/core";
import { Plugin, PluginKey } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";

// Touch taps place the caret instead: the link popover offers to open it.
const pointerTypes = new WeakMap<EditorView, string>();

/**
 * Open a clicked link in a new tab. A contenteditable `<a>` does not navigate,
 * and an autolinked href may have no scheme, which would resolve in-app.
 * Runs ahead of mod-click prevention so Cmd/Ctrl-click opens too.
 */
export function define(): PlainExtension {
  return withPriority(
    definePlugin(
      new Plugin({
        key: new PluginKey("manotes-link-open"),
        props: {
          handleDOMEvents: {
            pointerdown: (view, event) => {
              pointerTypes.set(view, event.pointerType);

              return false;
            },
          },
          handleClick: (view, _pos, event) => {
            if (event.button !== 0 || event.shiftKey || pointerTypes.get(view) !== "mouse") {
              return false;
            }

            const anchor = linkElement(view, event.target);
            const href = anchor && openableHref(anchor.getAttribute("href") ?? "");

            if (!href) return false;
            event.preventDefault();
            window.open(href, "_blank", "noopener,noreferrer");

            return true;
          },
        },
      }),
    ),
    Priority.high,
  );
}

/**
 * The href a stored link opens: autolinks such as `example.com` get `https://`,
 * emails get `mailto:`. Script, data and local-file schemes never open.
 */
export function openableHref(raw: string): string | undefined {
  const href = normalizeHref(raw);
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();

  return scheme && !BLOCKED_SCHEMES.has(scheme) ? href : undefined;
}

/** Give a typed or autolinked href an explicit scheme. */
export function normalizeHref(raw: string): string {
  const value = raw.trim();

  if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) return value;

  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(value)) return `mailto:${value}`;

  return `https://${value.replace(/^\/\/+/, "")}`;
}

const BLOCKED_SCHEMES = new Set(["javascript", "vbscript", "data", "blob", "file", "about"]);

// Backlinks are note links with their own router navigation.
function linkElement(view: EditorView, target: EventTarget | null) {
  const anchor = target instanceof Element ? target.closest("a[href]") : null;

  return anchor && view.dom.contains(anchor) && !anchor.closest("[data-backlink]")
    ? anchor
    : undefined;
}

export * as EditorLink from "./extension";
