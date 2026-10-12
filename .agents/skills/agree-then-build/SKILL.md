---
name: agree-then-build
description: Agree on direction and minimal implementation using call-stack diffs and TypeScript contracts before building.
---

# Agree then build

Continue from the agreement already reached in the conversation.

## Direction

Restate the intended outcome and scope without proposing implementation.
Wait for confirmation or corrections.

Use grilling when unresolved decisions prevent alignment. Investigate
facts yourself rather than asking the user.

## Proposal

Inspect relevant source and existing abstractions.
Propose the smallest complete implementation. Derive constraints from
the user's requirements and repository evidence, not assumptions.

Show focused call-stack diffs with actual symbols and relevant paths:

```diff
 caller
   existingService
-    oldOperation
+    newOperation
+      existingRepository
```

For a new flow, show a call tree.

List all introduced or changed TypeScript interfaces, types, and function
signatures in TypeScript blocks. Show complete proposed contracts,
not implementation bodies.

Include the verification approach. Keep prose to decisions the diffs
and contracts do not explain.

Revise with the user until approved. Do not implement yet.

## Handoff

If requested, write the agreement to plan-<topic>.md. Include enough
context to implement after compaction: outcome, scope, paths, call-stack
diffs, TypeScript contracts, decisions, and verification.

Implement when instructed. Read the saved plan first, if present.
Agree on necessary deviations before implementing them.

After implementation, verify the final changes and hand over for review.

Before handing over, run this command from the workspace for the completed
Jujutsu change:

```sh
hunk-review --rule 'Match every hunk in test files: filenames containing .test. or .spec., or files under test, tests, or __tests__ directories. Match all changes in those files regardless of their content. For other files, match syntactic import-only edits: all added and removed lines must belong to import declarations. Adding, removing, reordering, or changing named, default, namespace, or type imports qualifies. Ignore unchanged context and whether imported bindings are used outside this hunk. Reject bare side-effect imports with no bindings (such as import "polyfill"), mixed import/code changes, and uncertain cases.' <change-id>
```

This combines all test changes with the CLI's default import-only rule. It
marks matching hunks reviewed in tuicr without removing changes from the diff.
Run it after final edits and verification.

Do not rewrite the plan to match the implementation or review fixes
unless explicitly requested.
