---
name: dune-forward
description: Run full validation, advance dune to this thread's completed change, and ask before pushing to all remotes.
---

# Dune forward

Identify the completed change or stack tip in the thread's workspace. Inspect its status and diff; ask if the target is unclear. Preserve unrelated work.

## Validation

Invoking this skill authorizes these commands on the target contents. Include any newly added suites. Failures block submission; fix them and rerun on the final contents.

```sh
scripts/nix-develop -c vp check --fix
scripts/nix-develop -c vp test run --exclude 'apps/cli/**' --exclude 'apps/web/**' --exclude 'packages/date-time-picker/**'
scripts/nix-develop -c pnpm -r --if-present test
```

## Submission

Move `dune` with `jj bookmark move dune --to <change-id>`. Stop if it would move backwards or sideways. Do not rebase or move other bookmarks or workspaces.

List remotes with `jj git remote list`. Dry-run each with `jj git push --remote <remote> --bookmark dune --dry-run`. Stop on failure or if no remotes exist.

Report validation results and ask: "Submit dune at <commit> to all configured remotes, <names>?" Wait for approval. If declined, leave dune moved locally.

Before pushing, verify the validated commit and remotes are unchanged. Otherwise revalidate and renew approval. Push only dune to each remote with `jj git push --remote <remote> --bookmark dune`. Stop on failure and report successes and remaining remotes. Do not settle the thread.
