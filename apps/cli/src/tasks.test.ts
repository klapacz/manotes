import { readFile } from "node:fs/promises";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Console, Effect } from "effect";
import { expect, it, vi } from "vite-plus/test";
import type { Api } from "@manotes/shared/execute-api";
import { ExecuteScript } from "@manotes/shared/execute-script";
import { CliExecute } from "./cli.execute";
import { CliList } from "@manotes/shared/list";
import { Attrs } from "@manotes/shared/attrs.service";
import { AttrsSchema } from "@manotes/shared/attrs.schema";

it("lists active tasks by state and priority using the task script", async () => {
  const script = await readFile(new URL("../../../scripts/tasks", import.meta.url), "utf8");
  const source = script.split("<<'JS'\n")[1]?.replace(/\nJS\s*$/, "");

  if (source === undefined) throw new Error("Missing task board script");

  const api = {
    list: vi.fn<Api["list"]>(async () => {
      return [
        task("HIGH", "in-progress", "high"),
        { ...task("TODO", "todo", "mid"), title: "Write CLI docs" },
        task("DONE", "done", "urgent"),
        task("URGT", "in-progress", "urgent"),
        { ...task("MISS", "todo", "low"), props: { top: [], groups: [] } },
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

  expect(output[0]).toBe("🚧 In progress (2)\n");
  expect(output[1]).toContain("URGT Task URGT 2026-11-08");
  expect(output[2]).toContain("HIGH Task HIGH 2026-11-08");
  expect(output[3]).toBe("📋 Todo (1)\n");
  expect(output[4]).toContain("TODO Write CLI docs 2026-11-08");
  expect(output[4]).toContain("💻 CLI · 🟡 Mid");
  expect(output[4]).toContain("Task context.");
  expect(output).toHaveLength(5);
  expect(output.join("\n")).not.toContain("record-");
  expect(api.list).toHaveBeenCalledWith({
    filter: [
      AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "note"] }),
      AttrsSchema.makeFilterExpr.cmp({
        val: [
          ["prop", RecordSchema.Id.make("prop:kind")],
          "=",
          AttrsSchema.PropVal.cases.enum.make({ val: RecordSchema.Id.make("option:kind:task") }),
        ],
      }),
      AttrsSchema.makeFilterExpr.cmp({
        val: [
          ["prop", RecordSchema.Id.make("builtin:archived")],
          "=",
          AttrsSchema.PropVal.cases.bool.make({ val: false }),
        ],
      }),
      AttrsSchema.makeFilterExpr.or({
        val: ["in-progress", "todo"].map((state) => {
          return AttrsSchema.makeFilterExpr.cmp({
            val: [
              ["prop", RecordSchema.Id.make("prop:state")],
              "=",
              AttrsSchema.PropVal.cases.enum.make({
                val: RecordSchema.Id.make(`option:state:${state}`),
              }),
            ],
          });
        }),
      }),
    ],
  });
  expect(api.editRecord).not.toHaveBeenCalled();
  expect(api.createRecord).not.toHaveBeenCalled();
});

function task(
  id: string,
  state: string,
  priority: "urgent" | "high" | "mid" | "low",
): CliList.Item {
  return CliList.Item.cases.note.make({
    props: {
      top: [
        prop("id", "text", id, id),
        prop("kind", "enum", "option:kind:task", "Task"),
        prop("state", "enum", `option:state:${state}`, state),
        prop(
          "priority",
          "enum",
          `option:priority:${priority}`,
          { urgent: "🔥 Urgent", high: "🔴 High", mid: "🟡 Mid", low: "🟢 Low" }[priority],
        ),
        prop("project", "link", "project:cli", "💻 CLI"),
      ],
      groups: [],
    },
    id: RecordSchema.Id.make(`record-${id}`),
    title: `Task ${id}`,
    text: "Task context.",
    date: "2026-11-08",
    createdAt: "2026-11-08T10:00:00.000Z",
    updatedAt: "2026-11-08T10:00:00.000Z",
    markdown: `# Task ${id}\n\nTask context.\n`,
    snippets: ["Task context."],
  });
}

function prop(
  name: string,
  type: "enum" | "link" | "text",
  value: string,
  label: string,
): CliList.Item["props"]["top"][number] {
  return {
    propId: RecordSchema.Id.make(`prop:${name}`),
    label: name,
    def: null,
    expectation: null,
    value: {
      state: Attrs.ValueState.Valid({
        value: AttrsSchema.PropVal.cases[type].make({ val: RecordSchema.Id.make(value) }),
      }),
      label,
    },
  };
}
