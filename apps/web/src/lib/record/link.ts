import { linkOptions, type LinkOptions } from "@tanstack/solid-router";
import { PaneMake } from "@manotes/shared/record/pane.make";

export interface GetOptonsOpts {
  id: string;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph",
    search: { panes: [PaneMake.record(opts.id)] },
    // Panes own their scrolling; see PaneCtx.linkOptions.
    resetScroll: false,
  });
}

export * as RecordLink from "./link";
