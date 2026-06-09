import { Link, createFileRoute } from "@tanstack/solid-router";
import { Array as Arr, Schema } from "effect";
import { For, Show, splitProps } from "solid-js";
import {
  IncomingBacklinksFetcher,
  IncomingBacklinksSection,
} from "../components/incoming-backlinks";
import Editor from "../editor";
import { parseDailyNoteId } from "../lib/daily-note";
import { NoteLinkScope, type NoteLinkRenderer } from "../lib/note/link-component";

export const Route = createFileRoute("/$graph/canvas")({
  validateSearch: Schema.Struct({
    path: Schema.NonEmptyArray(Schema.String),
  }).pipe(Schema.toStandardSchemaV1),
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return (
    <div class="flex h-svh w-full overflow-x-auto overflow-y-hidden">
      <For each={search().path}>
        {(noteId, index) => (
          <CanvasNoteColumn
            noteId={noteId}
            currentPath={() => Arr.splitAtNonEmpty(search().path, index() + 1)[0]}
          />
        )}
      </For>
    </div>
  );
}

function CanvasNoteColumn(props: {
  noteId: string;
  currentPath: () => Arr.NonEmptyReadonlyArray<string>;
}) {
  const isDaily = () => parseDailyNoteId(props.noteId) !== null;

  const renderNoteLink: NoteLinkRenderer = (linkProps) => {
    const [target, anchorProps] = splitProps(linkProps, ["id", "isDaily", "children"]);

    return (
      <Link
        from="/$graph/canvas"
        to="/$graph/canvas"
        search={{ path: Arr.append(props.currentPath(), target.id) }}
        {...anchorProps}
      >
        {target.children}
      </Link>
    );
  };

  return (
    <NoteLinkScope render={renderNoteLink}>
      <div class="h-full w-[45%] shrink-0 overflow-y-auto border-r border-border-subtle">
        <div class="space-y-8 px-6 py-10">
          <Editor noteId={props.noteId} isDaily={isDaily()} style={{ "min-height": "30svh" }} />

          <IncomingBacklinksFetcher noteId={props.noteId}>
            {(backlinks) => (
              <Show when={backlinks.length > 0}>
                <IncomingBacklinksSection backlinks={backlinks} />
              </Show>
            )}
          </IncomingBacklinksFetcher>
        </div>
      </div>
    </NoteLinkScope>
  );
}
