import { Check, Copy, ExternalLink, Unlink } from "lucide-solid";
import { definePlugin } from "prosekit/core";
import { Plugin, TextSelection } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";
import { useEditor, useExtension, useKeymap } from "prosekit/solid";
import {
  InlinePopoverPopup,
  InlinePopoverPositioner,
  InlinePopoverRoot,
} from "prosekit/solid/inline-popover";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import { Button, buttonVariants } from "../../../components/ui/button";
import { inputClass } from "../../../components/ui/input";
import { cx } from "../../cva";
import { EditorLink } from "./extension";

export type LinkEdit = ReturnType<typeof createLinkEdit>;

/** The link being edited; shared by the popover and the mobile toolbar. */
export function createLinkEdit() {
  const [target, setTarget] = createSignal<EditorLink.Target>();
  // The target whose URL field should take focus, e.g. after Cmd/Ctrl-K.
  const [focusRequest, setFocusRequest] = createSignal<EditorLink.Target>();

  return {
    target,
    focusRequest,
    clearFocusRequest: () => setFocusRequest(undefined),
    edit: setTarget,
    /** Edit the link at the selection, or link the selected text. */
    open: (view: EditorView) => {
      const next = EditorLink.editTarget(view.state);

      if (!next) return false;

      // Keep what is being linked visible while the URL field has focus.
      if (next.from !== next.to) {
        const { tr, doc } = view.state;

        view.dispatch(tr.setSelection(TextSelection.create(doc, next.from, next.to)));
      }

      setTarget(next);
      setFocusRequest(next);

      return true;
    },
    close: () => setTarget(undefined),
  };
}

/**
 * Shows a hovered or tapped link as an editable URL with open, copy and
 * remove. The field takes focus only when clicked or after Cmd/Ctrl-K, which
 * edits a selection or the link at the caret; elsewhere it stays the search
 * shortcut. Like Reflect, a caret passing through a link shows nothing.
 */
export function LinkMenu(props: { edit: LinkEdit }): JSX.Element {
  const editor = useEditor();
  const view = () => editor().view;
  const hover = createHover();
  const [popup, setPopup] = createSignal<HTMLElement>();

  useExtension(() => hover.extension);
  useKeymap(() => ({
    "Mod-k": (state, _dispatch, view) => {
      if (!view || (state.selection.empty && !EditorLink.linkAtSelection(state))) return false;

      return props.edit.open(view);
    },
    Escape: () => {
      if (!shown()) return false;
      hover.clear();
      props.edit.close();

      return true;
    },
  }));

  // A press anywhere but the shown link or its panel dismisses it.
  onMount(() => {
    const dismiss = (event: PointerEvent) => {
      const link = hover.element();
      const target = event.target;

      if (!link || props.edit.target() || !(target instanceof Node)) return;

      if (!link.contains(target) && !popup()?.contains(target)) hover.clear();
    };

    document.addEventListener("pointerdown", dismiss, true);
    onCleanup(() => document.removeEventListener("pointerdown", dismiss, true));
  });

  // Starting an edit keeps the same target, so the panel and its field stay.
  const shown = createMemo(
    () => {
      const editing = props.edit.target();

      if (editing) return editing;

      const hovered = hover.element();

      return hovered && EditorLink.linkAtElement(view(), hovered);
    },
    undefined,
    { equals: sameLink },
  );

  const anchor = createMemo(() => {
    const target = shown();

    if (!target) return null;

    return hover.element() ?? rangeAnchor(view(), target);
  });

  return (
    <InlinePopoverRoot
      open={anchor() !== null}
      anchor={anchor()}
      defaultOpen={false}
      // Without our anchor the root follows the text selection and requests
      // closing on every update, so Escape is handled in the keymap instead.
      dismissOnEscape={false}
    >
      <InlinePopoverPositioner placement="bottom-start" offset={6} hoist class="z-50 block">
        <InlinePopoverPopup
          ref={setPopup}
          class="block rounded-md border border-border bg-bg text-fg shadow-md transition-opacity duration-100 data-[state=closed]:opacity-0 starting:opacity-0 motion-reduce:transition-none"
          onMouseEnter={hover.keep}
          onMouseLeave={hover.release}
        >
          <Show when={shown()} keyed>
            {(target) => (
              <LinkPanel
                target={target}
                edit={props.edit}
                onApply={(input, select) => EditorLink.apply(view(), target, input, select)}
                onRemove={() => {
                  hover.clear();
                  EditorLink.remove(view(), target);
                }}
                onDone={(refocus) => {
                  if (refocus) view().focus();
                  hover.clear();
                  props.edit.close();
                }}
              />
            )}
          </Show>
        </InlinePopoverPopup>
      </InlinePopoverPositioner>
    </InlinePopoverRoot>
  );
}

