// T43: the vault's files are the source of truth, and people edit them outside Pencils too
// (Obsidian, git, other editors). Saving a record keeps what Pencils didn't change: comments and
// other keys in the frontmatter, the body byte for byte, and the canvas fields it doesn't use.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { readObsidian, writeObsidian } from "../server/source-readers.js";

// Windows line endings, a rule and a code block that look like frontmatter, emoji, trailing spaces.
const TRICKY = "First line\r\nSecond line\r\n\n---\n\nAfter a rule\n```yaml\n---\nkey: not frontmatter\n---\n```\nUnicode: café 🎨 — ok\ntrailing spaces   \n\n\n";

async function vault(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-roundtrip-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  return { store, project: await store.createProject({ title: "Round trip" }) };
}
// The file as another editor left it: a comment and a key Pencils doesn't know, and the tricky body.
async function editOutside(file) {
  const text = await fs.readFile(file, "utf8");
  await fs.writeFile(file, text.replace(/^---\n/, "---\n# Kept comment\nobsidian_alias:\n  - Old name\n").replace(/\n---\n[\s\S]*$/, `\n---\n${TRICKY}`));
}
const bodyOf = (text) => text.slice(text.indexOf("\n---\n", 3) + 5);

test("saving a task keeps the frontmatter's comments and other keys, and the body as written", async (t) => {
  const { store, project } = await vault(t);
  const task = await store.createTask(project.id, { title: "Original" });
  const file = store.resolveFile(task.file);
  await editOutside(file);
  const current = await store.read(file);
  assert.equal(current.body, TRICKY, "read as written");
  await store.updateTask(project.id, task.id, { title: "Renamed", revision: current.revision });
  const saved = await fs.readFile(file, "utf8");
  assert.match(saved, /# Kept comment\n/);
  assert.match(saved, /obsidian_alias:\n {2}- Old name\n/);
  assert.match(saved, /title: Renamed\n/);
  assert.equal(bodyOf(saved), TRICKY);
});

test("saving a document's title or properties keeps its text as written", async (t) => {
  const { store, project } = await vault(t);
  const document = await store.createDocument(project.id, { title: "Notes", body: "x" });
  const file = store.resolveFile(document.file);
  await editOutside(file);
  let current = await store.read(file);
  await store.updateDocument(project.id, document.id, { title: "Renamed", revision: current.revision });
  current = await store.read(file);
  await store.updateDocument(project.id, document.id, { document_properties: { set: { status: "draft" } }, revision: current.revision });
  const saved = await fs.readFile(file, "utf8");
  assert.match(saved, /# Kept comment\n/);
  assert.match(saved, /obsidian_alias:\n {2}- Old name\n/);
  assert.match(saved, /status: draft\n/);
  assert.equal(bodyOf(saved), TRICKY);
});

test("saving a board keeps canvas fields Pencils doesn't use", async (t) => {
  const { store, project } = await vault(t);
  const board = await store.createBoard(project.id, { title: "Canvas" });
  const file = store.resolveFile(board.file);
  const canvas = JSON.parse(await fs.readFile(file, "utf8"));
  canvas.nodes = [{ id: "n1", type: "text", text: "Hello", x: 0, y: 0, width: 200, height: 100, styleAttributes: { shape: "pill" } }];
  canvas.edges = [];
  canvas.metadata = { frontmatter: { kept: true } };
  await fs.writeFile(file, JSON.stringify(canvas, null, 2));
  const current = await store.read(file);
  await store.updateBoard(project.id, board.id, { title: "Renamed", revision: current.revision });
  const saved = JSON.parse(await fs.readFile(file, "utf8"));
  assert.deepEqual(saved.metadata, { frontmatter: { kept: true } }, "a top-level field");
  assert.deepEqual(saved.nodes[0].styleAttributes, { shape: "pill" }, "a node field");
  assert.equal(saved.nodes[0].text, "Hello");
});

test("a file saved with a byte order mark still reads as its record", async (t) => {
  const { store, project } = await vault(t);
  const task = await store.createTask(project.id, { title: "With BOM" });
  const file = store.resolveFile(task.file);
  await fs.writeFile(file, "\uFEFF" + (await fs.readFile(file, "utf8")));
  const record = await store.read(file);
  assert.equal(record.data.kind, "task");
  assert.equal(record.data.title, "With BOM");
});

test("imported notes and Obsidian sources with a byte order mark keep their frontmatter", async (t) => {
  const { store, project } = await vault(t);
  const { tasks } = await store.importNotes(project.id, { notes: [{ name: "Note.md", content: "\uFEFF---\ntitle: From Windows\n---\nBody\n" }] });
  assert.equal(tasks[0].title, "From Windows");
  assert.doesNotMatch(tasks[0].body, /title:/);
  const plain = (await store.importNotes(project.id, { notes: [{ name: "Plain.md", content: "\uFEFF# Heading title\nText\n" }] })).tasks[0];
  assert.equal(plain.title, "Heading title", "the first heading names a note without frontmatter");
  assert.ok(!plain.body.startsWith("\uFEFF"), "the body doesn't keep the mark");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-bom-notes-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "one.md"), "\uFEFF---\nid: note-one\ntitle: First\n---\nBody stays\n");
  const [record] = await readObsidian(root, ".");
  assert.equal(record?.id, "note-one");
  const { text } = await writeObsidian(root, record, {}, { action: "edit", title: "Renamed" });
  assert.match(text, /^---\n/);
  assert.match(text, /title: Renamed\n---\nBody stays\n$/);
});

test("an unreadable file is reported, not fatal, and left as it is", async (t) => {
  const { store, project } = await vault(t);
  await store.createTask(project.id, { title: "Fine" });
  const task = await store.createTask(project.id, { title: "Broken soon" });
  const file = store.resolveFile(task.file);
  const broken = "---\ntitle: [unclosed\n---\nBody\n";
  await fs.writeFile(file, broken);
  const snapshot = await store.snapshot(project.id);
  assert.deepEqual(snapshot.tasks.map((t) => t.title), ["Fine"]);
  assert.ok(snapshot.warnings?.length, "the project reports it");
  assert.equal(await fs.readFile(file, "utf8"), broken, "untouched");
});
