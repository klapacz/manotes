import { useAtom, useAtomValue } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import { TasksAtoms } from "./atoms";
import { TextAttributes } from "@opentui/core";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/solid";
import { batch, createEffect, createMemo, createSignal, For, Show } from "solid-js";
import {
  filters,
  filterTasks,
  priorityColor,
  selectedIndex,
  taskRows,
  type Task,
  type TaskRow,
} from "./tasks";
import { TaskPreview } from "./preview";
import { Cause, String } from "effect";
import { Theme } from "./theme";
import { HelpDialog } from "./help";

export function TaskApp() {
  const taskResult = useAtomValue(TasksAtoms.tasks);
  const status = useAtomValue(TasksAtoms.status);
  const [opened, open] = useAtom(TasksAtoms.open);
  const tasks = () => AsyncResult.getOrElse(taskResult(), (): readonly Task[] => []);

  const syncStatus = () => {
    const current = AsyncResult.getOrElse(status(), () => undefined);

    return current ? `${current.syncState}${current.hasPending ? " / pending" : ""}` : "Connecting";
  };

  const message = () => {
    const result = opened();
    const currentTasks = taskResult();

    if (AsyncResult.isFailure(currentTasks)) return Cause.pretty(currentTasks.cause);

    if (result.waiting) return "Opening task...";

    if (AsyncResult.isFailure(result)) return Cause.pretty(result.cause);

    if (AsyncResult.isSuccess(result)) return `Opened ${result.value} in the browser.`;

    return "";
  };

  const renderer = useRenderer();
  const theme = Theme.use();
  const dimensions = useTerminalDimensions();
  const [filterIndex, setFilterIndex] = createSignal(0);
  const [selection, setSelection] = createSignal<string>();
  const [fallback, setFallback] = createSignal(0);
  const [previewId, setPreviewId] = createSignal<string>();
  const [help, setHelp] = createSignal(false);
  const preview = createMemo(() => tasks().find((task) => task.id === previewId()));
  const visible = createMemo(() => filterTasks(tasks(), filters[filterIndex()]!.state));
  const index = createMemo(() => selectedIndex(visible(), selection(), fallback()));
  const selected = createMemo(() => visible()[index()]);
  const pageSize = createMemo(() => Math.max(2, dimensions().height - 10));
  const rows = createMemo(() => taskRows(visible(), filters[filterIndex()]!.state));
  const page = createMemo(() => visibleRows(rows(), selected()?.id, pageSize()));

  createEffect(() => {
    const task = selected();

    if (task) {
      setFallback(index());
      setSelection(task.id);
    }
  });

  const move = (next: number) => {
    const position = Math.max(0, Math.min(next, visible().length - 1));
    batch(() => {
      setFallback(position);
      setSelection(visible()[position]?.id);
    });
  };

  const changeFilter = (next: number) => {
    batch(() => {
      setFilterIndex((next + filters.length) % filters.length);
      setFallback(0);
      setSelection(undefined);
    });
  };

  const navigatePreview = (direction: number) => {
    move(index() + direction);
    setPreviewId(selected()?.id);
  };

  useKeyboard((key) => {
    if (help()) {
      if (["escape", "space", "q"].includes(key.name) || key.sequence === "?") {
        key.stopPropagation();
        setHelp(false);
      }

      return;
    }

    if (preview()) return;

    if (key.sequence === "?") {
      setHelp(true);
    } else if (key.sequence === "{" || key.sequence === "}") {
      move(sectionIndex(visible(), index(), key.sequence === "}" ? 1 : -1));
    } else if (key.name === "q" || key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy();
    } else if (key.name === "j" || key.name === "down") {
      move(index() + 1);
    } else if (key.name === "k" || key.name === "up") {
      move(index() - 1);
    } else if (key.name === "pagedown") {
      move(index() + pageSize());
    } else if (key.name === "pageup") {
      move(index() - pageSize());
    } else if (key.name === "home" || key.name === "g") {
      move(key.shift ? visible().length - 1 : 0);
    } else if (key.name === "end") {
      move(visible().length - 1);
    } else if (key.name === "tab") {
      changeFilter(filterIndex() + (key.shift ? -1 : 1));
    } else if (key.name === "space" || key.name === "d") {
      setPreviewId(selected()?.id);
    } else if (key.name === "return") {
      const task = selected();

      if (task && !opened().waiting) open(task.id);
    }
  });

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme.surface.default}
      paddingX={1}
    >
      <box
        height={3}
        flexShrink={0}
        alignItems="center"
        justifyContent="space-between"
        flexDirection="row"
        gap={2}
      >
        <box flexDirection="row" gap={1} height={1}>
          <text fg={theme.text.default}>Manotask</text>
          <text fg={syncStatus() === "Ready" ? theme.text.success : theme.text.warning}>
            {syncStatus()}
          </text>
        </box>

        <box height={1} flexShrink={0} flexDirection="row" gap={1}>
          <For each={filters}>
            {(filter, i) => (
              <text
                fg={filterIndex() === i() ? theme.selection.foreground : theme.text.muted}
                bg={filterIndex() === i() ? theme.selection.background : theme.surface.default}
              >
                {` ${filter.label} ${filterTasks(tasks(), filter.state).length} `}
              </text>
            )}
          </For>
        </box>
      </box>
      <box flexGrow={1} flexDirection="column" minHeight={1}>
        <Show
          when={!AsyncResult.isInitial(taskResult())}
          fallback={<text fg={theme.text.muted}>Loading tasks from the database...</text>}
        >
          <Show
            when={visible().length > 0}
            fallback={<text fg={theme.text.muted}>No tasks in this tab.</text>}
          >
            <For each={page()}>
              {(row) => {
                if (row.kind === "spacer") return <box height={1} flexShrink={0} />;

                return row.kind === "section" ? (
                  <box
                    height={1}
                    flexShrink={0}
                    paddingX={1}
                    flexDirection="row"
                    justifyContent="space-between"
                    gap={1}
                    backgroundColor={theme.surface.panel}
                  >
                    <text fg={theme.text.default} attributes={TextAttributes.BOLD}>
                      {row.label}
                    </text>
                    <text fg={theme.text.muted}>{row.count}</text>
                  </box>
                ) : (
                  <TaskItem task={row.task} selected={selected()?.id === row.task.id} />
                );
              }}
            </For>
          </Show>
        </Show>
      </box>
      <box
        height={2}
        flexShrink={0}
        border={["top"]}
        borderColor={theme.border.default}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexShrink={1}>
          <text height={1} width="100%" flexShrink={0} fg={theme.text.muted} truncate>
            {message() || "? help"}
          </text>
        </box>
        <box>
          <text height={1} width="100%" flexShrink={0} fg={theme.text.muted}>
            {`${visible().length ? index() + 1 : 0}/${visible().length}`}
          </text>
        </box>
      </box>
      <Show when={preview()}>
        {(task) => (
          <TaskPreview
            task={task()}
            onClose={() => setPreviewId(undefined)}
            onNavigate={navigatePreview}
            onHelp={() => setHelp(true)}
            inactive={help()}
          />
        )}
      </Show>
      <Show when={help()}>
        <HelpDialog />
      </Show>
    </box>
  );
}

