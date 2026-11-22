---
name: manotes-tasks
description: Read and manage Manotes development tasks, including projects, states, priorities, and dependencies.
---

# Manotes tasks

- Purpose: Manage development work in the `manotes` graph.
- Recordbook: The main checkout's `.tasks` directory, shared by all workspaces. Prefix `manotes` commands with `tasks --` to run them there.
- Read [manotes-cli](../manotes-cli/SKILL.md) for querying, creating, editing, and syncing records.
- Graph rules: Read `.tasks/AGENTS.md` with `tasks AGENTS`.

## Read tasks

Run from the repository or a nested workspace, in the Nix devshell:

```sh
# Active tasks, grouped by state and sorted by priority.
tasks

# Complete task body and properties.
tasks ABCD
```

```sh
tasks -- manotes execute <<'JS'
// Unarchived CLI tasks. Assignments are properties, not body links.
const records = await api.list({
  filter: [
    { _tag: "cmp", val: ["_tag", "=", "note"] },
    { _tag: "cmp", val: [["prop", "prop:kind"], "=", { _tag: "enum", val: "option:kind:task" }] },
    { _tag: "cmp", val: [["prop", "prop:project"], "=", { _tag: "link", val: "project:cli" }] },
    { _tag: "cmp", val: [["prop", "builtin:archived"], "=", { _tag: "bool", val: false }] },
  ],
});
await api.showList("short", records);
JS
```

Saved presets are `preset:active` (default, todo and in-progress), `preset:backlog`,
`preset:cli`, `preset:web`, `preset:attention`, and `preset:done`.
CLI and Web exclude done. All presets exclude archived records.
To query a preset, list it by ID and pass its `preset_filter` to `api.list`.
Presets store filters; `tasks` supplies state grouping and priority ordering.
Find dependent tasks with an outgoing body-link filter to the prerequisite task ID.

## Start work

- Before working on a task, append `Session: <id>, cwd: <absolute path>` to its body via `tasks -- manotes execute` and `api.editRecord`. Use `pwd` in the working checkout, not the task recordbook.
- Get your OMP PID with `ps -o pid,ppid,comm -p $$`, following PPIDs if needed. Run `lsof -p <omp-pid> -Fn`, read the open `sessions/...jsonl` file's `type: "session"` header, and use its `id`.

## Complete tasks

- Keep State at `option:state:in-progress` while awaiting user review, even after implementation and verification pass.
- Set State to `option:state:done` only after the user has reviewed and approved the result and explicitly says the task is done. Approval to implement or run checks is not approval to mark it done.

## Create and update tasks

Use `tasks -- manotes execute` for scripts.

- Generate a four-letter code for the ID property:

```sh
pnpx --silent nanoid@5.1.5 --size 4 --alphabet ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

- Check for an existing task with the same `prop:id` text value and regenerate on collision. Keep the code when renaming the task.
- Create with `{ _tag: "note" }` and let Manotes generate the record ID. Existing record IDs remain stable for links.
- Keep one task per record, with a descriptive heading and observable completion criteria. Do not prefix titles with task codes.
- Set ID, Kind, State, Priority, and Project as top-level properties. Do not duplicate assignments in the body.
- `rule:task` requires an explicit ID, State, Priority, and Project when Kind is task. There are no property defaults. New tasks explicitly start at backlog and mid unless requested otherwise.

| Property ID | Type | Values |
| --- | --- | --- |
| `prop:id` | text | Unique four-letter task code, such as `ABCD` |
| `prop:kind` | enum | `option:kind:task`, `option:kind:project` |
| `prop:state` | enum | `option:state:backlog`, `option:state:todo`, `option:state:in-progress`, `option:state:done` |
| `prop:priority` | enum | `option:priority:urgent`, `option:priority:high`, `option:priority:mid`, `option:priority:low` |
| `prop:project` | link | `project:web`, `project:cli`, or another unarchived note with Kind = project |

```js
// Use a newly generated, unused four-letter code in place of ABCD.
const code = "ABCD";
const existing = await api.list({ filter: [
  { _tag: "cmp", val: [["prop", "prop:kind"], "=", { _tag: "enum", val: "option:kind:task" }] },
  { _tag: "cmp", val: [["prop", "prop:id"], "=", { _tag: "text", val: code }] },
] });
if (existing.length > 0) throw new Error("Task code already exists; generate another");
const id = await api.createRecord({ _tag: "note" }, [
  { kind: "body.append", markdown: "# Short description\n\nDescribe the work.\n\n## Done when\n\n- State the observable completion condition." },
  { kind: "prop.set", propId: "prop:id", value: { _tag: "text", val: code } },
  { kind: "prop.set", propId: "prop:kind", value: { _tag: "enum", val: "option:kind:task" } },
  { kind: "prop.set", propId: "prop:state", value: { _tag: "enum", val: "option:state:backlog" } },
  { kind: "prop.set", propId: "prop:priority", value: { _tag: "enum", val: "option:priority:mid" } },
  { kind: "prop.set", propId: "prop:project", value: { _tag: "link", val: "project:cli" } },
]);
await api.showList("full", await api.list({ filter: [{ _tag: "cmp", val: ["id", "=", id] }] }));
```

- Change an assignment with `prop.set`, omitting `ruleId` because the Task rule uses top-level storage. Read the record again to check validity.
- Identify tasks by Kind, not their title or body. Use `tasks ABCD` to find a task by its ID property. The command also accepts actual record IDs.
- `api.editRecord` and dependency links require the actual `record.id`, not the four-letter ID property. Do not rename existing record IDs.
- Project pages have Kind = `option:kind:project`; the Project property's target filter discovers them.
- Use project headings such as `# 💻 CLI` and `# 🌐 Web`, without `project:` prefixes. State and priority option headings start with their emoji.
- Link dependencies to the prerequisite task's actual record ID, using its descriptive title as the label.
- The old `state:*` and `priority:*` notes are archived history. Do not use them for assignments or queries.
