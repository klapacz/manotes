import { Schema } from "effect";
import { defineCommands, defineNodeAttr, defineNodeSpec, definePlugin, union } from "prosekit/core";
import {
  defineTableSpec,
  defineTableRowSpec,
  defineTableCellSpec,
  defineTableHeaderCellSpec,
  insertTable,
  exitTable,
  selectTable,
  selectTableCell,
  selectTableColumn,
  selectTableRow,
  addTableColumnBefore,
  addTableColumnAfter,
  addTableRowAbove,
  addTableRowBelow,
  deleteTable,
  deleteTableColumn,
  deleteTableRow,
  deleteCellSelection,
} from "prosekit/extensions/table";
import { Fragment, type Node } from "prosekit/pm/model";
import {
  Plugin,
  Selection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosekit/pm/state";

const TableCellAttrs = Schema.Struct({
  align: Schema.NullOr(Schema.Literals(["left", "center", "right"])),
  colspan: Schema.Literal(1),
  rowspan: Schema.Literal(1),
  colwidth: Schema.Null,
});

export const decodeTableCellAttrs = Schema.decodeUnknownSync(TableCellAttrs);

export function defineAppTableSpec() {
  const attrs = {
    align: { default: null, validate: Schema.decodeUnknownSync(TableCellAttrs.fields.align) },
    colspan: { default: 1, validate: Schema.decodeUnknownSync(TableCellAttrs.fields.colspan) },
    rowspan: { default: 1, validate: Schema.decodeUnknownSync(TableCellAttrs.fields.rowspan) },
    colwidth: { default: null, validate: Schema.decodeUnknownSync(TableCellAttrs.fields.colwidth) },
  };

  return union(
    defineTableSpec(),
    defineTableRowSpec(),
    defineTableCellSpec(),
    defineTableHeaderCellSpec(),
    defineNodeSpec({ name: "tableRow", content: "tableHeaderCell+ | tableCell+" }),
    defineNodeSpec({ name: "tableCell", content: "paragraph", attrs }),
    defineNodeSpec({ name: "tableHeaderCell", content: "paragraph", attrs }),
    defineTableAlign("tableCell"),
    defineTableAlign("tableHeaderCell"),
  );
}

/** Markdown-compatible table commands and document validation. */
export function defineAppTableExtension() {
  return union(
    defineCommands({
      insertTable: (options: { row: number; col: number }) =>
        insertTable({ ...options, header: true }),
      exitTable: () => exitTable,
      selectTable,
      selectTableCell,
      selectTableColumn,
      selectTableRow,
      addTableColumnBefore: () => markdownTableCommand(addTableColumnBefore),
      addTableColumnAfter: () => markdownTableCommand(addTableColumnAfter),
      addTableRowAbove: () => markdownTableCommand(addTableRowAbove),
      addTableRowBelow: () => markdownTableCommand(addTableRowBelow),
      deleteTable: () => deleteTable,
      deleteTableColumn: () => markdownTableCommand(deleteTableColumn),
      deleteTableRow: () => markdownTableCommand(deleteTableRow),
      deleteCellSelection: () => deleteCellSelection,
    }),
    definePlugin(
      new Plugin({
        filterTransaction(tr) {
          if (!tr.docChanged) return true;

          try {
            tr.doc.check();
            tr.doc.descendants((node) => {
              if (node.type.name === "table") checkMarkdownTable(node);
            });

            return true;
          } catch {
            return false;
          }
        },
      }),
    ),
  );
}

export function checkMarkdownTable(table: Node): void {
  const header = table.firstChild;

  if (!header || header.childCount === 0) throw new Error("Markdown table requires a header");
  table.forEach((row, _, rowIndex) => {
    if (row.childCount !== header.childCount)
      throw new Error("Markdown table rows must have equal widths");
    row.forEach((cell, _, column) => {
      const expected = rowIndex === 0 ? "tableHeaderCell" : "tableCell";

      if (cell.type.name !== expected)
        throw new Error("Markdown table requires one leading header row");
      const attrs = decodeTableCellAttrs(cell.attrs);

      if (attrs.align !== decodeTableCellAttrs(header.child(column).attrs).align) {
        throw new Error("Markdown table alignment must be consistent within each column");
      }

      if (cell.childCount !== 1 || cell.firstChild?.type.name !== "paragraph") {
        throw new Error("Markdown table cell must contain one paragraph");
      }

      cell.descendants((node) => {
        if (node.type.name === "hardBreak" || /[\r\n]/.test(node.text ?? "")) {
          throw new Error("Markdown table cell cannot contain line breaks");
        }
      });
    });
  });
}

function defineTableAlign(type: "tableCell" | "tableHeaderCell") {
  return defineNodeAttr<typeof type, "align", typeof TableCellAttrs.Type.align>({
    type,
    attr: "align",
    default: null,
    validate: Schema.decodeUnknownSync(TableCellAttrs.fields.align),
    toDOM: (align) => (align === null ? null : ["style", `text-align: ${align}`]),
    parseDOM: (dom) =>
      Schema.decodeUnknownSync(TableCellAttrs.fields.align)(dom.style.textAlign || null),
  });
}

// Upstream row commands copy header cell types and omit our alignment attr.
// Canonicalize their result before the guard sees the transaction.
function markdownTableCommand(command: Command): Command {
  return (state, dispatch, view) =>
    command(
      state,
      dispatch &&
        ((tr) => {
          normalizeTableRows(tr, state);
          dispatch(tr);
        }),
      view,
    );
}

function normalizeTableRows(tr: Transaction, state: EditorState): void {
  const selection = tr.selection.toJSON();
  tr.doc.descendants((table, tablePos) => {
    if (table.type.name !== "table") return;
    const previous = state.doc.nodeAt(tr.mapping.invert().map(tablePos, -1));

    // Row changes retain the previous header's alignment, including a new first row.
    const header =
      previous?.type.name === "table" &&
      previous.firstChild?.childCount === table.firstChild?.childCount
        ? previous.firstChild
        : table.firstChild;

    if (!header) return false;
    table.forEach((row, rowOffset, rowIndex) => {
      const cells: Node[] = [];
      row.forEach((cell, _, column) => {
        const type = tr.doc.type.schema.nodes[rowIndex === 0 ? "tableHeaderCell" : "tableCell"];
        const align = decodeTableCellAttrs(header.child(column).attrs).align;
        cells.push(type ? type.create({ ...cell.attrs, align }, cell.content, cell.marks) : cell);
      });
      const normalized = row.copy(Fragment.fromArray(cells));

      // Changing one cell at a time would temporarily mix header and body cells.
      if (!row.eq(normalized))
        tr.replaceWith(
          tablePos + rowOffset + 1,
          tablePos + rowOffset + 1 + row.nodeSize,
          normalized,
        );
    });

    return false;
  });
  // Normalization keeps node sizes, so preserve the command's selection positions.
  tr.setSelection(Selection.fromJSON(tr.doc, selection));
}
