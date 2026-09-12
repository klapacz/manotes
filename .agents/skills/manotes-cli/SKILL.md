---
name: manotes-cli
description: Read and edit Manotes notes with the CLI, then sync changes.
---

# Manotes CLI

Manotes is an encrypted note-taking app with a CLI for reading and editing notes locally. Work in the current directory unless told otherwise. Read and search the `<note-id>.md` files, but never edit them or files inside `.manotes/` directly. Make changes through `manotes execute`. For first-time setup, consult `manotes init --help`.

Each note file starts with read-only frontmatter: `date` is the note's date and `updated_at` is its last-update timestamp in UTC. Body edits apply below it; use a `date` action to change the note's date.

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
