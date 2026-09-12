---
name: manotes-cli
description: Read, filter, and edit Manotes notes with zk and the CLI, then sync changes.
---

# Manotes CLI

- Purpose: Read and filter Manotes notes with zk; edit through `manotes execute`.
- Workspace: Use the current directory unless told otherwise.
- Read `<note-id>.md` files, but never edit them or `.manotes/` directly.
- Metadata: Frontmatter `date` is the logical assigned date, called `created` in zk. `modified` is the last update in UTC.
- Setup: Consult `manotes init --help`.

## Filter notes

- Default command: `zk list --format short [filters]`.
- Prefer zk for filtering and sorting notes.
- Filter and sort by `created` unless asked about updates or modifications. "Recent", "latest", and "newest" mean `--sort created-`.
- Date output: Keep filenames and dates together with `--format '{{path}}\t{{created}}'`. Use `{{modified}}` for update queries.
- Read selected files when snippets aren't enough.
- If query output is truncated, consider rerunning with fewer output fields.
- Path arguments accept filenames, directories, or ID prefixes.
- For filenames only, use `--format '{{path}}'`.

| Find                                    | Filters                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specific paths; exclude paths           | Positional `path ...`; `--exclude path`                                                                                                               |
| Title/body text                         | `--match 'query'`; repeat for AND                                                                                                                     |
| Literal text, including punctuation     | `--match-strategy exact --match 'text'`, case-insensitive                                                                                             |
| Regular expression                      | `--match-strategy re --match 'regex'`, RE2 syntax                                                                                                     |
| Tags                                    | `--tag 'a,b'` for AND, `'a OR b'` for OR, `'NOT a'` to exclude, `'topic/*'` for glob; `--tagless`                                                     |
| Assigned date                           | `--created 2026-09-12`; `--created-after DATE`, `--created-before DATE`                                                                               |
| Last update                             | `--modified DATE`; `--modified-after DATE`, `--modified-before DATE`                                                                                  |
| Notes linking to ID                     | `--link-to ID.md`; inverse: `--no-link-to ID.md`                                                                                                      |
| Notes ID links to                       | `--linked-by ID.md`; inverse: `--no-linked-by ID.md`                                                                                                  |
| Indirect links                          | Add `--recursive` and optionally `--max-distance N` to a link filter                                                                                  |
| Unconnected notes sharing a linked note | `--related ID.md`                                                                                                                                     |
| Notes mentioning a note's title         | `--mention ID.md`; add `--no-link-to ID.md` for unlinked mentions                                                                                     |
| Notes whose titles a note mentions      | `--mentioned-by ID.md`; add `--no-linked-by ID.md` for unlinked mentions                                                                              |
| Link maintenance                        | `--orphan` for no incoming links; `--missing-backlink` for an incoming link not reciprocated; `--broken-links` for broken outgoing links              |
| Order and cap results                   | `--sort created-,title+`; criteria: `created`, `modified`, `path`, `title`, `word-count`, `random`. Suffix `+` ascending, `-` descending; `--limit N` |

- Text matching: Case-insensitive full-text search by default. Quote queries for the shell.
- Full-text syntax: `a b` for AND, `a OR b`, `a NOT b`, `"exact phrase"`, `(a OR b) c`, `prefix*`, `title: term`, `body: term`, `title: ^first`.
- With `--match-strategy exact`, pass literal text.
- Date syntax: ISO dates/times or quoted relative dates such as `'last monday'`.

```sh
# Three most recent notes linking to a project, by logical date.
zk list --format '{{path}}\t{{created}}' \
  --link-to PROJECT_ID.md --sort created- --limit 3
```

zk 0.15.6 limitations:

- Run zk commands one at a time.
- Use `--match-strategy exact` when combining text and link filters.

[Filtering reference](https://zk-org.github.io/zk/notes/note-filtering.html).

## Edit notes

- Body edits exclude frontmatter. Use a `date` action to change the assigned date.
- Default-export an async function receiving this API:

```ts
type Edit =
  | { kind: "replace"; text: string; with: string; occurrence?: number | "all" }
  | { kind: "append"; markdown: string }
  | { kind: "date"; date: string }; // YYYY-MM-DD

type Api = {
  editNote(noteId: string, edits: readonly Edit[]): Promise<void>;
};
```

- Note ID: Filename without `.md`.
- Edits run in order; each awaited `editNote` call saves independently.
- Replacement text matches literal Markdown in the body, not a regex.
- Occurrence: Omit for exactly one match; otherwise use a zero-based index or `"all"`.
- Delete: Set `with: ""`.

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

Saved script: `manotes execute edit.ts`.

## Sync

- `manotes sync` publishes local edits and downloads remote changes.
- `execute` saves locally and never syncs automatically.
