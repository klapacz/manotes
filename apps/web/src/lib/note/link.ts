import { linkOptions, type LinkOptions } from "@tanstack/solid-router";
import { PaneMake } from "./pane.make";

export interface GetOptonsOpts {
  id: string;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph",
    search: { panes: [PaneMake.note(opts.id)] },
  });
}
