---
title: Implement load_change plugin for including jujutsu diffs
id: "002"
status: planned
priority: medium
depends_on: ["001"]
---

## Context

We have a basic `/include` command that embeds jujutsu change diffs into the conversation. Currently it uses inline shell execution syntax (`!`\`.opencode/bin/jj-diff $1\``), but this approach has limitations:

1. No validation of change IDs
2. No structured error handling
3. Syntax is cryptic and hard to extend

OpenCode supports plugins as a more robust mechanism for extending functionality. A plugin can validate inputs, handle errors gracefully, and provide better integration with the OpenCode runtime.

## Why a Plugin?

Plugins are the right abstraction here because:

- **Validation**: We can use ArkType to validate that change IDs match expected patterns (e.g., jj's change ID format)
- **Error handling**: Plugins can return structured errors instead of raw shell failures
- **Reusability**: Other commands (`/review`, `/devlog`, `/update-devlog`, `/describe`) need the same diff-loading capability
- **Testability**: Plugin logic can be unit tested independently of shell execution

## Goal

Replace the inline shell execution in `/include` with a proper `load_change` plugin that:

1. Validates change ID format using ArkType regex patterns
2. Loads the diff via `jj-diff` script
3. Returns structured output wrapped in semantic tags
4. Handles missing/invalid changes gracefully

## Syntax Change

Current:

```markdown
!`.opencode/bin/jj-diff $1`
```

New:

```markdown
load_change:$1
```

This is cleaner, more intentional, and signals that we're using a plugin rather than arbitrary shell execution.

## Implementation

### Todo

- [ ] Create `.opencode/plugin/load_change.ts` plugin file
- [ ] Define ArkType schema for jujutsu change ID validation (regex pattern)
- [ ] Implement diff loading logic (call `jj-diff` script)
- [ ] Return structured output with `<diff-for-{id}>` wrapper
- [ ] Handle errors (invalid ID format, change not found, jj not available)
- [ ] Update `/include` command to use `load_change:$1` syntax
- [ ] Update `/review` command to use the plugin
- [ ] Update `/devlog` command to use the plugin
- [ ] Document plugin usage in AGENTS.md or similar

### ArkType for Regex Validation

Use ArkType instead of raw regex for change ID validation:

```typescript
import { type } from "arktype";

// Jujutsu change IDs are 8-12 lowercase alphanumeric characters
const ChangeId = type("/^[a-z]{8,12}$/");
```

This gives us:

- Type-safe validation
- Clear error messages
- Composability with other schemas

## Acceptance Criteria

- [ ] `load_change:abc123` syntax works in command templates
- [ ] Invalid change IDs produce clear error messages
- [ ] Missing changes (valid ID but not in repo) handled gracefully
- [ ] All existing commands using diffs migrated to the plugin
- [ ] Plugin is documented

## Constraints

- Must work with jj (not git)
- Validation via ArkType (not raw regex or Zod)
- No interactive prompts—errors returned as structured data
