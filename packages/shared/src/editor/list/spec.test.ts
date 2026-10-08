import { EditorState, TextSelection } from "prosekit/pm/state";
import { enterCommand } from "prosemirror-flat-list";
import { describe, expect, it } from "vite-plus/test";
import { NOTE_SCHEMA } from "../../prosemirror/app-schema";

describe("list item creation", () => {
  it.each(["task", "toggle", "ordered"])("preserves %s kind on Enter", (kind) => {
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("item"));
    const list = NOTE_SCHEMA.node("list", { kind, checked: true }, [paragraph]);
    const doc = NOTE_SCHEMA.node("doc", null, [list]);

    for (const position of [2, 4, 6]) {
      let state = EditorState.create({
        doc,
        selection: TextSelection.create(doc, position),
      });

      expect(
        enterCommand(state, (tr) => {
          state = state.apply(tr);
        }),
      ).toBe(true);
      expect(state.doc.childCount).toBe(2);
      expect(state.doc.child(0).attrs.kind).toBe(kind);
      expect(state.doc.child(1).attrs.kind).toBe(kind);
      const newItem = state.doc.child(position === 2 ? 0 : 1);
      expect(newItem.attrs.checked).toBe(false);
      expect(newItem.attrs.collapsed).toBe(false);
    }
  });
});
