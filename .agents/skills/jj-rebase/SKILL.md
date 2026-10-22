---
name: jj-rebase
description: Fetch sand, rebase idle workspaces, and rebase the whole task stack.
---

# JJ rebase

1. Record the current workspace and its working-copy change ID. Identify and record the whole task stack before fetching:
   - Include all related descendants and sibling branches, even when `@` is on a lower revision or a separate side branch.
   - Use the conversation and revision graph to identify the task's roots and tips. Do not limit the stack to `sand..@` or assume `@` is its tip.
   - Record change IDs so the intended scope survives automatic rewrites or removal of merged prerequisites during fetch.
   - Exclude unrelated work. Ask only when the task stack's scope cannot be determined.

2. Run:

   ```sh
   jj git fetch
   jj git export
   ```

   Use fetched `sand@origin` as the destination. Stop if it cannot be resolved.

3. Inspect every workspace:
   - Resolve its directory, including the default workspace.
   - Account for unrecorded local edits before classifying it as idle.
   - A workspace is idle only when every revision outside `::sand@origin` in its ancestry is empty.
   - An empty `@` above a non-empty stack is not idle.
   - Do not classify a stale workspace as idle unless its local edits can be safely accounted for. Otherwise skip it and report why.
   - Leave unrelated non-empty stacks untouched. Workspace ownership does not exclude a branch belonging to the recorded task stack.

4. Rebase idle workspaces onto `sand@origin`:
   - Move their empty working-copy revisions onto `sand@origin`.
   - If a workspace points directly to sand history, create an empty child of `sand@origin` instead of rewriting sand history.
   - Skip workspaces already correctly based.
   - Do not update stale working copies yet.

5. Rebase every remaining revision in the recorded task stack onto `sand@origin`:

   ```sh
   jj rebase -r '<recorded task-stack revset>' -d sand@origin
   ```
   - Select surviving change IDs from the recorded stack, including its related sibling branches. Preserve their internal parent relationships.
   - Do not substitute `jj rebase -b @`: after merged prerequisites disappear, it can omit sibling branches that still need rebasing.
   - Resolve conflicts across the whole selected stack, not only those visible at `@`.
   - Preserve change IDs and independently coherent revisions.
   - Resolve conflicts in the first revision needing the resolution.
   - Preserve upstream behavior and the intended changes.
   - Do not add unrelated fixes.
   - Stop and ask if a conflict requires a design decision.

6. After rebasing, run `jj workspace update-stale` in each workspace that needs it. Preserve local edits; never discard them to refresh a workspace.

7. Verify:
   - The original workspace still points to its original change ID.
   - Every branch of the recorded task stack reaches fetched sand and has no unresolved conflicts.
   - Unrelated non-empty stacks were not independently rebased.

8. Report rebased task-stack branches, moved workspaces, skipped workspaces, and conflict resolutions.

Do not push, submit, merge, abandon changes, or delete bookmarks.
