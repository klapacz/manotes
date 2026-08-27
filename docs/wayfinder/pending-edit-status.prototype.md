# Pending publication status and recovery

Approved throwaway command and output sketch for `[prototype] Design pending-edit status and recovery` (`t_46df740b`). This is a planning artifact, not production code.

## Contract

- `manotes execute` saves locally, stays offline, and prints the total pending count.
- `manotes status` reads local state only, prints one total, and exits 0 whether changes are pending or not.
- The CLI calls pending event rows `changes`.
- `manotes sync` is the retry command. Do not add `retry`, `reset`, or `force`.
- Failed sync exits 1, preserves pending rows, and reports how many changes remain.
- Successful sync exits 0 only after pending publication reaches zero.
- Do not persist the last sync result.
- On partial publication failure, reporting only the remaining count is enough. Report the published count only if it is cheap to derive.

## Output sketch

```console
$ manotes execute edit.ts
Local changes saved.
Pending publication: 2 changes
Run `manotes sync` to publish.
```

```console
$ manotes status
Pending publication: 2 changes
$ echo $?
0
```

```console
$ manotes sync
Sync failed: connection closed before acknowledgement.
Pending publication: 2 changes
Retry with `manotes sync`.
$ echo $?
1
```

```console
$ manotes sync
Sync complete.
Pending publication: 0 changes
$ echo $?
0
```

```console
$ manotes status
Pending publication: 0 changes
$ echo $?
0
```

## Model fit

Pending state comes from local event rows whose `commitSeq` is null. A commit acknowledgement marks the same row committed in place, so retrying `manotes sync` is safe. Sync success requires both ready state and no pending rows. The warning-and-success failure path in `kl/cli` must become exit 1.

Keep this implementation direct: query the existing event state, check publication completion, and report the result. Do not introduce a separate persisted status model or a generic recovery framework. These semantics must remain easy to trace through the command implementation, following the internal simplicity goals in `manotes-cli-dogfood.md`.

## Not decided here

- Machine-readable output such as `status --json`.
- Listing affected notes or individual events.
- Manual repair for permanently rejected changes.
