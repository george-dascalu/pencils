import test from "node:test";
import assert from "node:assert/strict";
import { parseTabSeparated, spreadsheetRows, markdownTable, csv } from "../public/document-tables.js";

test("tab-separated text splits into rows and cells, with quoted cells kept whole", () => {
  assert.deepEqual(parseTabSeparated("Name\tQty\r\nApples\t3\r\n"), [["Name", "Qty"], ["Apples", "3"]]);
  assert.deepEqual(parseTabSeparated('A\t"two\nlines"\nB\t"say ""hi"""'), [["A", "two\nlines"], ["B", 'say "hi"']]);
  assert.deepEqual(parseTabSeparated("a\t\tc"), [["a", "", "c"]]);
  assert.deepEqual(parseTabSeparated('"Hello\tWorld\nFoo\tBar'), [['"Hello', "World"], ["Foo", "Bar"]], "a quote that never closes is text");
});

test("only text with two rows and two columns in every row counts as spreadsheet cells", () => {
  assert.deepEqual(spreadsheetRows("Name\tQty\nApples\t3"), [["Name", "Qty"], ["Apples", "3"]]);
  assert.equal(spreadsheetRows("Name\tQty"), null, "one row");
  assert.equal(spreadsheetRows("one\ntwo"), null, "one column");
  assert.equal(spreadsheetRows("a\tb\nc"), null, "ragged rows");
  assert.equal(spreadsheetRows("\tgo build\n\tgo test"), null, "tab-indented lines");
});

test("cells become a Markdown table with the first row as its header", () => {
  assert.equal(markdownTable([["Name", "Note"], ["a|b", "two\nlines"]]), "| Name | Note |\n| --- | --- |\n| a\\|b | two<br>lines |");
  assert.equal(markdownTable([["A", "B"], ["a\\|b", "c"]]), "| A | B |\n| --- | --- |\n| a\\\\\\|b | c |", "a backslash before a pipe stays text");
});

test("a table copies as CSV, quoting cells with commas, quotes or line breaks", () => {
  assert.equal(csv([["Name", "Note"], ["Smith, J", 'say "hi"'], ["x", "two\nlines"]]), 'Name,Note\n"Smith, J","say ""hi"""\nx,"two\nlines"');
});
