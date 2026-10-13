---
name: chunks-then-build
description: Agree on an implementation one small code chunk at a time, approve all chunks before building, then review implementation deviations chunk by chunk.
---

# Chunks then build

Continue from the agreement already reached in the conversation. Keep track of
approved chunks and unresolved pieces; do not restart approved discussions.

## Direction

Agree on the intended outcome and scope before proposing implementation.
Use grilling when unresolved decisions prevent alignment. Investigate facts
yourself rather than asking the user.

## Chunks

Inspect relevant source and existing abstractions. Propose the smallest complete
implementation, using repository evidence and the user's requirements.

Start with a focused call-stack diff using actual symbols and paths, or a call
tree for a new flow. Show where a new function will be called before discussing
its body. Distinguish existing code from proposed replacements and additions.

Walk through one small chunk at a time. Show the relevant implementation body
and TypeScript contracts, explain its inputs and output, and describe how it
connects to the preceding and following chunks. Include concise comments that
explain what the code achieves. Avoid unexplained helpers; return to their
bodies in subsequent chunks.

Wait for approval or corrections before moving to the next chunk. Adapt the
chunk size to the reader. Keep prose short and avoid repeating approved scope.
When a later decision changes an approved chunk, show that change explicitly.

Cover all introduced or changed types, signatures, function bodies, callers,
and the verification approach. Agree on the complete set of chunks before
editing implementation files. Approval of an individual chunk advances the
discussion; it does not authorize building early.

## Build

Implement when instructed after the chunks are agreed. If requested, preserve
the agreement in plan-<topic>.md, including the outcome, paths, call stacks,
contracts, decisions, and checks. Read that plan before implementing.

Keep a list of implementation details that were not covered by the approved
chunks. Complete routine details within the agreed scope, then disclose them
after implementation. If a necessary deviation changes agreed behavior or
scope, agree on it before proceeding with the affected work.

Verify the implementation under repository rules and existing user permissions.
Do not rewrite an agreed plan to match implementation or review fixes unless
explicitly requested.

## Review

After building, report the outcome and verification, then walk through any
unagreed implementation details one chunk at a time. Show each actual change,
where it is used, and why it was needed. Wait for approval or corrections
before the next deviation. If there were none, say so.

Before handing over, run this command from the workspace for the completed
Jujutsu change:

```sh
hunk-review --rule 'Match every hunk in test files: filenames containing .test. or .spec., or files under test, tests, or __tests__ directories. Match all changes in those files regardless of their content. For other files, match syntactic import-only edits: all added and removed lines must belong to import declarations. Adding, removing, reordering, or changing named, default, namespace, or type imports qualifies. Ignore unchanged context and whether imported bindings are used outside this hunk. Reject bare side-effect imports with no bindings (such as import "polyfill"), mixed import/code changes, and uncertain cases.' <change-id>
```

This marks test changes and import-only hunks reviewed in tuicr. Run it after
final edits and verification. Report a failure without claiming review state
was updated.
