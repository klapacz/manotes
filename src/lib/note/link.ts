import { linkOptions, type LinkOptions } from "@tanstack/solid-router";

export interface GetOptonsOpts {
  id: string;
  isDaily: boolean;
}

export function getOptions(opts: GetOptonsOpts): LinkOptions {
  if (opts.isDaily) {
    return linkOptions({
      from: "/$graph/",
      to: "/$graph",
      search: { date: opts.id },
    });
  }

  return linkOptions({
    from: "/$graph/",
    to: "/$graph/note/$note",
    params: { note: opts.id },
  });
}