/**
 * The link's URL as a field, plus a text field for a new link at the caret.
 * Enter saves, Escape reverts, and focus leaving for the note saves.
 */
function LinkPanel(props: {
  target: EditorLink.Target;
  edit: LinkEdit;
  onApply: (input: { text: string; href: string }, select: boolean) => void;
  onRemove: () => void;
  onDone: (refocus: boolean) => void;
}) {
  const [text, setText] = createSignal("");
  const [href, setHref] = createSignal(props.target.href);
  const [copied, setCopied] = createSignal(false);
  const needsText = props.target.from === props.target.to;
  const [hrefInput, setHrefInput] = createSignal<HTMLInputElement>();
  let reset: ReturnType<typeof setTimeout> | undefined;
  // Set once an edit is saved or reverted, so the focusout that follows is not.
  let settled = false;

  onCleanup(() => clearTimeout(reset));

  createEffect(() => {
    const input = hrefInput();

    if (!input || !sameLink(props.edit.focusRequest(), props.target)) return;
    props.edit.clearFocusRequest();
    input.focus({ preventScroll: true });
    input.select();
  });

  const start = () => {
    settled = false;

    if (!props.edit.target()) props.edit.edit(props.target);
  };

  const finish = (save: boolean, refocus: boolean) => {
    if (settled) return;
    settled = true;

    const changed = href().trim() !== props.target.href || text().trim() !== "";

    if (save && changed) props.onApply({ text: text(), href: href() }, refocus);
    else setHref(props.target.href);
    props.onDone(refocus);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(props.target.href);
    setCopied(true);
    clearTimeout(reset);
    reset = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div
      class="flex w-80 max-w-[calc(100vw-1rem)] flex-col gap-1 p-1"
      // Only the fields take focus: the editor or the field being typed in
      // keeps it, so a click elsewhere in the panel cannot close it.
      onPointerDown={(event) => {
        if (event.target instanceof HTMLInputElement) start();
        else event.preventDefault();
      }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
      onFocusIn={start}
      onFocusOut={(event) => {
        const next = event.relatedTarget;

        if (!(next instanceof Node && event.currentTarget.contains(next))) finish(true, false);
      }}
      onKeyDown={(event) => {
        if (event.isComposing) return;

        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === "Enter", true);
        }
      }}
    >
      <Show when={needsText}>
        <input
          class={fieldClass}
          value={text()}
          placeholder="Link text"
          aria-label="Link text"
          onInput={(event) => setText(event.currentTarget.value)}
        />
      </Show>
      <div class="flex items-center gap-0.5">
        <input
          ref={setHrefInput}
          class={cx(fieldClass, "min-w-0 flex-1")}
          value={href()}
          placeholder="Paste or type a link"
          aria-label="Link"
          inputMode="url"
          autocapitalize="off"
          autocorrect="off"
          spellcheck={false}
          enterkeyhint="done"
          onInput={(event) => setHref(event.currentTarget.value)}
        />
        <Show when={EditorLink.openableHref(props.target.href)}>
          {(url) => (
            <a
              href={url()}
              target="_blank"
              rel="noopener noreferrer"
              class={buttonVariants({
                variant: "ghost",
                size: "icon-sm",
                class: "pointer-coarse:size-10",
              })}
              aria-label="Open link"
              title="Open link"
            >
              <ExternalLink />
            </a>
          )}
        </Show>
        <Show when={props.target.href}>
          <IconButton label={copied() ? "Copied" : "Copy link"} onClick={() => void copy()}>
            <Show when={copied()} fallback={<Copy />}>
              <Check />
            </Show>
          </IconButton>
          <IconButton
            label="Remove link"
            onClick={() => {
              settled = true;
              props.onRemove();
              props.onDone(true);
            }}
          >
            <Unlink />
          </IconButton>
        </Show>
      </div>
    </div>
  );
}

