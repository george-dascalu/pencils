import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

// Owner request, 29 October 2026: search as in Obsidian's Omnisearch, across cards, documents
// and board text in every project you can open, ranked, with excerpts.
test("search ranks cards, documents and boards together, with excerpts, query syntax and suggestions", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-search-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  await auth.save({ username: "sam", password: "test-password-long", admin: false, organisations: { "o-default": "editor" } });
  await auth.save({ username: "boss", password: "test-password-long", admin: true, organisations: {} });
  const project = await store.createProject({ title: "Search work", key: "SW" });
  await store.createTask(project.id, { title: "Roadmap review", body: "Quarterly goals" });
  await store.createTask(project.id, { title: "Server patch", tags: ["ops"] });
  const plan = await store.createDocument(project.id, { title: "Roadmap plan", body: "## Milestones\n\nWe ship the café menu. #launch\n" });
  await store.createDocument(project.id, { title: "Meeting", body: "Discuss the roadmap with the team." });
  const board = await store.createBoard(project.id, { title: "Roadmap sketches" });
  await store.updateBoard(project.id, board.id, { revision: board.revision, nodes: [{ id: "n1", type: "text", x: 0, y: 0, w: 100, h: 100, text: "Sticky about receipts" }] });
  const hidden = await store.createOrganisation({ title: "Hidden" });
  await store.createDocument((await store.createProject({ title: "Secret", organisation: hidden.id })).id, { title: "Zebracorn", body: "zebracorn" });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = async (username) => (await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) })).headers.get("set-cookie").split(";")[0];
  const cookie = await session("sam"), boss = await session("boss");
  const search = async (q, as = cookie) => (await fetch(`${base}/api/search?q=${encodeURIComponent(q)}`, { headers: { Cookie: as } })).json();
  assert.deepEqual((await search("zebracorn", boss)).results.map((r) => r.title), ["Zebracorn"], "an administrator's search indexes the hidden project too");
  const titles = async (q) => (await search(q)).results.map((r) => r.title);

  const all = await search("roadmap");
  assert.deepEqual(all.results.map((r) => r.kind).sort(), ["board", "card", "doc", "doc"]);
  assert.equal(all.results.at(-1).title, "Meeting", "a title match ranks above a match in the text");
  assert.equal(all.results.find((r) => r.kind === "card").key, "SW-1");
  assert.match(all.results.find((r) => r.title === "Meeting").excerpt, /\u0002roadmap\u0003/, "excerpts mark the match");
  assert.deepEqual(await titles("roadmap in:docs"), ["Roadmap plan", "Meeting"]);
  assert.deepEqual((await titles("roadmap -review")).sort(), ["Meeting", "Roadmap plan", "Roadmap sketches"]);
  assert.deepEqual(await titles("cafe"), ["Roadmap plan"], "accents don't matter");
  assert.deepEqual(await titles('"ship the cafe"'), ["Roadmap plan"]);
  assert.deepEqual(await titles("#launch"), ["Roadmap plan"]);
  assert.deepEqual(await titles("#ops"), ["Server patch"]);
  assert.deepEqual(await titles("mile"), ["Roadmap plan"], "words match as prefixes, headings included");
  assert.deepEqual(await titles("receipts"), ["Roadmap sketches"], "board text");
  const typo = await search("reciepts");
  assert.deepEqual(typo.results, []);
  assert.equal(typo.suggestion, "receipts");
  assert.equal((await search("zebracorm")).suggestion, null, "suggestions never come from projects you can't open");
  await store.createDocument(project.id, { title: "Markdown showcase", body: "Every element." });
  for (const title of ["Call", "Email"]) await store.createTask(project.id, { title, body: "Ask Thomas first." });
  assert.equal((await search("Shocas")).suggestion, "showcase", "of two words as near, the one keeping the first letter");
  assert.deepEqual(await titles("zebracorn"), []);
  await store.createDocument(project.id, { title: "Bestiary", body: "A zebracornish beast." });
  assert.equal((await search("zebracorm")).suggestion, null, "not even when the hidden word starts a visible one");
  // Edits are indexed on the next search.
  await store.updateDocument(project.id, plan.id, { revision: plan.revision, body: "Now about lighthouses." });
  assert.deepEqual(await titles("lighthouse"), ["Roadmap plan"]);
  assert.deepEqual(await titles("cafe"), []);
  // An unreadable file is left out instead of failing every search.
  const broken = path.join(root, "Projects", project.id, "documents", "d-broken.md");
  await fs.writeFile(broken, "---\nid: [\n---\nlighthouse\n");
  store.changed(broken);
  assert.deepEqual(await titles("lighthouse"), ["Roadmap plan"]);
});
