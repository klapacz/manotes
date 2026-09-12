import { collectBacklinkTargetIds } from "../../web/src/lib/materializer/backlink/target";
import type { NoteSchema } from "../../web/src/lib/note.schema";
import type { Theme } from "./theme";

export type Task = {
  readonly id: string;
  readonly title: string;
  readonly project: string | undefined;
  readonly state: string | undefined;
  readonly priority: string | undefined;
  readonly content: NoteSchema.Record["content"];
};

export const filters = [
  { label: "Active", state: "active" },
  { label: "Backlog", state: "backlog" },
] as const;

export type Filter = (typeof filters)[number]["state"];

export const activeSections = [
  { label: "In progress", state: "in-progress" },
  { label: "Todo", state: "todo" },
  { label: "Done", state: "done" },
] as const;

export type TaskRow =
  | { readonly kind: "spacer" }
  | { readonly kind: "section"; readonly label: string; readonly count: number }
  | { readonly kind: "task"; readonly task: Task };

const priorities = ["urgent", "high", "mid", "low"];

export function fromNote(note: Pick<NoteSchema.Record, "id" | "title" | "content">): Task {
  const paragraph = note.content.content?.find((node) => node.type === "paragraph");
  const links = paragraph ? collectBacklinkTargetIds(paragraph) : [];
  const title = note.title ?? note.id;

  return {
    id: note.id,
    title: title.startsWith(note.id) ? title.slice(note.id.length).trim() : title,
    project: assignment(links, "project"),
    state: assignment(links, "state"),
    priority: assignment(links, "priority"),
    content: note.content,
  };
}

export function filterTasks(tasks: readonly Task[], filter: Filter): Task[] {
  return tasks
    .filter((task) =>
      filter === "backlog"
        ? task.state === "backlog"
        : activeSections.some((section) => section.state === task.state),
    )
    .sort(
      (a, b) =>
        stateRank(a.state) - stateRank(b.state) ||
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
}

export function taskRows(tasks: readonly Task[], filter: Filter): TaskRow[] {
  if (filter === "backlog") return tasks.map((task) => ({ kind: "task", task }));

  return activeSections.flatMap((section, index): TaskRow[] => {
    const group = tasks.filter((task) => task.state === section.state);

    const rows: TaskRow[] = [
      { kind: "section", label: section.label, count: group.length },
      ...group.map((task): TaskRow => ({ kind: "task", task })),
    ];

    if (index > 0) rows.unshift({ kind: "spacer" });

    return rows;
  });
}

export function selectedIndex(tasks: readonly Task[], id: string | undefined, fallback: number) {
  const index = tasks.findIndex((task) => task.id === id);

  return index >= 0 ? index : Math.max(0, Math.min(fallback, tasks.length - 1));
}

function assignment(links: readonly string[], kind: string): string | undefined {
  const matches = links.filter((id) => id.startsWith(`${kind}:`));

  return matches.length === 1 ? matches[0]?.slice(kind.length + 1) : undefined;
}

function priorityRank(priority: string | undefined): number {
  const index = priorities.indexOf(priority ?? "");

  return index < 0 ? priorities.length : index;
}

function stateRank(state: string | undefined): number {
  return activeSections.findIndex((section) => section.state === state);
}

export function priorityColor(theme: Theme.Theme, priority: string | undefined) {
  switch (priority) {
    case "urgent":
      return theme.priority.urgent;
    case "high":
      return theme.priority.high;
    case "mid":
      return theme.priority.mid;
    default:
      return theme.priority.low;
  }
}
