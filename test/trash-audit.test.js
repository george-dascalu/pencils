// Owner requests T92 and T93, 1 November 2026: deleted cards, documents and boards wait in Trash
// for 30 days, then go for good; and each project keeps an audit log of who created, changed,
// deleted and restored which item, for 365 days, with one person's quick saves merged.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { AuditLog, changedFields } from "../server/audit.js";

const DAY = 86_400_000;
test("audit fields include removed optional values", () => {
  assert.deepEqual(changedFields({ data: { kind: "task", due: "2026-11-01" }, body: "Same" }, { kind: "task", body: "Same" }), ["due"]);
});
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-trash-"));
  const store = new Store(root);
  await store.init();
  const server = createServer(store);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const api = async (route, method = "GET", body) => {
    const response = await fetch(`${base}${route}`, { method, headers: { "Content-Type": "application/json", "X-Pencils-Name": "Ada" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    assert.ok(response.ok, `${method} ${route}: ${data.error}`);
    return data;
  };
  const project = await store.createProject({ title: "Records", key: "RC" });
  return { root, store, project, api, base };
}

test("deleted cards, documents and boards wait in the project's Trash, restore, and go for good after 30 days", async (t) => {
  const { root, store, project, api } = await setup(t);
  const p = `/projects/${project.id}`;
  const card = await api(`${p}/tasks`, "POST", { title: "Old card" });
  const doc = await api(`${p}/documents`, "POST", { title: "Old notes", body: "x" });
  const board = await api(`${p}/boards`, "POST", { title: "Old board" });
  await api(`${p}/tasks/${card.id}`, "DELETE", { revision: card.revision });
  await api(`${p}/documents/${doc.id}`, "DELETE", { revision: doc.revision });
  await api(`${p}/boards/${board.id}`, "DELETE", { revision: board.revision });
  const { items } = await api(`${p}/trash`);
  assert.deepEqual(items.map((i) => i.title).sort(), ["Old board", "Old card", "Old notes"]);
  for (const item of items) assert.equal(item.expires - item.deleted, 30 * DAY);
  // Restore brings the document back.
  await api(`${p}/trash`, "POST", { key: items.find((i) => i.kind === "document").key });
  assert.equal((await store.getDocument(project.id, doc.id)).title, "Old notes");
  // An item deleted before Trash arrived (1 November 2026) gets its 30 days from then.
  const folder = path.join(root, ".trash"), arrived = Date.UTC(2026, 10, 1);
  const old = items.find((i) => i.kind === "board").key;
  await fs.rename(path.join(folder, old), path.join(folder, old.replace(/^\d+/, String(arrived - 60 * DAY))));
  assert.equal((await api(`${p}/trash`)).items.find((i) => i.title === "Old board").expires, arrived + 30 * DAY);
  // Once its 30 days are over it is hidden, then deleted for good; younger ones stay.
  const later = arrived + 30 * DAY + 1;
  assert.deepEqual((await store.projectTrash(project.id, later)).map((i) => i.title), ["Old card"]);
  assert.equal(await store.purgeTrash(later), 1);
  assert.deepEqual((await fs.readdir(folder)).length, 1);
});

test("the audit log records who created, changed, deleted and restored each item, newest first", async (t) => {
  const { project, api } = await setup(t);
  const p = `/projects/${project.id}`;
  const card = await api(`${p}/tasks`, "POST", { title: "Plan launch" });
  const changed = await api(`${p}/tasks/${card.id}`, "PATCH", { revision: card.revision, status: "done" });
  // A second quick save by the same person merges into the same entry; a save that changes
  // nothing adds none.
  const again = await api(`${p}/tasks/${card.id}`, "PATCH", { revision: changed.revision, priority: "high" });
  await api(`${p}/tasks/${card.id}`, "PATCH", { revision: again.revision, priority: "high" });
  // A board save lists what people see changing, not its operation history.
  const board = (await api(`${p}`)).boards[0];
  await api(`${p}/boards/${board.id}`, "PATCH", { revision: board.revision, nodes: [{ id: "n1", type: "sticky", text: "Idea", x: 0, y: 0, w: 200, h: 120 }], edges: [] });
  const doc = await api(`${p}/documents`, "POST", { title: "Notes", body: "x" });
  await api(`${p}/documents/${doc.id}`, "DELETE", { revision: doc.revision });
  const { items } = await api(`${p}/trash`);
  await api(`${p}/trash`, "POST", { key: items[0].key });
  const { entries } = await api(`${p}/audit`);
  assert.deepEqual(entries.map((e) => [e.action, e.kind, e.title]), [
    ["restored", "document", "Notes"],
    ["deleted", "document", "Notes"],
    ["created", "document", "Notes"],
    ["edited", "board", board.title],
    ["edited", "card", "Plan launch"],
    ["created", "card", "Plan launch"],
  ]);
  assert.deepEqual(entries[3].fields, []);
  const edit = entries[4];
  assert.equal(edit.user, "Ada");
  assert.equal(edit.key, card.key);
  assert.deepEqual(edit.fields, ["priority", "status"]);
  // Older pages come with ?before.
  assert.deepEqual((await api(`${p}/audit?before=${entries[2].at}`)).entries.map((e) => e.action).slice(-2), ["edited", "created"]);
});

test("the audit log drops entries older than 365 days and starts a new entry ten minutes after an entry's first save", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-audit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const log = new AuditLog({ root, safe: async () => {} });
  const now = Date.now(), entry = (at, fields) => ({ at, user: "Ada", kind: "card", id: "t-1", title: "Card", action: "edited", fields });
  await log.record("p-1", entry(now - 400 * DAY, ["title"]));
  // Saves every six minutes: the third is more than ten minutes after the first.
  for (const minutes of [12, 6, 0]) await log.record("p-1", entry(now - minutes * 60_000, ["status"]));
  assert.equal((await log.list("p-1")).length, 2, "the old entry is hidden at once");
  // A file that isn't a project's log doesn't stop the purge.
  await fs.writeFile(path.join(root, ".audit", "a b.jsonl"), "");
  await log.purge(now);
  const text = await fs.readFile(path.join(root, ".audit", "p-1.jsonl"), "utf8");
  assert.equal(text.trim().split("\n").length, 2, "and purged from the file");
});

test("history restore, quick capture and imported cards appear in the audit log", async t => {
  const { project, api, base, store } = await setup(t), p = `/projects/${project.id}`;
  const doc = await api(`${p}/documents`, "POST", { title: "Restore me", body: "before" });
  const changed = await api(`${p}/documents/${doc.id}`, "PATCH", { revision: doc.revision, body: "after" });
  const history = await api(`/history?file=${encodeURIComponent(doc.file)}`);
  await api("/history", "POST", { file: doc.file, version: history.versions[0].revision, revision: changed.revision });
  const card = await api(`${p}/tasks`, "POST", { title: "Original card" });
  const edited = await api(`${p}/tasks/${card.id}`, "PATCH", { revision: card.revision, title: "Renamed card" });
  const cardHistory = await api(`/history?file=${encodeURIComponent(card.file)}`);
  await api("/history", "POST", { file: card.file, version: cardHistory.versions[0].revision, revision: edited.revision });
  const imported = await api(`${p}/import`, "POST", { notes: [{ name: "Imported.md", content: "Imported description" }] });
  assert.ok(imported);
  const token = await api("/capture-tokens", "POST", { project: project.id });
  const response = await fetch(`${base}/capture`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token.token}` }, body: JSON.stringify({ text: "Quick capture" }) });
  assert.equal(response.status, 201);
  const captured = await response.json();
  const rule = { id: "audit-rule", name: "Generated priority", trigger: "manual", field: "priority", value: "high", enabled: false };
  await api(`${p}/automations`, "POST", { rules: [rule] });
  await api(`${p}/automations`, "POST", { rules: [{ ...rule, enabled: true }] });
  await api(`${p}/automations/${rule.id}`, "POST", { preview: false });
  await assert.rejects(store.mutate(async () => { await store.createTask(project.id, { title: "Rolled back" }); throw Error("rollback"); }), /rollback/);
  const entries = (await api(`${p}/audit`)).entries;
  assert.ok(entries.some(e => e.action === "restored" && e.id === doc.id && e.user === "Ada"));
  assert.ok(entries.some(e => e.action === "restored" && e.id === card.id && e.fields.includes("title")));
  assert.ok(entries.some(e => e.action === "created" && e.title === "Imported" && e.user === "Ada"));
  assert.ok(entries.some(e => e.action === "created" && e.id === captured.id && e.user === token.username));
  assert.ok(entries.some(e => e.action === "edited" && e.id === captured.id && e.fields.includes("priority") && e.user === "Ada"));
  assert.ok(!entries.some(e => e.title === "Rolled back"));
  const current = await store.read(store.resolveFile(card.file));
  await store.mutate(() => store.write(store.resolveFile(card.file), { ...current.data, updated: new Date().toISOString() }, current.body, current), { user: "Ada" });
  assert.equal((await api(`${p}/audit`)).entries.length, entries.length, "metadata-only writes add no change entry");
});
