# Manotes CLI dogfood wayfinder export

Exported from Hermes Kanban board `manotes-cli-dogfood`. The board was completed before implementation began. This file preserves the decisions needed to continue on another machine.

## Destination

Make the Manotes CLI personally installable, trustworthy for daily use, and easy to understand internally. Start from the existing `kl/cli` implementation and simplify it end to end, not just its public API. Keep direct, documented reuse of web app services where needed. Expose pending publication state and verify the full `init`, `execute`, and `sync` workflow.

## Scope

- Personal dogfood release only. Do not publish to npm.
- Materialized Markdown is read-only input for v1. Writes use `manotes execute`.
- Keep `execute` offline-capable.
- Explicit `sync` publishes local changes and downloads remote changes.
- Do not build a standalone binary or cross-platform release package.

## Decisions

### Personal installation

Ticket: `[research] Choose the personal installation mechanism` (`t_0285175d`)

Run `pnpm add -g .` from `apps/web`. Add a package version, a `manotes` bin entry, and a small `tsx` launcher. Keep the repository workspace and runtime layout instead of publishing or copying a wrapper elsewhere.

### Execute and sync semantics

Ticket: `[research] Trace execute and sync publication semantics` (`t_4eecfe84`)

`execute` commits changes to the local database and works offline. It does not publish implicitly. `sync` explicitly uploads pending local changes and downloads remote changes.

### Agent edit API

Ticket: `[grilling] Define the simplified execute API contract` (`t_c3fa42cb`)

Expose only this autocommitting API:

```ts
type Edit =
  | {
      kind: "replace"
      text: string
      with: string
      occurrence?: number | "all"
    }
  | {
      kind: "append"
      markdown: string
    }

editNote(noteId: string, edits: readonly Edit[]): Promise<void>
```

Apply edits in order. Return `void`. Keep parsing, rendering, transforms, low-level reads, and commit operations private. Making these operations private is not enough: simplify their implementation and remove obsolete code rather than hiding the existing complexity behind this API.

### Easy-to-understand internals

This is an implementation goal, not only an API cleanup. Use `kl/cli` as the starting point because it already connects initialization, script execution, local persistence, materialization, and sync. Its current architecture is not a requirement.

- Keep each command's control flow explicit. A reader should be able to follow loading, editing, saving, and publication without navigating layers of forwarding helpers.
- Give each module a clear responsibility. Use small file-local helpers where sufficient; add abstractions only when they remove duplication or enforce a concrete correctness requirement.
- Remove overlapping edit/commit entry points and unnecessary result bookkeeping. Review optional conveniences such as stdin execution and a global scripting API before carrying them forward.
- Reuse the production repositories, encryption, and sync protocol directly where practical. Do not build a parallel CLI implementation of those services.
- Preserve database consistency, stale-write protection, correct Yjs updates, and reliable sync failure handling. Simplify the code around those requirements rather than deleting the requirements.
- Choose the simplest edit algorithm that preserves content outside the requested edit. Do not retain block-range editing solely because it exists, or replace it with a whole-document Markdown round trip that silently drops tables or other unsupported content. Explicitly reject unsupported edits when necessary.
- Prefer straightforward code over fewer lines. A small public API wrapped around difficult internals does not satisfy this goal.

The main edit path should read as: load the note, apply edits in order, save one local update if changed. The sync path should make exchange, completion checks, materialization, and failure reporting visible. Verify observable behavior while simplifying, including no-op edits, preservation of untouched content, and failed publication.

### Pending publication and recovery

Ticket: `[prototype] Design pending-edit status and recovery` (`t_46df740b`)

- `manotes execute` says that changes were saved locally, prints the total pending count, and points to `manotes sync`.
- `manotes status` reads local state only, prints one total, and exits 0 whether changes are pending or not.
- Call pending event rows `changes`.
- Failed `sync` exits 1, preserves pending rows, reports how many remain, and points to `manotes sync` as the retry command.
- Successful `sync` exits 0 only after pending publication reaches zero.
- Do not persist the last sync result.
- After partial publication, print the published count only if it is cheap to derive.
- Do not add `retry`, `reset`, `force`, `status --json`, note/event listings, or manual repair for permanently rejected changes in this scope.

The approved output sketch is in `pending-edit-status.prototype.md` beside this file.

### Workflow verification

Ticket: `[research] Find a trustworthy full-workflow test harness` (`t_540b938f`)

Automate the CLI workflow as black-box Vitest tests in temporary workspaces. Use a loopback backend assembled from production sync codecs, protocol, repository, encryption, and SQLite components. Do not use a developer's real graph. Keep one later deployed smoke test for Cloudflare authentication, WebSocket upgrades, routing, and Durable Object behavior that a Node fixture cannot cover.

## Deferred

- Decide whether daily use justifies extracting CLI code from the web package.
- Decide whether installation should later move from a source link to a fixed package snapshot.
- Run the deployed Cloudflare smoke test once the local workflow is implemented.

## Implementation handoff

This revision contains planning documents only. The partial implementation previously included here was removed; it is not the implementation base.

Start from a focused squash of the CLI-related changes on `kl/cli`, including the app and worker integration changes it needs. Exclude unrelated agent skills, workflow tooling, and artifacts. Preserve the connected workflow as a starting point, not the existing module layout or abstractions.

Verify the baseline, then simplify the public API and internals in small steps. Add the installation metadata, local pending status, and publication/recovery behavior described above. In particular, the existing sync implementation must not treat ready state alone as completion or log a failure and return success.

Use workflow tests to check required behavior through each simplification. Follow the current repository instructions for verification commands; obtain permission before running tests or checks outside the prescribed command. Do not treat the removed prototype's test results as verification of `kl/cli` or the future implementation.