function IconButton(props: { label: string; onClick: () => void; children: JSX.Element }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      class="pointer-coarse:size-10"
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

/**
 * The link under the mouse after a short dwell, or a tapped link at once, since
 * touch has no hover. As in Reflect (meowdown's `defineMarkHoverHandler`), a
 * tap on a link shows it without placing the caret or raising the keyboard.
 */
function createHover() {
  const [element, setElement] = createSignal<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pointerType = "";

  const later = (action: () => void, delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(action, delay);
  };

  const hide = () => later(() => setElement(undefined), 200);

  onCleanup(() => clearTimeout(timer));

  const extension = definePlugin(
    new Plugin({
      props: {
        handleDOMEvents: {
          pointerdown: (_view, event) => {
            pointerType = event.pointerType;

            return false;
          },
          // Cancelling a tap's compatibility mousedown keeps the caret and the
          // keyboard where they are, and ProseMirror's click handling away.
          mousedown: (view, event) => {
            if (pointerType !== "touch" || !EditorLink.element(view, event.target)) return false;
            event.preventDefault();

            return true;
          },
          click: (view, event) => {
            const link = pointerType === "touch" && EditorLink.element(view, event.target);

            if (!link) return false;
            event.preventDefault();
            clearTimeout(timer);
            setElement(link);

            return true;
          },
          pointerover: (view, event) => {
            const link = event.pointerType === "mouse" && EditorLink.element(view, event.target);

            if (link === element()) clearTimeout(timer);
            else if (link) later(() => setElement(link), 400);

            return false;
          },
          pointerout: (view, event) => {
            const link = event.pointerType === "mouse" && EditorLink.element(view, event.target);
            const next = event.relatedTarget;

            if (link && !(next instanceof Node && link.contains(next))) hide();

            return false;
          },
        },
      },
    }),
  );

  return {
    element,
    extension,
    keep: () => clearTimeout(timer),
    release: hide,
    clear: () => {
      clearTimeout(timer);
      setElement(undefined);
    },
  };
}

// Position against the live text range, so a wrapped link anchors to its lines.
function rangeAnchor(view: EditorView, target: EditorLink.Target) {
  const range = () => {
    const size = view.state.doc.content.size;
    const start = view.domAtPos(Math.min(target.from, size));
    const end = view.domAtPos(Math.min(target.to, size));
    const range = document.createRange();

    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    return range;
  };

  return {
    contextElement: view.dom,
    getClientRects: () => range().getClientRects(),
    getBoundingClientRect: () => {
      const rect = range().getBoundingClientRect();

      if (rect.height > 0) return rect;

      // A collapsed range, e.g. a new link at the caret, has no box in WebKit.
      const caret = view.coordsAtPos(Math.min(target.from, view.state.doc.content.size));

      return new DOMRect(caret.left, caret.top, 0, caret.bottom - caret.top);
    },
  };
}

function sameLink(a: EditorLink.Target | undefined, b: EditorLink.Target | undefined) {
  return a?.from === b?.from && a?.to === b?.to && a?.href === b?.href;
}

// iOS zooms into inputs under 16px.
const fieldClass = cx(inputClass, "text-fg pointer-coarse:h-11 pointer-coarse:text-base");
