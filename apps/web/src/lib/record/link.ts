import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { RecordSchema } from "@manotes/shared/record.schema";
import { linkOptions, type LinkOptions } from "@tanstack/solid-router";

export interface GetOptonsOpts {
  id: RecordSchema.Id;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph",
    search: { panes: [PaneSchema.make.record({ id: opts.id })] },
    // Panes own their scrolling; see PaneCtx.linkOptions.
    resetScroll: false,
  });
}

export * as RecordLink from "./link";