function TaskItem(props: { task: Task; selected: boolean }) {
  const theme = Theme.use();

  return (
    <box
      height={1}
      flexShrink={0}
      flexDirection="row"
      paddingX={1}
      gap={2}
      backgroundColor={props.selected ? theme.selection.background : theme.surface.default}
    >
      <text
        height={1}
        width={4}
        fg={
          props.selected
            ? theme.selection.foreground
            : props.task.state === "done"
              ? theme.text.muted
              : priorityColor(theme, props.task.priority)
        }
        truncate
      >
        {String.takeRight(props.task.id, 4)}
      </text>
      <text
        height={1}
        flexGrow={1}
        flexShrink={1}
        fg={props.selected ? theme.selection.foreground : theme.text.default}
        truncate
      >
        {props.task.title || props.task.id}
      </text>
      <text
        height={1}
        width={3}
        fg={props.selected ? theme.selection.foreground : theme.text.muted}
        truncate
      >
        {props.task.project ?? "none"}
      </text>
    </box>
  );
}

function visibleRows(
  rows: readonly TaskRow[],
  selectedId: string | undefined,
  height: number,
): readonly TaskRow[] {
  const index = Math.max(
    0,
    rows.findIndex((row) => row.kind === "task" && row.task.id === selectedId),
  );

  // Reserve one line for the section heading when a page starts mid-section.
  const size = height - 1;
  const start = Math.floor(index / size) * size;
  const page = rows.slice(start, start + size);
  const section = rows.slice(0, start).findLast((row) => row.kind === "section");

  return section && page[0]?.kind === "task" ? [section, ...page] : page;
}

function sectionIndex(tasks: readonly Task[], index: number, direction: number): number {
  const starts = tasks.flatMap((task, i) =>
    i === 0 || task.state !== tasks[i - 1]?.state ? [i] : [],
  );

  const current = starts.findLastIndex((start) => start <= index);

  return starts[current + direction] ?? index;
}
