import {
  Bold,
  Brackets,
  ChevronDown,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  ListTodo,
  List,
  Redo2,
  Undo2,
} from "lucide-solid";
import { defineFocusChangeHandler } from "prosekit/core";
import { toggleMark } from "prosekit/pm/commands";
import type { Command } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";
import { useEditor, useEditorDerivedValue, useExtension } from "prosekit/solid";
import {
  createDedentListCommand,
  createIndentListCommand,
  createToggleListCommand,
} from "prosemirror-flat-list";
import { createEffect, createSignal, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { redoCommand, undoCommand } from "y-prosemirror";
import type { LinkEdit } from "./link/menu";

const HEIGHT = 44;

/**
 * Editing actions above the software keyboard, which has no Tab, Shift-Tab,
 * undo or dismiss key. Shown while a touch editor has focus; meanwhile the app
 * shell shrinks to the visible viewport so the caret stays above the keyboard.
 */
export function MobileToolbar(props: { linkEdit: LinkEdit; onDismiss: () => void }): JSX.Element {
  const editor = useEditor();
  const touch = createMediaQuery("(pointer: coarse)");
  const [focused, setFocused] = createSignal(false);

  // Not `setFocused` itself: a truthy return marks the event handled, so
  // ProseMirror would skip its own focus tracking.
  useExtension(() =>
    defineFocusChangeHandler((value) => {
      setFocused(value);
    }),
  );

  return (
    <Show when={touch() && focused()}>
      <Toolbar view={editor().view} linkEdit={props.linkEdit} onDismiss={props.onDismiss} />
    </Show>
  );
}

function Toolbar(props: { view: EditorView; linkEdit: LinkEdit; onDismiss: () => void }) {
  const viewport = createVisualViewport();

  const can = useEditorDerivedValue(({ state }) => ({
    undo: undoCommand(state),
    redo: redoCommand(state),
    dedent: dedent(state),
    indent: indent(state),
  }));

  // The `$graph` shell sizes itself from these.
  createEffect(() => {
    const { height } = viewport();
    const root = document.documentElement.style;

    root.setProperty("--app-height", `${height}px`);
    root.setProperty("--editor-toolbar-height", `${HEIGHT}px`);

    // A keyboard can pan the page; the shrunken shell needs it at the top.
    if (window.scrollY !== 0) window.scrollTo(0, 0);

    // Focus revealed the caret before the keyboard shrank the shell.
    requestAnimationFrame(() => {
      const { view } = props;

      if (view.hasFocus() && !view.composing) view.dispatch(view.state.tr.scrollIntoView());
    });
  });

  onCleanup(() => {
    const root = document.documentElement.style;

    root.removeProperty("--app-height");
    root.removeProperty("--editor-toolbar-height");
  });

  const run = (command: Command) => () =>
    command(props.view.state, props.view.dispatch, props.view);

  const mark = (name: string) => () => {
    const type = props.view.state.schema.marks[name];

    if (type) run(toggleMark(type))();
  };

  return (
    <Portal>
      <div
        role="toolbar"
        aria-label="Editing"
        class="fixed inset-x-0 z-40 flex -translate-y-full items-center border-t border-border bg-bg"
        style={{ top: `${viewport().top + viewport().height}px`, height: `${HEIGHT}px` }}
        // Taps must not take focus from the editor, which would close the keyboard.
        onPointerDown={preventDefault}
        onMouseDown={preventDefault}
      >
        <div class="flex min-w-0 flex-1 items-center overflow-x-auto px-1">
          <ToolbarButton label="Undo" disabled={!can().undo} onPress={run(undoCommand)}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton label="Redo" disabled={!can().redo} onPress={run(redoCommand)}>
            <Redo2 />
          </ToolbarButton>
          <ToolbarButton label="Outdent" disabled={!can().dedent} onPress={run(dedent)}>
            <IndentDecrease />
          </ToolbarButton>
          <ToolbarButton label="Indent" disabled={!can().indent} onPress={run(indent)}>
            <IndentIncrease />
          </ToolbarButton>
          <ToolbarButton label="Toggle task" onPress={run(toggleTask)}>
            <ListTodo />
          </ToolbarButton>
          <ToolbarButton label="Toggle list" onPress={run(toggleList)}>
            <List />
          </ToolbarButton>
          <ToolbarButton label="Link a note" onPress={run(insertNoteLink)}>
            <Brackets />
          </ToolbarButton>
          <ToolbarButton label="Link" onPress={() => props.linkEdit.open(props.view)}>
            <Link />
          </ToolbarButton>
          <ToolbarButton label="Bold" onPress={mark("bold")}>
            <Bold />
          </ToolbarButton>
          <ToolbarButton label="Italic" onPress={mark("italic")}>
            <Italic />
          </ToolbarButton>
        </div>
        <div class="shrink-0 border-l border-border px-1">
          <ToolbarButton label="Hide keyboard" onPress={props.onDismiss}>
            <ChevronDown />
          </ToolbarButton>
        </div>
      </div>
    </Portal>
  );
}

function ToolbarButton(props: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      class="flex size-10 shrink-0 items-center justify-center rounded-md text-fg-subtle active:bg-control-hover disabled:opacity-40 [&_svg]:size-5"
      onClick={() => props.onPress()}
    >
      {props.children}
    </button>
  );
}

const dedent = createDedentListCommand();

const indent = createIndentListCommand();

const toggleTask = createToggleListCommand({ kind: "task" });

// Plain lists are collapsible toggles in this app.
const toggleList = createToggleListCommand({ kind: "toggle" });

// Opens the note link autocomplete.
const insertNoteLink: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText("[["));

  return true;
};

// The visible part of the layout viewport; a software keyboard shrinks it.
function createVisualViewport() {
  const viewport = window.visualViewport;

  const read = () => ({
    top: viewport?.offsetTop ?? 0,
    height: viewport?.height ?? window.innerHeight,
  });

  const [rect, setRect] = createSignal(read(), {
    equals: (a, b) => a.top === b.top && a.height === b.height,
  });

  const update = () => setRect(read());

  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  onCleanup(() => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  });

  return rect;
}

function createMediaQuery(query: string) {
  const media = window.matchMedia(query);
  const [matches, setMatches] = createSignal(media.matches);
  const update = () => setMatches(media.matches);

  media.addEventListener("change", update);
  onCleanup(() => media.removeEventListener("change", update));

  return matches;
}

function preventDefault(event: Event) {
  event.preventDefault();
}
