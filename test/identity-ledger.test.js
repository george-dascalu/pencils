import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { ledgerFrontmatter, parseLedger } from "../server/identity-ledger.js";
import { Store } from "../server/store.js";

// The card number register's own reader and writer (F0.22-51) must give exactly what the YAML
// library gives, or step aside for it.
const yaml = (data) => new YAML.Document(data).toString({ lineWidth: 0 });
const ledger = (tasks, next = Object.keys(tasks).length + 1) => ({ kind: "task-identities", project: "p-0e8c074e", next, tasks });
const many = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`t-${(0x1000000a + i * 977).toString(16)}`, i + 1]));

test("the register is written exactly as the YAML library writes it", () => {
  for (const data of [ledger({}), ledger({ "t-ed3fc3b5": 1 }), ledger(many), ledger({ Card_1: 4, "a-b-c": 9, x: 2 }, 12)])
    assert.equal(ledgerFrontmatter(data), yaml(data));
  // Adding a card to a register read by YAML, as a save did, gives the same text too.
  const doc = YAML.parseDocument(yaml(ledger(many)));
  doc.setIn(["tasks", "t-ffffffff"], 301);
  doc.set("next", 302);
  assert.equal(ledgerFrontmatter(ledger({ ...many, "t-ffffffff": 301 }, 302)), doc.toString({ lineWidth: 0 }));
});

test("ids and values YAML would quote or read differently are left to YAML", () => {
  for (const id of ["true", "False", "null", "yes", "No", "on", "OFF", "y", "n", "123", "1e3", "0x1F", "-t", "_t", "t:x", "t x", "", "t-ok"]) {
    const data = ledger({ [id]: 1 });
    const text = ledgerFrontmatter(data);
    assert.ok(text === null || text === yaml(data), `writes ${JSON.stringify(id)} as YAML does`);
    if (text === null) assert.notEqual(id, "t-ok");
  }
  for (const data of [ledger({ t1: 0 }), ledger({ t1: 1.5 }), ledger({ t1: "1" }), ledger({ t1: 1 }, 0), { ...ledger({}), extra: 1 }, { next: 1, kind: "task-identities", project: "p-1", tasks: {} }, ledger([]), { ...ledger({}), tasks: null }, null, "text", { ...ledger({}), project: "true" }])
    assert.equal(ledgerFrontmatter(data), null, JSON.stringify(data));
});

test("the register is read exactly as YAML reads it, and anything unusual goes to YAML", () => {
  for (const data of [ledger({}), ledger(many), ledger({ Card_1: 4, x: 2 }, 12)]) {
    const text = yaml(data).replace(/\n$/, "");
    assert.deepEqual(parseLedger(text), YAML.parse(text));
  }
  const usual = yaml(ledger({ "t-1": 1, "t-2": 2 })).replace(/\n$/, "");
  for (const unusual of [
    usual.replace("tasks:", "tasks: # cards"), usual + "\n# note", usual.replaceAll("\n", "\r\n"), usual + "\nextra: 1",
    usual.replace("t-1: 1", '"t-1": 1'), usual.replace("t-2: 2", "t-1: 2"), usual.replace("t-1: 1", "t-1: 01"),
    usual.replace("t-1: 1", "t-1: 1 "), usual.replace("next: 3", "next: 3.0"), usual.replace(/tasks:[\s\S]*/, "tasks: {t-1: 1}"),
    usual.replace("project: p-0e8c074e", "project: 'p-0e8c074e'"), usual.replace("  t-2", "    t-2"), "kind: task-identities",
  ]) assert.equal(parseLedger(unusual), null, unusual);
});

