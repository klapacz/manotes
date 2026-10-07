import type { ComponentProps } from "solid-js";
import { AudioMemo } from "../audio-memo";
import { Focus } from "./focus";
import { PaneHeader, PaneShell } from "./shared";

export function Root(props: ComponentProps<"section">) {
  const fid = Focus.useId();

  const fnode = Focus.createNode(() => ({
    id: fid.pane(),
    focus: Focus.focusBrowseTarget,
  }));

  return (
    <Focus.NodeProvider node={fnode}>
      <Focus.Element as={PaneShell} {...props}>
        <PaneHeader />
        <div class="min-h-0 flex-1 overflow-y-auto">
          <AudioMemo.RecordingList />
        </div>
      </Focus.Element>
    </Focus.NodeProvider>
  );
}

export * as PaneRecordings from "./pane-recordings";
