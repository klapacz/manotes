import { Link } from "@tanstack/solid-router";
import { Stream } from "effect";
import { createEffect, For, onCleanup, Show, type JSX } from "solid-js";
import { ProseKit } from "prosekit/solid";
import { createEditor, union } from "prosekit/core";
import { defineReadonly } from "prosekit/extensions/readonly";
import { defineAppExtension } from "../editor.extension";
import * as BacklinkService from "../lib/materializer/backlink/service";
import * as EditorNoteBootCache from "../lib/editor/note-boot-cache.service";
import * as NoteLink from "../lib/note/link";
import { RtAtom } from "../lib";

function IncomingBacklinksStore(props: {
  noteId: string;
  children: (backlinks: BacklinkService.IncomingBacklinkPreview[]) => JSX.Element;
}) {
  const backlinks = RtAtom.useStore(
    RtAtom.atom(
      EditorNoteBootCache.Service.use((cache) => cache.incomingBacklinkChanges(props.noteId)).pipe(
        Stream.unwrap,
      ),
    ),
    [] as BacklinkService.IncomingBacklinkPreview[],
  );

  return props.children(backlinks);
}

export function IncomingBacklinksFetcher(props: {
  noteId: string;
  children: (backlinks: BacklinkService.IncomingBacklinkPreview[]) => JSX.Element;
}) {
  return (
    // Key by noteId so virtualized/reused rows fully reset the atom-backed store
    // instead of briefly showing backlinks from the previous note.
    <Show when={props.noteId} keyed>
      {(noteId) => (
        <IncomingBacklinksStore noteId={noteId}>{props.children}</IncomingBacklinksStore>
      )}
    </Show>
  );
}

export function IncomingBacklinks(props: { children: JSX.Element }) {
  return <section class="rounded-md bg-bg-subtle py-4">{props.children}</section>;
}

export function IncomingBacklinksHeader() {
  return <h2 class="px-4 pb-6 text-xs uppercase tracking-wide text-fg-subtle">Backlinks</h2>;
}

export function IncomingBacklinksList(props: { children: JSX.Element }) {
  return <div class="flex flex-col gap-4">{props.children}</div>;
}

export function IncomingBacklinksSection(props: {
  backlinks: BacklinkService.IncomingBacklinkPreview[];
}): JSX.Element {
  return (
    <IncomingBacklinks>
      <IncomingBacklinksHeader />
      <Show when={props.backlinks.length > 0}>
        <IncomingBacklinksList>
          <For each={props.backlinks}>{(backlink) => <BacklinkSnippet backlink={backlink} />}</For>
        </IncomingBacklinksList>
      </Show>
    </IncomingBacklinks>
  );
}

export function BacklinkSnippet(props: {
  backlink: BacklinkService.IncomingBacklinkPreview;
}): JSX.Element {
  const editor = createEditor({
    extension: union([defineAppExtension({ isDaily: true }), defineReadonly()]),
  });

  createEffect(() => editor.setContent(props.backlink.preview));
  onCleanup(() => editor.unmount());

  return (
    <div class="px-4">
      <Link
        {...NoteLink.getOptions(props.backlink)}
        class="text-sm text-fg hover:text-primary-fg transition-colors"
      >
        {props.backlink.title}
      </Link>

      <ProseKit editor={editor}>
        <div ref={editor.mount} class="text-fg-subtle text-sm" />
      </ProseKit>
    </div>
  );
}