test("a register with comments keeps them, and one that leaves the usual form is written in full", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-ledger-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const p = await store.createProject({ title: "Register", key: "REG" });
  await store.createTask(p.id, { title: "One" });
  const file = path.join(root, "Projects", p.id, "identity.md");
  const usual = await fs.readFile(file, "utf8");
  assert.match(usual, /^---\nkind: task-identities\nproject: [\w-]+\nnext: 2\ntasks:\n {2}t-[0-9a-f]{8}: 1\n---\n/);
  // An id YAML has to quote: the save falls back to YAML and still writes every field.
  const read = await store.read(file);
  assert.equal(read.ledger, true);
  await store.write(file, { ...read.data, next: 3, tasks: { ...read.data.tasks, true: 2 } }, read.body, read);
  assert.deepEqual((await store.read(file)).data, { ...read.data, next: 3, tasks: { ...read.data.tasks, true: 2 } });
  // A hand-written comment in a register otherwise in its usual form survives the next card.
  const q = await store.createProject({ title: "Noted", key: "NOTE" });
  await store.createTask(q.id, { title: "One" });
  const noted = path.join(root, "Projects", q.id, "identity.md");
  await fs.writeFile(noted, (await fs.readFile(noted, "utf8")).replace("tasks:", "# Numbers are never reused.\ntasks:"));
  const card = await store.createTask(q.id, { title: "Two" });
  assert.equal(card.key, "NOTE-2");
  assert.match(await fs.readFile(noted, "utf8"), /# Numbers are never reused\.\ntasks:/);
});

async function vault(t, watch = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-ledger-rules-"));
  const store = new Store(root);
  await store.init();
  if (watch) store.watch();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const p = await store.createProject({ title: "Rules", key: "RUL" });
  const first = await store.createTask(p.id, { title: "First" });
  const file = path.join(root, "Projects", p.id, "identity.md");
  const setLedger = async (data) => fs.writeFile(file, `---\n${yaml(data)}---\nTask number registry.\n`);
  const copy = async (id, number) => {
    const source = await fs.readFile(path.join(root, first.file), "utf8");
    const text = source.replaceAll(first.id, id).replace(/^number: .*\n/m, number === undefined ? "" : `number: ${number}\n`).replace(/^key: .*\n/m, "");
    await fs.writeFile(path.join(root, "Projects", p.id, "tasks", `${id}.md`), text);
  };
  return { root, store, p, first, file, setLedger, copy };
}

test("a damaged register is refused rather than numbering cards from it", async (t) => {
  const { store, p, first, setLedger } = await vault(t);
  const good = { kind: "task-identities", project: p.id, next: 2, tasks: { [first.id]: 1 } };
  for (const damage of [{ next: 0 }, { next: 1.5 }, { tasks: null }, { tasks: [1] }, { tasks: { [first.id]: 0 } }, { tasks: { [first.id]: 2.5 } }, { tasks: { [first.id]: 1, "t-other": 1 } }]) {
    await setLedger({ ...good, ...damage });
    await assert.rejects(() => store.createTask(p.id, { title: "More" }), /identity registry is invalid/, JSON.stringify(damage));
  }
  await setLedger({ ...good, next: Number.MAX_SAFE_INTEGER });
  await assert.rejects(() => store.createTask(p.id, { title: "More" }), /exhausted its card number range/);
});

test("cards missing from the register keep the number they hold unless it is taken", async (t) => {
  const { store, p, first, copy } = await vault(t);
  await copy("t-aaaaaaa1", 7); // free: kept
  await copy("t-aaaaaaa2", 1); // First's: renumbered
  await copy("t-aaaaaaa3", 0); // not a card number: renumbered
  await copy("t-aaaaaaa4"); // none: numbered
  const numbers = Object.fromEntries((await store.snapshot(p.id)).tasks.map((t) => [t.id, t.number]));
  // Missing cards are numbered in ID order, after the highest number in use.
  assert.deepEqual(numbers, { [first.id]: 1, "t-aaaaaaa1": 7, "t-aaaaaaa2": 8, "t-aaaaaaa3": 9, "t-aaaaaaa4": 10 });
  assert.equal((await store.createTask(p.id, { title: "Next" })).number, 11);
});

