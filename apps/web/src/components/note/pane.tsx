import { Link } from "@tanstack/solid-router";
import { splitProps, type ParentProps, type Ref } from "solid-js";
import { MatchTag } from "../../lib";
import { callHandler } from "../../lib/call-handler";
import { PaneCursor } from "../../lib/note/pane.cursor";
import { PaneCtx } from "../../lib/note/pane.ctx";
import { PaneMake } from "../../lib/note/pane.make";
import { PaneScroll } from "../../lib/note/pane.scroll";
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

export function Pane(props: { ref: Ref<HTMLElement | undefined> }) {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.usePane();
  const scroll = PaneScroll.use();

  const renderNoteLink: NoteLinkRenderer = (linkProps) => {
    const [target, anchorProps] = splitProps(linkProps, ["id", "children", "onClick"]);
    const input = () => PaneMake.note(target.id);

    return (
      <Link
        {...PaneCtx.linkOptions(ctx, PaneCursor.openNext(input()))}
        {...anchorProps}
        onClick={(e) => {
          if (callHandler(e, target.onClick)) return;

          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

          const result = scroll.scrollToPane(input());

          if (result.found) e.preventDefault();
        }}
      >
        {target.children}
      </Link>
    );
  };

  return (
    <NoteLinkScope render={renderNoteLink}>
      <MatchTag
        when={pane()}
        cases={{
          stream: () => <PaneStream ref={props.ref} />,
          note: () => <PaneNote ref={props.ref} />,
        }}
      />
    </NoteLinkScope>
  );
}
