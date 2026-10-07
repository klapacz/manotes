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

Do not rewrite the plan to match the implementation or review fixes
unless explicitly requested.
