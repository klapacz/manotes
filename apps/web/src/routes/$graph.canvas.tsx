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
            index={index}
            canvasPath={() => search().path}
            currentPath={() => Arr.splitAtNonEmpty(search().path, index() + 1)[0]}
          />
        )}
      </For>
    </div>
  );
}

function CanvasNoteColumn(props: {
  noteId: string;
  index: () => number;
  canvasPath: () => Arr.NonEmptyReadonlyArray<string>;
  currentPath: () => Arr.NonEmptyReadonlyArray<string>;
}) {
  const isDaily = () => parseDailyNoteId(props.noteId) !== null;
  const rebasePath = () =>
    // Prepend the current note so the rebased path stays typed as non-empty.
    Arr.prepend(Arr.drop(props.canvasPath(), props.index() + 1), props.noteId);
  const closePath = () => Arr.splitAtNonEmpty(props.canvasPath(), props.index())[0];

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
        <div class="px-6 pb-10">
          <div class="flex h-10 items-center gap-3 text-xs leading-none">
            <Show when={props.index() > 0}>
              <Link
                from="/$graph/canvas"
                to="/$graph/canvas"
                search={{ path: rebasePath() }}
                class="text-fg-subtle underline-offset-4 hover:text-fg hover:underline"
              >
                rebase
              </Link>

              <Link
                from="/$graph/canvas"
                to="/$graph/canvas"
                search={{ path: closePath() }}
                class="text-fg-subtle underline-offset-4 hover:text-fg hover:underline"
              >
                close
              </Link>
            </Show>
          </div>

          <div class="space-y-8">
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
      </div>
    </NoteLinkScope>
  );
}
