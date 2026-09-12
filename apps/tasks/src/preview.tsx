import { useAtom } from "@effect/atom-solid";
import { TasksAtoms } from "./atoms";
import { TextAttributes } from "@opentui/core";
import type { ScrollBoxRenderable } from "@opentui/core";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { createEffect, createMemo, on, Show } from "solid-js";
import { NOTE_SCHEMA } from "../../web/src/lib/prosemirror/app-schema";
import { MdSerialize } from "../../web/src/lib/prosemirror/md/serialize";
import { activeSections, priorityColor, type Task } from "./tasks";
import { Theme } from "./theme";

export function TaskPreview(props: {
  task: Task;
  onClose: () => void;
  onNavigate: (direction: number) => void;
  onHelp: () => void;
  inactive: boolean;
}) {
  const renderer = useRenderer();
  const theme = Theme.use();
  const [opened, open] = useAtom(TasksAtoms.open);
  let scroll: ScrollBoxRenderable | undefined;

  createEffect(
    on(
      () => props.task.id,
      () => scroll?.scrollTo(0),
    ),
  );

  const preview = createMemo(() => {
    try {
      const doc = NOTE_SCHEMA.nodeFromJSON(props.task.content);

      return { markdown: MdSerialize.serialize(doc), error: undefined };
    } catch (error) {
      return { markdown: "", error: error instanceof Error ? error.message : String(error) };
    }
  });

  useKeyboard((key) => {
    if (props.inactive || key.propagationStopped) return;

    if (key.ctrl && key.name === "c") {
      renderer.destroy();
    } else if (key.name === "escape" || key.name === "space" || key.name === "q") {
      props.onClose();
    } else if (key.sequence === "?") {
      props.onHelp();
    } else if (key.shift && (key.name === "j" || key.name === "k")) {
      props.onNavigate(key.name === "j" ? 1 : -1);
    } else if (key.name === "return") {
      if (!opened().waiting) open(props.task.id);
    } else if (key.ctrl && (key.name === "u" || key.name === "d")) {
      const halfPage = Math.max(1, Math.floor((scroll?.viewport.height ?? 2) / 2));
      scroll?.scrollBy(key.name === "d" ? halfPage : -halfPage);
    } else if (key.name === "j" || key.name === "down") {
      scroll?.scrollBy(1);
    } else if (key.name === "k" || key.name === "up") {
      scroll?.scrollBy(-1);
    } else if (key.name === "pagedown") {
      scroll?.scrollBy(Math.max(1, (scroll?.viewport.height ?? 2) - 1));
    } else if (key.name === "pageup") {
      scroll?.scrollBy(-Math.max(1, (scroll?.viewport.height ?? 2) - 1));
    } else if (key.name === "home" || (key.name === "g" && !key.shift)) {
      scroll?.scrollTo(0);
    } else if (key.name === "end" || (key.name === "g" && key.shift)) {
      scroll?.scrollTo(scroll.scrollHeight);
    }
  });

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={10}
      alignItems="center"
      justifyContent="center"
      backgroundColor={theme.surface.default}
    >
      <box
        width="90%"
        maxWidth={100}
        height="90%"
        flexDirection="column"
        border
        borderColor={theme.border.default}
        backgroundColor={theme.surface.elevated}
        paddingX={1}
      >
        <box flexDirection="row" justifyContent="space-between" gap={2} height={2}>
          <text
            height={1}
            flexShrink={0}
            fg={priorityColor(theme, props.task.priority)}
            attributes={TextAttributes.BOLD}
            truncate
          >
            {props.task.title}
          </text>

          <text
            height={1}
            flexShrink={0}
            fg={theme.text.default}
            attributes={TextAttributes.BOLD}
            truncate
          >
            {activeSections.find(({ state }) => state === props.task.state)?.label ?? "none"}
          </text>
        </box>

        <scrollbox
          ref={(value) => {
            scroll = value;
          }}
          flexGrow={1}
          scrollX={false}
          viewportCulling={false}
          paddingRight={scroll?.verticalScrollBar.visible ? 10 : 0}
          scrollbarOptions={{
            trackOptions: {
              foregroundColor: theme.scrollbar.thumb,
              backgroundColor: theme.scrollbar.track,
            },
          }}
        >
          <Show
            when={!preview().error}
            fallback={
              <text fg={theme.text.error}>
                Cannot preview this note as Markdown: {preview().error}. Press Enter to open it in
                the browser.
              </text>
            }
          >
            <markdown
              content={preview().markdown}
              syntaxStyle={theme.syntaxStyle}
              fg={theme.text.default}
              // conceal
              // internalBlockMode="top-level"
              streaming={false}
            />
          </Show>
        </scrollbox>

        <box height={1} flexShrink={0} border={["top"]} borderColor={theme.border.default}>
          <text height={1} width="100%" flexShrink={0} fg={theme.text.muted} truncate>
            {`? help  Space/Esc`}
          </text>
        </box>
      </box>
    </box>
  );
}
