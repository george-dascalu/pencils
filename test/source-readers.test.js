import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { zipSync, strToU8 } from "fflate";
import { readWorkbook, readObsidian } from "../server/source-readers.js";
import { mergeSource, mapSource } from "../public/source-model.js";
test("source merge preserves annotations and exposes independent local/remote conflicts", () => {
  const base = { title: "Original", status: "todo" },
    local = { ...base, title: "Mine" },
    remote = { ...base, title: "Theirs", status: "done" };
  const result = mergeSource(base, local, remote);
  assert.equal(result.values.title, "Mine");
  assert.equal(result.values.status, "done");
  assert.equal(result.conflicts.length, 1);
  assert.throws(() =>
    mapSource(
      { id: "1", fields: { title: "", due: "2026-02-31" } },
      {},
      { types: ["task"], statuses: ["todo"] },
    ),
  );
});
const workbook = (ids = ["r1", "r2"]) =>
  zipSync(
    Object.fromEntries(
      Object.entries({
        "xl/tables/table1.xml":
          '<table name="Tasks" ref="A1:C3"><tableColumns><tableColumn name="ID"/><tableColumn name="title"/><tableColumn name="status"/></tableColumns></table>',
        "xl/worksheets/_rels/sheet1.xml.rels":
          '<Relationships><Relationship Id="rId1" Target="../tables/table1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${ids.map((id, i) => `<row r="${i + 2}"><c r="A${i + 2}" t="inlineStr"><is><t>${id}</t></is></c><c r="B${i + 2}" t="inlineStr"><is><t>Task &amp; ${i}</t></is></c><c r="C${i + 2}" t="inlineStr"><is><t>todo</t></is></c></row>`).join("")}</sheetData></worksheet>`,
      }).map(([key, value]) => [key, strToU8(value)]),
    ),
  );
test("Excel named table import has stable IDs, decodes text, and rejects duplicates", () => {
  const rows = readWorkbook(workbook(), "Tasks", "ID");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].fields.title, "Task & 0");
  assert.throws(
    () => readWorkbook(workbook(["same", "same"]), "Tasks", "ID"),
    /unique/,
  );
  assert.throws(() => readWorkbook(workbook(), "Missing", "ID"), /not found/);
});
test("Obsidian imports opted-in stable note and block identities without changing files", async (t) => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-source-notes-"),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const text =
    "---\nid: note-one\ntitle: First note\nstatus: todo\n---\nBody stays here\n- [ ] Checklist ^block-one\n- [ ] No ID\n";
  await fs.writeFile(path.join(root, "one.md"), text);
  await fs.writeFile(path.join(root, "other.md"), "No frontmatter ID");
  const result = await readObsidian(root, ".", { checklists: true });
  assert.deepEqual(
    result.map((r) => r.id),
    ["note-one", "note-one#block-one"],
  );
  assert.equal(await fs.readFile(path.join(root, "one.md"), "utf8"), text);
  await assert.rejects(readObsidian(root, ".."), /within/);
});
