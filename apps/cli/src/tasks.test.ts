import { readFile } from "node:fs/promises";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Console, Effect } from "effect";
import { expect, it, vi } from "vite-plus/test";
import type { Api } from "@manotes/shared/execute-api";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { CliExecute } from "./cli.execute";
import { CliList } from "@manotes/shared/list";

it("lists active tasks by state and priority using the task script", async () => {
  const script = await readFile(new URL("../../../scripts/tasks", import.meta.url), "utf8");
  const source = script.split("<<'JS'\n")[1]?.replace(/\nJS\s*$/, "");

  if (source === undefined) throw new Error("Missing task board script");

  const api = {
    list: vi.fn<Api["list"]>(async () => {
      return [
        task("HIGH", "in-progress", "high"),
        task("TODO", "todo", "mid"),
        task("DONE", "done", "urgent"),
        task("URGENT", "in-progress", "urgent"),
        { ...task("PROJECT", "todo", "low"), title: "Project" },
        { ...task("INCOMPLETE", "todo", "low"), snippets: ["No assignments."] },
      ];
    }),
    listProps: vi.fn<Api["listProps"]>(async () => []),
    editRecord: vi.fn<Api["editRecord"]>(async () => undefined),
    createRecord: vi.fn<Api["createRecord"]>(async () => RecordSchema.Id.make("unused")),
  };

  const output: string[] = [];

  await Effect.runPromise(
    ExecuteScript.run(source, "tasks.js", api).pipe(
      Effect.provideService(ExecuteScript.Sandbox, CliExecute.nodeSandbox),
      Effect.provideService(Console.Console, {
        ...console,
        log: (...args) => {
          output.push(...args.map(String));
        },
      }),
    ),
  );

  expect(output[0]).toBe("In progress (2)\n");
  expect(output[1]).toContain("task:URGENT task:URGENT 2026-11-08");
  expect(output[2]).toContain("task:HIGH task:HIGH 2026-11-08");
  expect(output[3]).toBe("Todo (1)\n");
  expect(output[4]).toContain("task:TODO task:TODO 2026-11-08");
  expect(output).toHaveLength(5);
  expect(api.editRecord).not.toHaveBeenCalled();
  expect(api.createRecord).not.toHaveBeenCalled();
});

function task(id: string, state: string, priority: string): CliList.Item {
  const assignments = `[State](./state%3A${state}.md) [Priority](./priority:${priority}.md)`;

  return CliList.Item.cases.note.make({
    props: { top: [], groups: [] },
    id: RecordSchema.Id.make(`task:${id}`),
    title: `task:${id}`,
    text: assignments,
    date: "2026-11-08",
    createdAt: "2026-11-08T10:00:00.000Z",
    updatedAt: "2026-11-08T10:00:00.000Z",
    markdown: `# task:${id}\n\n${assignments}\n`,
    snippets: [assignments],
  });
}
