import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";

import type { Instance as TippyInstance } from "tippy.js";

import type { SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import { useMutation } from "@tanstack/react-query";
import { TagService } from "@/services/tag.service";

type TagSearchRecord = {
  id: string;
  label: string;
};

type TagListProps = SuggestionProps<TagSearchRecord, MentionNodeAttrs>;

interface TagListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const TagList = forwardRef<TagListRef, TagListProps>((props, ref) => {
  const commandRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    // TODO: refactor, now it allows for the ctrl-n and ctrl-p to work
    onKeyDown: ({ event }) => {
      const isCtrlPressed = event.ctrlKey || event.metaKey;

      if (
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        (isCtrlPressed && event.key === "n") ||
        (isCtrlPressed && event.key === "p") ||
        event.key === "Tab"
      ) {
        event.preventDefault();
        let newKey = event.key;
        if (isCtrlPressed && event.key === "n") newKey = "ArrowDown";
        if (isCtrlPressed && event.key === "p") newKey = "ArrowUp";
        if (event.key === "Tab")
          newKey = event.shiftKey ? "ArrowUp" : "ArrowDown";

        commandRef.current?.dispatchEvent(
          new KeyboardEvent("keydown", { key: newKey, bubbles: true }),
        );
        return true;
      }
      return false;
    },
  }));

  /**
   * This is used to preselect the first item in the list, when the items array change.
   */
  const [value, setValue] = useState<string>();
  useEffect(() => {
    if (props.items.length > 0) {
      setValue(props.items[0]?.id);
    } else {
      setValue(":add:");
    }
  }, [props.items, props.query]);

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!props.query.trim()) {
        throw new Error("Tag must have name");
      }
      return await TagService.create({ name: props.query.trim() });
    },
    onSuccess: (tag) => {
      props.command(tag);
    },
    onError: (error) => {
      console.error(error);
    },
  });

  function onTagSelect(tag: TagSearchRecord) {
    props.command(tag);
  }

  function onAddNewTag() {
    addMutation.mutate();
  }

  return (
    <div className="dropdown-menu shadow-md">
      <Command
        ref={commandRef}
        shouldFilter={false}
        loop={true}
        value={value}
        onValueChange={setValue}
      >
        <CommandList>
          <CommandGroup>
            {props.items.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => onTagSelect(item)}
                value={item.id}
              >
                {item.label}
              </CommandItem>
            ))}

            <CommandItem
              onSelect={() => onAddNewTag()}
              forceMount
              value={":add:"}
              disabled={!props.query}
            >
              Add new {props.query ? '"' + props.query + '"' : ""}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
      {}
    </div>
  );
});

export const tagSuggestion: Omit<
  SuggestionOptions<TagSearchRecord, MentionNodeAttrs>,
  "editor"
> = {
  char: "#",

  pluginKey: new PluginKey("tag"),

  items: async ({ query }: { query: string }) => {
    const tags = await TagService.search({ name: query });
    return tags.map((tag) => ({
      id: tag.id,
      label: tag.name,
    }));
  },

  render: () => {
    let component: ReactRenderer<TagListRef, TagListProps>;
    let popup: TippyInstance | undefined;

    return {
      onStart: (props) => {
        component = new ReactRenderer(TagList, {
          props,
          editor: props.editor,
        });

        if (!props.clientRect) {
          return;
        }

        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },

      onUpdate(props) {
        component.updateProps(props);

        if (!props.clientRect) {
          return;
        }

        popup?.setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        });
      },

      onKeyDown(props) {
        if (props.event.key === "Escape") {
          popup?.hide();

          return true;
        }

        return component.ref?.onKeyDown({ event: props.event }) ?? false;
      },

      onExit() {
        popup?.destroy();
        component.destroy();
      },
    };
  },
};
