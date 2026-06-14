import { Link } from "@tanstack/solid-router";
import { splitProps, type ParentProps } from "solid-js";
import { MatchTag } from "../../lib";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { NoteLinkScope, type NoteLinkRenderer } from "../../lib/note/link-component";
import { PaneNote } from "./pane-note";
import { PaneStream } from "./pane-stream";

export function PaneGrid(props: ParentProps) {
  return (
    <main class="flex h-full min-h-0 snap-x snap-mandatory overflow-x-auto overflow-y-hidden px-[calc((100vw-min(44rem,100vw))/2)]">
      {props.children}
    </main>
  );
}

export function Pane() {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.usePane();

  const renderNoteLink: NoteLinkRenderer = (linkProps) => {
    const [target, anchorProps] = splitProps(linkProps, ["id", "children"]);

    return (
      <Link
        {...PaneCtx.linkOptions(ctx, PaneCursor.openNext(PaneMake.note(target.id)))}
        {...anchorProps}
      >
        {target.children}
      </Link>
    );
  };

  return (
    <NoteLinkScope render={renderNoteLink}>
      <section class="h-full w-[min(44rem,100vw)] shrink-0 snap-center">
        <MatchTag
          when={pane()}
          cases={{
            stream: () => <PaneStream />,
            note: () => <PaneNote />,
          }}
        />
      </section>
    </NoteLinkScope>
  );
}
