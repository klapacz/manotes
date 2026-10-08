import { linkOptions, type LinkOptions } from "@tanstack/solid-router";
import { PaneMake } from "@manotes/shared/note/pane.make";

export interface GetOptonsOpts {
  id: string;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph",
    search: { panes: [PaneMake.note(opts.id)] },
    // Panes own their scrolling; see PaneCtx.linkOptions.
    resetScroll: false,
  });
}

export * as NoteLink from "./link";
