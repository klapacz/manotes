import "./editor.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { ProseKit } from "prosekit/solid";
import { createEffect, createMemo, onCleanup, Show, type JSX } from "solid-js";
import * as Y from "yjs";
import {
  defineYjsCommands,
  defineYjsKeymap,
  defineYjsSyncPlugin,
  defineYjsUndoPlugin,
  type YjsSyncPluginOptions,
  type YjsUndoPluginOptions,
} from "prosekit/extensions/yjs";
import { defineAppExtension } from "./editor.extension";
import { MatchTag } from "./lib";
import { LiveDoc } from "./lib/live-doc.service";
import { LiveDocAtom } from "./lib/live-doc.atom";
import { defineReadonly } from "prosekit/extensions/readonly";
import { PropertyDef } from "./components/note/property-def";
import { RuleDef } from "./components/note/rule-def";
import { NotePropGroups } from "./components/note/note-prop-groups";
import { getProsemirrorXmlFragment } from "@manotes/shared/prosemirror/yjs";
import BacklinkMenu, { StreamRefMenu, TabMenu } from "./lib/editor/backlink/menu";
import { Focus } from "./components/note/focus";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { EditorFocus } from "./lib/editor/focus.extension";
import { EditorAttrs } from "./lib/editor/attrs";
import { createLinkEdit, LinkMenu } from "./lib/editor/link/menu";
import { MobileToolbar } from "./lib/editor/mobile-toolbar";
import { SlashMenu } from "./lib/editor/slash-menu";
import { TableControls } from "./lib/editor/table/controls";
import { defineSearchHighlight, setSearchHighlight } from "./lib/editor/search-highlight.extension";

type Props = {
  noteId: NoteSchema.Id;
  attached?: boolean;
  search?: string;
  backlinksTo?: string;
  style?: JSX.CSSProperties;
};

export default function Editor(props: Props): JSX.Element {
  const state = LiveDocAtom.use({ recordId: () => props.noteId });
  const doc = createMemo(() => LiveDoc.readyDoc(state()));

  return (
    <>
      <MatchTag
        when={state()}
        cases={{
          Error: (error) => <p class="mb-3 text-sm text-error-fg">{error().message}</p>,
        }}
      />
      <Show when={doc()} keyed>
        {(doc) => <ReadyEditor {...props} doc={doc} />}
      </Show>
    </>
  );
}

function ReadyEditor(props: Props & { readonly doc: Y.Doc }) {
  const focus = Focus.use();

  const editor = createEditor({
    extension: union([
      defineYjs({ doc: props.doc }),
      defineAppExtension(),
      EditorFocus.define(() => focus.requestParent()),
      defineSearchHighlight(),
    ]),
  });

  onCleanup(() => editor.unmount());

  const attrs = EditorAttrs.use({ doc: () => props.doc });

  createEffect(() => {
    if (!attrs.editable()) onCleanup(editor.use(defineReadonly()));
  });

  createEffect(() => {
    setSearchHighlight(editor.view, props.search ?? "", props.backlinksTo);
  });

  const fid = Focus.useId();

  const fnode = Focus.createNode(() => ({
    id: fid.editor(props.noteId),
    enabled: props.attached ?? true,
    focus: (_element, options) => {
      // The pooled view keeps a live, transaction-mapped selection; reuse it
      // only while visible, so entering a long note does not jump.
      const view = editor.view;
      EditorFocus.placeCaretInView(view);
      view.focus();

      if (options?.reveal) view.dispatch(view.state.tr.scrollIntoView());
    },
  }));

  const linkEdit = createLinkEdit();

  return (
    <ProseKit editor={editor}>
      {/* ProseKit appends node view portals after its children, and Solid
          re-inserts trailing siblings when they mount. Re-inserting the
          autocomplete elements reconfigures the editor mid-transaction,
          which reverts it from Yjs, so keep a single stable child. */}
      <div class="contents">
        <div
          ref={(element) => {
            editor.mount(element);
            fnode.setElement(element);
          }}
          class="outline-none p-4"
          style={props.style}
        />
        <Show when={attrs.definition()}>
          {(definition) => (
            <PropertyDef.Root recordId={props.noteId} doc={props.doc} attrs={definition()} />
          )}
        </Show>
        <Show when={attrs.rule()}>
          {(rule) => <RuleDef.Root recordId={props.noteId} doc={props.doc} attrs={rule()} />}
        </Show>
        <NotePropGroups.Root recordId={props.noteId} doc={props.doc} />
        <BacklinkMenu currentNoteId={props.noteId} />
        <TabMenu />
        <StreamRefMenu />
        <SlashMenu />
        <TableControls />
        <LinkMenu edit={linkEdit} />
        {/* Leaving to the note, like Escape, drops the keyboard; a plain blur gets refocused. */}
        <MobileToolbar linkEdit={linkEdit} onDismiss={() => focus.requestParent()} />
      </div>
    </ProseKit>
  );
}

export interface YjsOptions {
  doc: Y.Doc;
  fragment?: Y.XmlFragment;
  sync?: YjsSyncPluginOptions;
  undo?: YjsUndoPluginOptions;
}

/**
 * @public
 */
export function defineYjs(options: YjsOptions) {
  const { doc, sync, undo } = options;
  const fragment = options.fragment ?? getProsemirrorXmlFragment(doc);

  return withPriority(
    union([
      defineYjsKeymap(),
      defineYjsCommands(),
      defineYjsUndoPlugin({ ...undo }),
      defineYjsSyncPlugin({ ...sync, fragment }),
    ]),
    Priority.high,
  );
}