test("an unreadable register is refused, and numbers in use are never given out again", async (t) => {
  const { store, p, first, file, setLedger, copy } = await vault(t);
  // A register the YAML parser can't read isn't treated as missing (that would hand out its numbers again).
  await fs.writeFile(file, "---\nkind: task-identities\ntasks: [unclosed\n---\n");
  await assert.rejects(() => store.createTask(p.id, { title: "More" }), /Invalid YAML in identity\.md/);
  // A register whose next number is behind the numbers it holds continues after them.
  await setLedger({ kind: "task-identities", project: p.id, next: 1, tasks: { [first.id]: 1 } });
  assert.equal((await store.createTask(p.id, { title: "Second" })).number, 2);
  // Two missing cards holding one free number: the first by ID keeps it; a free 1 is kept too.
  await setLedger({ kind: "task-identities", project: p.id, next: 6, tasks: { [first.id]: 5 } });
  await copy("t-bbbbbbb1", 7);
  await copy("t-bbbbbbb2", 7);
  await copy("t-bbbbbbb3", 1);
  const numbers = Object.fromEntries((await store.snapshot(p.id)).tasks.map((t) => [t.id, t.number]));
  assert.equal(numbers["t-bbbbbbb1"], 7);
  assert.equal(numbers["t-bbbbbbb3"], 1);
  assert.ok(numbers["t-bbbbbbb2"] > 7, `renumbered after 7: ${numbers["t-bbbbbbb2"]}`);
  assert.equal(new Set(Object.values(numbers)).size, Object.keys(numbers).length, "every number once");
});

test("restoring the register from history keeps it in its usual form", async (t) => {
  const { store, p, file } = await vault(t);
  await store.createTask(p.id, { title: "Second" });
  const relative = path.relative(store.root, file).split(path.sep).join("/");
  const versions = await store.history(relative);
  const older = versions.find((v) => Object.keys(v.data.tasks).length === 1);
  assert.ok(older, "the register's history holds the one-card version");
  await store.restoreVersion(relative, older.revision, (await store.read(file)).revision);
  const restored = await store.read(file);
  assert.equal(restored.ledger, true, "read in its usual form, not by YAML");
  assert.deepEqual(Object.keys(restored.data), ["kind", "project", "next", "tasks"]);
  assert.deepEqual(restored.data.tasks, older.data.tasks);
});

// A new card skips reading every card only while the register is the one this store last wrote
// (F0.22-51); anything else changed meanwhile and the cards are read and numbered first.
test("a register put back to an older version, or copied in from elsewhere, never hands out a live card's number", async (t) => {
  const { store, p, first, file, setLedger } = await vault(t, true);
  await store.createTask(p.id, { title: "Second" });
  const relative = path.relative(store.root, file).split(path.sep).join("/");
  const older = (await store.history(relative)).find((v) => Object.keys(v.data.tasks).length === 1);
  await store.restoreVersion(relative, older.revision, (await store.read(file)).revision);
  assert.equal((await store.createTask(p.id, { title: "Third" })).number, 3);
  // A sync or git checkout writes the file before the watcher says so.
  await setLedger({ kind: "task-identities", project: p.id, next: 2, tasks: { [first.id]: 1 } });
  assert.equal((await store.createTask(p.id, { title: "Fourth" })).number, 4);
  const numbers = Object.fromEntries((await store.snapshot(p.id)).tasks.map((c) => [c.title, c.key]));
  assert.deepEqual(numbers, { First: "RUL-1", Second: "RUL-2", Third: "RUL-3", Fourth: "RUL-4" });
});

