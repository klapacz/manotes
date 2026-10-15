import { Link } from "@tanstack/solid-router";
import { splitProps, type ComponentProps, type Ref } from "solid-js";
import { MatchTag } from "../../lib";
import { callHandler } from "../../lib/call-handler";
import { PaneCursor } from "../../lib/record/pane.cursor";
import { PaneCtx } from "../../lib/record/pane.ctx";
import { PaneMake } from "@manotes/shared/record/pane.make";
import { PaneScroll } from "../../lib/record/pane.scroll";
import { RecordLinkScope, type RecordLinkRenderer } from "../../lib/record/link-component";
import { PaneRecord } from "./pane-record";
import { PaneRecordings } from "./pane-recordings";
import { PaneStream } from "./pane-stream";

export function PaneGrid(props: ComponentProps<"main">) {
  return (
    <main
      {...props}
      class="flex h-full min-h-0 gap-8 snap-x snap-mandatory overflow-x-auto overflow-y-hidden px-[calc((100vw-min(var(--container-pane),100vw))/2)]"
    />
  );
}

export function Pane(props: { ref: Ref<HTMLElement | undefined> }) {
  const ctx = PaneCtx.use();
  const pane = PaneCtx.usePane();
  const scroll = PaneScroll.use();

  const renderRecordLink: RecordLinkRenderer = (linkProps) => {
    const [target, anchorProps] = splitProps(linkProps, ["id", "children", "onClick"]);
    const input = () => PaneMake.record(target.id);

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
    <RecordLinkScope render={renderRecordLink}>
      <MatchTag
        when={pane()}
        cases={{
          recordings: () => <PaneRecordings.Root ref={props.ref} />,
          stream: () => <PaneStream ref={props.ref} />,
          record: () => <PaneRecord ref={props.ref} />,
        }}
      />
    </RecordLinkScope>
  );
}
