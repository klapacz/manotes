---
title: Migrate devlog validation to Astro Content Collections
id: PGEE
status: planned
priority: medium
depends_on: []
---

## Context

The current devlog validation system uses:

- Custom Zod schema (`.opencode/schemas/devlog.ts`)
- OpenCode plugin for real-time validation on Edit/Write (`.opencode/plugin/devlog-validator.ts`)
- CLI script for batch validation (`.opencode/scripts/validate-devlogs.ts`)
- gray-matter for frontmatter parsing (`.opencode/lib/frontmatter.ts`)

This works but adds custom tooling that duplicates what Astro Content Collections provides natively.

## Goal

Replace custom devlog validation with Astro Content Collections when adding the project website. This consolidates validation into a single source of truth and enables the "developer feed" feature.

## Proposed Structure

```
manotes-rewrite/
├── apps/
│   └── site/                    # Astro project
│       ├── src/
│       │   └── content.config.ts  # Defines devlog collection
│       └── astro.config.mjs
├── docs/
│   └── devlog/                  # Devlog entries (moved from root)
│       └── *.md
└── ...
```

## Implementation Plan

### Phase 1: Add Astro Site

1. Create `apps/site/` with minimal Astro setup
2. Configure pnpm workspace to include `apps/*`
3. Define devlog collection in `content.config.ts`:

   ```ts
   import { defineCollection, z } from "astro:content";
   import { glob } from "astro/loaders";

   const BaseSchema = z.object({
     title: z.string().min(1),
     date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
     tags: z.array(z.string()).min(1),
   });

   const devlogs = defineCollection({
     loader: glob({ pattern: "**/*.md", base: "../../docs/devlog" }),
     schema: z.discriminatedUnion("type", [
       BaseSchema.extend({ type: z.literal("shipped") }),
       BaseSchema.extend({
         type: z.literal("snippet"),
         status: z.enum(["working", "experimental", "broken", "deprecated"]),
         diff_file: z.string().min(1),
       }),
     ]),
   });

   export const collections = { devlogs };
   ```

### Phase 2: Update Validation

**Option A: Replace plugin with `astro check`**

- Modify OpenCode plugin to run `astro check` on devlog writes
- Slower (~1-3s) but single source of truth
- Plugin becomes thin wrapper around `astro check`

**Option B: Remove real-time validation**

- Delete the OpenCode plugin entirely
- Rely on `astro check` in CI or as part of lint script
- Simpler, but no immediate feedback during editing

### Phase 3: Cleanup

Delete custom tooling:

- `.opencode/plugin/devlog-validator.ts`
- `.opencode/lib/validate.ts`
- `.opencode/lib/frontmatter.ts`
- `.opencode/schemas/devlog.ts`
- `.opencode/scripts/validate-devlogs.ts`

Update lint script:

```json
{
  "lint:devlog": "pnpm --filter site astro check"
}
```

### Phase 4: Developer Feed

Build out the Astro site to serve devlogs publicly:

- RSS feed for subscribers
- Index page with all devlogs
- Individual devlog pages with rendered markdown

## Astro Collections Key Points

- `glob()` loader can reference directories outside project via relative paths (`../../docs/devlog`)
- `astro check` validates all collections against their schemas
- Auto-generates TypeScript types in `.astro/`
- Generates JSON schemas for editor IntelliSense

## Open Questions

1. **Real-time vs CI validation?** — Is toast feedback on write valuable enough to keep the plugin (calling `astro check`), or is CI-time validation sufficient?

2. **Monorepo structure?** — `apps/site/` vs `site/` vs something else?

3. **Devlog location?** — Decided: `docs/devlog/`

## Acceptance Criteria

- [ ] Astro site created with devlog collection
- [ ] Collection loads devlogs from `docs/devlog/`
- [ ] Schema matches current Zod schema behavior
- [ ] `astro check` validates frontmatter correctly
- [ ] Custom validation tooling removed
- [ ] Developer feed renders devlogs publicly

## Relevant Files

- `.opencode/schemas/devlog.ts` — current schema (will be migrated)
- `.opencode/plugin/devlog-validator.ts` — current validator (will be deleted)
- `docs/devlog/2026-01-01-devlog-system.md` — references this task