test("a card added outside Pencils keeps its number when the next card is made", async (t) => {
  // Without a watcher (it fell back to polling) nothing says a file landed, so every card is read.
  for (const watch of [true, false]) {
    const { root, store, p, copy } = await vault(t, watch);
    await copy("t-ccccccc1", 2);
    // What the watcher reports once the file lands.
    if (watch) store.changed(path.join(root, "Projects", p.id, "tasks", "t-ccccccc1.md"));
    assert.equal((await store.createTask(p.id, { title: "Next" })).number, 3, `watching: ${watch}`);
    assert.equal((await store.snapshot(p.id)).tasks.find((c) => c.id === "t-ccccccc1").key, "RUL-2");
  }
});

test("a project key changed outside Pencils renames every card's key with the next card", async (t) => {
  const { root, store, p, first } = await vault(t, true);
  const project = path.join(root, "Projects", p.id, "project.md");
  await fs.writeFile(project, (await fs.readFile(project, "utf8")).replace(/^key: RUL$/m, "key: NEW"));
  assert.equal((await store.createTask(p.id, { title: "Next" })).key, "NEW-2");
  assert.match(await fs.readFile(path.join(root, first.file), "utf8"), /^key: NEW-1$/m);
});

test("a register given an updated time by an earlier restore goes back to its usual form", async (t) => {
  const { store, p, first, file, setLedger } = await vault(t, true);
  await setLedger({ kind: "task-identities", project: p.id, next: 2, tasks: { [first.id]: 1 }, updated: "2026-11-01T10:00:00.000Z" });
  await store.createTask(p.id, { title: "Next" });
  const read = await store.read(file);
  assert.equal(read.ledger, true, "read in its usual form");
  assert.deepEqual(Object.keys(read.data), ["kind", "project", "next", "tasks"]);
});

test("a card that lands while the cards are being read is still numbered, and its request found", async (t) => {
  const { root, store, p, copy } = await vault(t, true);
  const read = store.readChildren.bind(store);
  // The next read of the cards finishes after the file lands and the watcher reports it.
  const land = (id, number, request) => {
    store.childrenCache.clear();
    store.readChildren = async (...args) => {
      const value = await read(...args);
      store.readChildren = read;
      await copy(id, number);
      const file = path.join(root, "Projects", p.id, "tasks", `${id}.md`);
      if (request) await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("kind: task\n", `kind: task\ncreation_request: ${request}\n`));
      store.changed(file);
      return value;
    };
  };
  land("t-ddddddd1", 2, "late");
  await store.children(p.id, "tasks");
  assert.equal((await store.createTask(p.id, { title: "Retry", creation_request: "late" })).id, "t-ddddddd1");
  land("t-ddddddd2", 3);
  await store.snapshot(p.id);
  assert.equal((await store.createTask(p.id, { title: "Next" })).number, 4);
});

test("what changed before the watcher started, or after a backup was put back, is still seen", async (t) => {
  const { root, store, p, copy } = await vault(t);
  await copy("t-eeeeeee1", 2);
  store.watch();
  assert.equal((await store.createTask(p.id, { title: "Next" })).number, 3);
  // A restore swaps the folders the watcher was following for the backup's.
  await store.mutate(async () => store.restoreBackup((await store.createBackup()).id));
  const seen = new Set(), changed = store.changed.bind(store);
  store.changed = (file, value) => { seen.add(file); return changed(file, value); };
  const file = path.join(root, "Projects", p.id, "tasks", "t-eeeeeee2.md");
  await fs.writeFile(file, "Written elsewhere\n");
  for (let i = 0; i < 100 && !seen.has(file); i++) await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(seen.has(file), "the watcher reports the new file");
});

test("a card put back to an earlier version keeps its number and key", async (t) => {
  const { root, store, p, first } = await vault(t, true);
  const project = path.join(root, "Projects", p.id, "project.md");
  await store.updateProject(p.id, { key: "NEW", revision: (await store.read(project)).revision });
  const card = (await store.snapshot(p.id)).tasks.find((c) => c.id === first.id);
  assert.equal(card.key, "NEW-1");
  const older = (await store.history(first.file)).find((v) => v.data.key === "RUL-1");
  await store.restoreVersion(first.file, older.revision, card.revision);
  const restored = (await store.read(path.join(root, first.file))).data;
  assert.deepEqual([restored.number, restored.key, [...restored.aliases].sort()], [1, "NEW-1", ["First", "NEW-1", "RUL-1"]]);
});

