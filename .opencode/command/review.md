---
description: Review a change and suggest improvements
---

Analyze the change for `$1` and provide feedback on code quality, documentation, and completeness.

## Context

Filtered diff for analysis:
%$1

Change description:
%$1:log

## Instructions

1. Review the diff and description above
2. Check for common issues:
   - **Code quality**: Potential bugs, performance issues, type safety violations
   - **Documentation**: Missing or outdated comments, unclear code
   - **Completeness**: Incomplete implementation, TODO/FIXME comments left in
   - **Consistency**: Deviations from existing patterns in the codebase
   - **Edge cases**: Unhandled error conditions, missing validation

3. Look for existing devlog in the diff:
   - If a `docs/devlog/*.md` file is present, review it for accuracy
   - Check if the devlog matches what the code actually does
   - Verify frontmatter and content follow guidelines

4. Provide structured feedback with:
   - **Summary**: Overall assessment (ready/needs work/blocker)
   - **Issues**: Specific problems found with file:line references
   - **Suggestions**: Optional improvements (non-blocking)
   - **Questions**: Any clarifications needed

## Output Format

Present findings as a concise bulleted list. Group by severity:

- **Must fix**: Critical issues blocking completion
- **Should fix**: Important issues to address
- **Consider**: Optional improvements

Keep feedback actionable and specific.
