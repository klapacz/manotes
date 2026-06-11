import { linkOptions, type LinkOptions } from "@tanstack/solid-router";

export interface GetOptonsOpts {
  id: string;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph/note/$note",
    params: { note: opts.id },
  });
}
