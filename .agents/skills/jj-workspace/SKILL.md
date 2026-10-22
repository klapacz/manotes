---
name: jj-workspace
description: Create shared JJ workspaces and bootstrap T3 worktrees.
---

# JJ workspace

Requires JJ 0.46+. Never run `jj git init` in a worktree.

For manual creation, run from the source workspace. Choose a task name and use the requested revision, or `@`:

```sh
project_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
workspace_name="task-name"
workspace_path="$project_root/.workspace/$workspace_name"
mkdir -p "$project_root/.workspace"
jj workspace add --colocate --name "$workspace_name" -r @ "$workspace_path"
cd "$workspace_path"
direnv allow
scripts/nix-develop -c sh "$project_root/scripts/setup"
```

For app work, copy worker `.env.local` and `.env.prod` from the source when present, without printing their contents.

- T3's `t3.json` hook converts fresh Git worktrees at the same path and runs setup. Delegated worktree launches can skip the hook; run the setup command above explicitly if needed. Report setup failures before editing.
- Before implementation, confirm parent registration with `jj -R "$project_root" workspace list`, colocation, and matching Git/JJ roots.
- Attach existing workspaces in the same T3 project with `workspaceStrategy: { type: "existing_worktree", worktreePath: workspacePath }`. Omit `branch` for detached HEAD and verify the recorded path. Changing directory in a root-bound thread does not attach it.