test("a failed save, an attachment or a note saved from a board doesn't make the next card read every card", async (t) => {
  const { root, store, p } = await vault(t, true);
  await store.createTask(p.id, { title: "Warm" });
  await assert.rejects(() => store.mutate(() => store.createTask(p.id, { title: "Orphan", parent: "t-missing1" })), /parent card does not exist/);
  await store.attach(p.id, { name: "note.txt", data: Buffer.from("hello").toString("base64") });
  await store.sketch(p.id, { strokes: [{ x: 10, y: 20, color: "#aa3300", strokeWidth: 4, points: [[0, 0], [30, 10]] }] });
  const note = `Projects/${p.id}/notes/plan.md`;
  await fs.mkdir(path.dirname(path.join(root, note)), { recursive: true });
  await fs.writeFile(path.join(root, note), "Old text\n");
  await store.editCanvasNote(p.id, { file: note, revision: (await store.canvasNote(p.id, note)).revision, body: "New text\n" });
  // Another app saves a document.
  store.changed(path.join(root, "Projects", p.id, "documents", "d-elsewhere.md"));
  let lists = 0;
  const read = store.readChildren.bind(store);
  store.readChildren = (project, kind, ...rest) => { if (kind === "tasks") lists++; return read(project, kind, ...rest); };
  store.childrenCache.clear();
  await store.createTask(p.id, { title: "Next" });
  assert.equal(lists, 0, "the next card read every card");
});

test("a card the workflow didn't allow is numbered once the workflow allows it", async (t) => {
  const { root, store, p, copy } = await vault(t, true);
  await copy("t-fffffff1");
  const file = path.join(root, "Projects", p.id, "tasks", "t-fffffff1.md");
  await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace(/^status: .*$/m, "status: parked"));
  store.changed(file);
  // Its status isn't in the workflow, so it isn't a card yet.
  await store.createTask(p.id, { title: "Before" });
  // Settings refuses to change the workflow while a card can't be read; Obsidian doesn't.
  const project = path.join(root, "Projects", p.id, "project.md");
  const [, front, body] = /^---\n([\s\S]*?\n)---\n([\s\S]*)$/.exec(await fs.readFile(project, "utf8"));
  const doc = YAML.parseDocument(front);
  doc.setIn(["schema", "statuses"], [...doc.getIn(["schema", "statuses"]).toJSON(), "parked"]);
  await fs.writeFile(project, `---\n${doc.toString({ lineWidth: 0 })}---\n${body}`);
  store.changed(project);
  await store.createTask(p.id, { title: "After" });
  assert.ok((await store.read(path.join(root, "Projects", p.id, "identity.md"))).data.tasks["t-fffffff1"], "numbered");
});

test("a save whose commit fails still tells the app something changed", async (t) => {
  const { store, p } = await vault(t, true);
  const finish = store.journal.finish.bind(store.journal);
  store.journal.finish = async (success) => { await finish(success); if (success) throw new Error("Disk full"); };
  t.after(() => { store.journal.finish = finish; });
  const events = [];
  store.events.on("change", (version) => events.push(version));
  await assert.rejects(() => store.mutate(() => store.createTask(p.id, { title: "Kept" })), /Disk full/);
  assert.equal(events.length, 1, "one change sent");
  // A save refused before writing anything changed nothing.
  store.journal.finish = finish;
  await assert.rejects(() => store.mutate(() => store.createTask(p.id, { title: "Orphan", parent: "t-missing1" })), /parent card does not exist/);
  assert.equal(events.length, 1, "nothing more sent");
});
