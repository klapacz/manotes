import {
  ExtensionTag,
  findParentNode,
  PlainExtension,
  type KeyBindingProps,
  type KeyBindings,
  type ProsemirrorNode,
} from "remirror";

function isListItemNode(node: ProsemirrorNode): boolean {
  return !!node.type.spec.group?.includes(ExtensionTag.ListItemNode);
}

export class ToggleListItemExtension extends PlainExtension {
  readonly name = "toggleListItem";

  createKeymap(): KeyBindings {
    return {
      "Mod-Enter": (props): boolean => this.toggleListType(props),
    };
  }

  private toggleListType({ tr }: KeyBindingProps): boolean {
    const foundListItem = findParentNode({
      selection: tr.selection,
      predicate: isListItemNode,
    });

    if (!foundListItem) {
      return false;
    }

    const { node: listItem } = foundListItem;

    // cover uncheck task item to checked task item
    if (listItem.type.name === "taskListItem") {
      this.store.commands.toggleCheckboxChecked();
      return true;
    }

    return false;
  }
}
