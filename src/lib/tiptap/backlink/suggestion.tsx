import { ReactRenderer } from "@tiptap/react";
import tippy from "tippy.js";

import type { Instance as TippyInstance } from "tippy.js";

import type { SuggestionOptions } from "@tiptap/suggestion";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { MentionNodeAttrs } from "@tiptap/extension-mention";
import { db } from "@/sqlocal/client";

type NoteSearchRecord = {
  id: string;
  label: string;
};

interface BacklinkListProps {
  items: NoteSearchRecord[];
  command: (item: NoteSearchRecord) => void;
}

interface BacklinkListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

const BacklinkList = forwardRef<BacklinkListRef, BacklinkListProps>(
  (props, ref) => {
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
            new KeyboardEvent("keydown", { key: newKey, bubbles: true })
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
      setValue(props.items[0]?.id);
    }, [props.items]);

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
              <CommandEmpty>No results found.</CommandEmpty>
              {props.items.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => props.command(item)}
                  value={item.id}
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {}
      </div>
    );
  }
);

export const backlinkSuggestion: Omit<
  SuggestionOptions<NoteSearchRecord, MentionNodeAttrs>,
  "editor"
> = {
  items: ({ query }: { query: string }) => {
    return db
      .selectFrom("notes")
      .select(["id", "title as label"])
      .where("title", "like", `%${query}%`)
      .execute();
  },

  render: () => {
    let component: ReactRenderer<BacklinkListRef, BacklinkListProps>;
    let popup: TippyInstance | undefined;

    return {
      onStart: (props) => {
        component = new ReactRenderer(BacklinkList, {
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
