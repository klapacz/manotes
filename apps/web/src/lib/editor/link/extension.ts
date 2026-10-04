import { Schema } from "effect";
import {
  definePlugin,
  getMarkRange,
  Priority,
  withPriority,
  type PlainExtension,
} from "prosekit/core";
import { Plugin, PluginKey, TextSelection, type EditorState } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";

/** A link, or the text a new link would wrap (`href` is empty). */
export type Target = {
  readonly from: number;
  readonly to: number;
  readonly href: string;
  readonly text: string;
};

const decodeLinkAttrs = Schema.decodeUnknownSync(Schema.Struct({ href: Schema.String }));

// Touch taps place the caret instead: the link popover offers to open it.
const pointerTypes = new WeakMap<EditorView, string>();

/**
 * Open a clicked link in a new tab. A contenteditable `<a>` does not navigate,
 * and an autolinked href may have no scheme, which would resolve in-app.
 * Runs ahead of mod-click prevention so Cmd/Ctrl-click opens too.
 *
 * Pasting a single URL over selected text links that text.
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

            const anchor = element(view, event.target);
            const href = anchor && openableHref(anchor.getAttribute("href") ?? "");

            if (!href) return false;
            event.preventDefault();
            window.open(href, "_blank", "noopener,noreferrer");

            return true;
          },
          handlePaste: (view, event) => {
            const href = pastedUrl(event.clipboardData?.getData("text/plain") ?? "");
            const target = href && editTarget(view.state);

            if (!target || target.from === target.to) return false;

            return apply(view, target, { text: target.text, href });
          },
        },
      }),
    ),
    Priority.high,
  );
}

/** The link the caret is inside, or that contains the selection. */
export function linkAtSelection(state: EditorState): Target | undefined {
  const { from, to, empty } = state.selection;
  const link = linkRange(state, from);

  if (!link || (empty ? from <= link.from || from >= link.to : to > link.to)) return;

  return link;
}

/** The link to edit at the selection, else the selected text to link. */
export function editTarget(state: EditorState): Target | undefined {
  const { selection, doc } = state;
  const { $from, $to, from, to } = selection;

  if (!(selection instanceof TextSelection) || !$from.sameParent($to)) return;

  if (!$from.parent.inlineContent || $from.parent.type.spec.code) return;

  const link = linkRange(state, from);

  if (link && link.from <= from && to <= link.to) return link;

  // Surrounding spaces stay outside the link; a blank selection links nothing.
  const text = doc.textBetween(from, to, undefined, "\uFFFC");
  const start = from + text.length - text.trimStart().length;
  const end = to - (text.length - text.trimEnd().length);

  if (from !== to && start >= end) return;

  return { from: start, to: end, href: "", text: doc.textBetween(start, end) };
}

/** The link at `pos`, including a caret at either edge. */
export function linkRange(state: EditorState, pos: number): Target | undefined {
  const type = state.schema.marks.link;
  const range = type && getMarkRange(state.doc.resolve(pos), type);

  if (!range) return;

  return {
    from: range.from,
    to: range.to,
    href: decodeLinkAttrs(range.mark.attrs).href,
    text: state.doc.textBetween(range.from, range.to),
  };
}

/**
 * Link `target` to `input.href`, replacing its text if it changed, and put
 * the caret after it unless `select` is false. An empty href removes an
 * existing link.
 */
export function apply(
  view: EditorView,
  target: Target,
  input: { text: string; href: string },
  select = true,
) {
  const type = view.state.schema.marks.link;
  const href = normalizeHref(input.href);

  if (!type) return false;

  if (!href) return target.href ? remove(view, target) : false;

  const text = input.text.trim() ? input.text : target.text || href;
  const { from } = target;
  const tr = view.state.tr;

  if (text !== target.text) tr.insertText(text, from, target.to);

  const to = from + (text === target.text ? target.to - from : text.length);

  tr.removeMark(from, to, type).addMark(from, to, type.create({ href }));

  if (select) tr.setSelection(TextSelection.create(tr.doc, to)).scrollIntoView();

  view.dispatch(tr.removeStoredMark(type));

  return true;
}

/** Unlink `target`, keeping its text. */
export function remove(view: EditorView, target: Target) {
  const type = view.state.schema.marks.link;

  if (!type) return false;

  view.dispatch(view.state.tr.removeMark(target.from, target.to, type));

  return true;
}

/** The link at a rendered `<a>`, e.g. one under the mouse. */
export function linkAtElement(view: EditorView, anchor: Element): Target | undefined {
  return anchor.isConnected ? linkRange(view.state, view.posAtDOM(anchor, 0)) : undefined;
}

/** The rendered link `<a>` an event hit; inline refs navigate on their own. */
export function element(view: EditorView, target: EventTarget | null): HTMLElement | undefined {
  const anchor = target instanceof Element ? target.closest<HTMLElement>("a[href]") : null;

  return anchor &&
    view.dom.contains(anchor) &&
    !anchor.closest("[data-backlink], [data-stream-ref]")
    ? anchor
    : undefined;
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

// One web or mail URL, not prose that happens to contain one.
function pastedUrl(text: string): string | undefined {
  const value = text.trim();

  if (!value || /\s/.test(value)) return;

  if (/^www\.[^.]+\.\S+$/i.test(value)) return normalizeHref(value);

  try {
    return ["http:", "https:", "mailto:"].includes(new URL(value).protocol) ? value : undefined;
  } catch {
    return;
  }
}

const BLOCKED_SCHEMES = new Set(["javascript", "vbscript", "data", "blob", "file", "about"]);

export * as EditorLink from "./extension";
