---
name: manotes-cli
description: Read, filter, and edit Manotes notes with zk and the CLI, then sync changes.
---

# Manotes CLI

Manotes is an encrypted note-taking app with a CLI for reading and editing notes locally. Work in the current directory unless told otherwise. Read and search the `<note-id>.md` files, but never edit them or files inside `.manotes/` directly. Make changes through `manotes execute`. For first-time setup, consult `manotes init --help`.

Each note file starts with read-only frontmatter: `date` is the logical date the note is assigned to, not when it was created; zk calls it `--created`. `modified` is its last-update timestamp in UTC. Body edits apply below frontmatter; use a `date` action to change the assigned date.

## Filter notes

Use `zk list --no-input --no-pager --quiet --format json [filters]` from the notes directory. Combine filters to narrow results; paths accept filenames, directories, or ID prefixes. Read the returned files for full content.

| Find                                    | Filters                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Specific paths; exclude paths           | Positional `path ...`; `--exclude path`                                                                                                                |
| Title/body text                         | `--match 'query'`; repeat for AND                                                                                                                      |
| Literal text, including punctuation     | `--match-strategy exact --match 'text'`, case-insensitive                                                                                              |
| Regular expression                      | `--match-strategy re --match 'regex'`, RE2 syntax                                                                                                      |
| Tags                                    | `--tag 'a,b'` for AND, `'a OR b'` for OR, `'NOT a'` to exclude, `'topic/*'` for glob; `--tagless`                                                      |
| Assigned date                           | `--created 2026-09-12`; `--created-after DATE`, `--created-before DATE`                                                                                |
| Last update                             | `--modified DATE`; `--modified-after DATE`, `--modified-before DATE`                                                                                   |
| Backlinks to a note                     | `--link-to ID.md`; inverse: `--no-link-to ID.md`                                                                                                       |
| Outgoing targets of a note              | `--linked-by ID.md`; inverse: `--no-linked-by ID.md`                                                                                                   |
| Indirect links                          | Add `--recursive` and optionally `--max-distance N` to a link filter                                                                                   |
| Unconnected notes sharing a linked note | `--related ID.md`                                                                                                                                      |
| Notes mentioning a note's title         | `--mention ID.md`; add `--no-link-to ID.md` for unlinked mentions                                                                                      |
| Notes whose titles a note mentions      | `--mentioned-by ID.md`; add `--no-linked-by ID.md` for unlinked mentions                                                                               |
| Link maintenance                        | `--orphan` for no incoming links; `--missing-backlink` for an incoming link not reciprocated; `--broken-links` for broken outgoing links               |
| Order and cap results                   | `--sort modified-,title+`; criteria: `created`, `modified`, `path`, `title`, `word-count`, `random`. Suffix `+` ascending, `-` descending; `--limit N` |

Default text matching is case-insensitive FTS. Query syntax: `a b` AND, `a OR b`, `a NOT b` or `a -b`, `"exact phrase"`, `(a OR b) c`, `prefix*`, `title: term`, `body: term`, `title: ^first`. Quote queries for the shell. Dates accept ISO dates/times or quoted relative dates such as `'last monday'`.

Use `--format jsonl` for one JSON object per note, or `--format '{{path}}'` for paths only; add `--delimiter0` for NUL-separated paths. Empty JSON results may produce no output, not `[]`.

```sh
# Notes assigned to a day that link to a project, newest update first.
zk list --no-input --no-pager --quiet --format json \
  --link-to PROJECT_ID.md --created 2026-09-12 --sort modified- --limit 20
```

zk 0.15.6 caveats: FTS combined with link filters can incorrectly return nothing; use `exact` or select linked paths first and search those separately. Indexed assigned dates can stay stale after date edits even with `zk index --force`; verify against frontmatter. Avoid concurrent zk calls that auto-index.

[Filtering reference](https://zk-org.github.io/zk/notes/note-filtering.html).

## Edit notes

Scripts must default-export an async function receiving this API:

```ts
type Edit =
  | { kind: "replace"; text: string; with: string; occurrence?: number | "all" }
  | { kind: "append"; markdown: string }
  | { kind: "date"; date: string }; // YYYY-MM-DD

type Api = {
  editNote(noteId: string, edits: readonly Edit[]): Promise<void>;
};
```

Use the filename without `.md` as the note ID. Edits run in order. Each awaited `editNote` call saves independently. Replacement text matches Markdown in the note body directly, not as a regex. Omit `occurrence` to require exactly one match, use a zero-based index to select a match, or `"all"` to replace every match. Set `with: ""` to delete matched text.

```sh
manotes execute <<'JS'
export default async (api) => {
  await api.editNote("note-id", [
    { kind: "replace", text: "# Draft", with: "# Plan" },
    { kind: "replace", text: "TODO", with: "Done", occurrence: 0 },
    { kind: "replace", text: "(obsolete)", with: "", occurrence: "all" },
    { kind: "append", markdown: "\n## Next steps\n\n- Review the plan." },
    { kind: "date", date: "2026-09-12" },
  ]);
};
JS
```

To run a saved script instead, use `manotes execute edit.ts`.

## Sync

Run `manotes sync` to publish local edits and download remote changes. Editing works offline; `execute` does not sync automatically.
