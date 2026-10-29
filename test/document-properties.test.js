import test from "node:test";
import assert from "node:assert/strict";
import { propertyType, documentProperties, checkProperties, checkTags, documentTags, matchesDocument, frontmatterTags } from "../public/document-properties.js";

test("property types come from their values, as in Obsidian", () => {
  assert.equal(propertyType("Draft"), "text");
  assert.equal(propertyType(3.5), "number");
  assert.equal(propertyType("2026-10-29"), "date");
  assert.equal(propertyType(true), "checkbox");
  assert.equal(propertyType(["a", "b"]), "list");
  assert.equal(propertyType({ nested: 1 }), null, "other values stay as they are, for Obsidian");
  assert.equal(propertyType("2026-02-30"), "text", "only real dates are dates");
});

test("a document's own properties leave out Pencils' fields, tags and values it can't edit", () => {
  const doc = { id: "d-1", kind: "document", project: "p", title: "T", version: 2, folder: null, created: "x", updated: "y", body: "", revision: "r", file: "f", tags: ["a"], comments: [], status: "Draft", score: 3, extra: { a: 1 } };
  assert.deepEqual(documentProperties(doc), [["status", "Draft", "text"], ["score", 3, "number"]]);
  assert.deepEqual(documentProperties({ long: "x".repeat(1001), many: Array(51).fill("a") }), [], "values too big to edit here are kept, not shown");
  assert.deepEqual(frontmatterTags({ tags: "plans, q4" }), ["plans", "q4"], "Obsidian also writes tags as text");
  assert.deepEqual(frontmatterTags({ tags: [2024, "x"] }), ["2024", "x"]);
});

test("names and values are checked before they are written", () => {
  assert.deepEqual(checkProperties({ Status: "Draft", "Due date": "2026-11-01", done: false, people: ["Ana", " Sam "], score: 2 }), { Status: "Draft", "Due date": "2026-11-01", done: false, people: ["Ana", "Sam"], score: 2 });
  for (const [input, message] of [
    [{ title: "x" }, /reserved/], [{ Tags: "x" }, /reserved/], [{ "": "x" }, /name/], [{ "a:b": "x" }, /name/],
    [{ a: { b: 1 } }, /value/], [{ a: Infinity }, /value/], [{ a: "x".repeat(1001) }, /value/], [{ a: [1] }, /value/],
    [Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`p${i}`, i])), /30/],
  ]) assert.throws(() => checkProperties(input), message, JSON.stringify(input).slice(0, 60));
  assert.deepEqual(checkTags(["#Plans", "plans", "work/q4"]), ["Plans", "work/q4"], "a # is dropped and repeats go, ignoring case");
  assert.throws(() => checkTags(["two words"]), /tag/);
});

test("documents match #tags from their properties and their text, and words from title or text", () => {
  const doc = { title: "Launch", body: "Ship it #release", tags: ["plans"] };
  assert.deepEqual(documentTags(doc), ["plans", "release"]);
  assert.equal(matchesDocument(doc, "#plans"), true);
  assert.equal(matchesDocument(doc, "#RELEASE ship"), true);
  assert.equal(matchesDocument(doc, "#plans other"), false);
  assert.equal(matchesDocument(doc, "#plan"), false, "a tag matches whole");
});

test("property saves change only what they name, keep what Pencils can't edit and refuse collisions", async (t) => {
  const { Store } = await import("../server/store.js");
  const fs = await import("node:fs/promises"), os = await import("node:os"), path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-properties-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Properties" });
  let doc = await store.createDocument(project.id, { title: "Plan", body: "Text" });
  const file = path.join(root, doc.file);
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("---\n", "---\nextra:\n  nested: 1\nauthors:\n  - Smith, J.\n"));
  doc = await store.getDocument(project.id, doc.id);
  const save = async (change) => (doc = await store.updateDocument(project.id, doc.id, { revision: doc.revision, document_properties: change }));
  await save({ set: { status: "Draft", score: 2, constructor: "odd but allowed" }, tags: ["plans"] });
  assert.equal(doc.status, "Draft");
  assert.equal(doc.version, 2);
  let text = await fs.readFile(file, "utf8");
  assert.match(text, /^status: Draft$/m);
  assert.match(text, /^tags:\n  - plans$/m);
  await save({ set: { score: 3 } });
  assert.equal(doc.status, "Draft", "a save leaves properties it doesn't name");
  assert.deepEqual(doc.tags, ["plans"], "and the tags, unless it sends them");
  assert.deepEqual(doc.authors, ["Smith, J."]);
  await save({ remove: ["status", "constructor", "extra"], tags: [] });
  text = await fs.readFile(file, "utf8");
  assert.doesNotMatch(text, /status:|tags:|constructor:/, "removed properties and empty tags leave the file");
  assert.match(text, /^score: 3$/m);
  assert.match(text, /^extra:\n  nested: 1$/m, "values Pencils can't edit stay, even when named");
  for (const [change, status] of [[{ set: { title: "x" } }, 400], [{ set: { extra: "flat" } }, 409], [{ set: { Score: 4 } }, 409], [{ set: "x" }, 400], [{ remove: "score" }, 400], [{ tags: "plans" }, 400]])
    await assert.rejects(store.updateDocument(project.id, doc.id, { revision: doc.revision, document_properties: change }), (error) => error.status === status, JSON.stringify(change));
  const same = await store.updateDocument(project.id, doc.id, { revision: doc.revision, document_properties: { set: { score: 3 } } });
  assert.equal(same.version, doc.version, "an unchanged save writes nothing");
  // Saves of the text send the whole record, frontmatter included; that never touches properties.
  const textSave = await store.updateDocument(project.id, doc.id, { ...doc, tags: "not a list", properties: 7, body: "Text, edited" });
  assert.equal(textSave.body, "Text, edited");
  assert.equal(textSave.score, 3);
});
