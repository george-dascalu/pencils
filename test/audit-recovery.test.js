import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import os from "node:os";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { Store } from "../server/store.js";
import { BACKUP_EXPANDED_BYTES } from "../public/backup-limits.js";

const moduleURL = new URL("../server/store.js", import.meta.url).href;
async function fixture(t) {
  const root = await fs.mkdtemp("/tmp/pencils-recovery-audit-"), store = new Store(root);
  await store.init();
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = await store.createProject({ title: "Recovery" });
  await store.createTask(project.id, { title: "Keep this card" });
  return { root, store, project };
}
test("an interrupted restore recovers at every directory replacement", async t => {
  for (const stop of [1, 2, 3, 4]) await t.test(`replacement ${stop}`, async t => {
    const { root, store, project } = await fixture(t), backup = await store.createBackup();
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from 'node:fs/promises'; import { Store } from ${JSON.stringify(moduleURL)};
      const store = new Store(${JSON.stringify(root)}); await store.init();
      const rename = fs.rename; let moves = 0;
      fs.rename = async (a,b) => { await rename(a,b); if ([a,b].some(p => p === store.root + '/Projects' || p === store.root + '/Organisations') && ++moves === ${stop}) process.exit(73); };
      await store.mutate(() => store.restoreBackup(${JSON.stringify(backup.id)}));
    `], { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(child.status, 73, child.stderr);
    const restarted = new Store(root); await restarted.init(); t.after(() => restarted.close());
    assert.equal((await restarted.snapshot(project.id)).tasks[0].title, "Keep this card");
    assert.deepEqual(await restarted.journal.issues(), []);
    assert.deepEqual(await fs.readdir(restarted.journal.root), []);
  });
});
test("a crashed kernel lock recovers despite a replaced container identity, but excludes a live writer", async t => {
  const { root, store } = await fixture(t);
  await store.journal.start();
  const other = new Store(root);
  await assert.rejects(other.init(), { status: 423 });
  await store.journal.finish(true);
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs/promises'; import { Store } from ${JSON.stringify(moduleURL)};
    const store = new Store(${JSON.stringify(root)}); await store.init(); await store.journal.start();
    const file = store.journal.lock + '/owner.json', owner = JSON.parse(await fs.readFile(file));
    await fs.writeFile(file, JSON.stringify({...owner, host:'previous-container', pid:1})); process.exit(73);
  `], { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
  assert.equal(child.status, 73, child.stderr);
  await other.init(); other.close();
  await fs.mkdir(store.journal.lock);
  const afterIncomplete = new Store(root); await afterIncomplete.init(); afterIncomplete.close();
});
test("writer startup recovers a crash before its owner file, including migration of an old lock", async t => {
  for (const legacy of [false, true]) {
    const { root, store } = await fixture(t);
    await fs.rm(path.join(root, ".pencils", "writer.guard"));
    if (legacy) {
      await fs.mkdir(store.journal.lock);
      await fs.writeFile(path.join(store.journal.lock, "owner.json"), JSON.stringify({ host: os.hostname(), pid: 2147483647 }));
    }
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from 'node:fs/promises'; import { Store } from ${JSON.stringify(moduleURL)};
      const write = fs.writeFile; fs.writeFile = async (file,...args) => { if (String(file).endsWith('/writer.lock/owner.json')) process.exit(73); return write(file,...args); };
      await new Store(${JSON.stringify(root)}).init();
    `], { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } });
    assert.equal(child.status, 73, child.stderr);
    const restarted = new Store(root); await restarted.init(); restarted.close();
  }
});
test("writer guard rejects symlinks and a missing flock command without keeping a lock", async t => {
  const { root, store } = await fixture(t), guard = path.join(root, ".pencils", "writer.guard");
  await fs.rm(guard); await fs.symlink(path.join(root, "Organisations"), guard);
  await assert.rejects(store.journal.acquire(), /Symlinks/);
  await fs.rm(guard);
  const searchPath = process.env.PATH;
  try { process.env.PATH = ""; await assert.rejects(store.journal.acquire(), { code: "ENOENT" }); }
  finally { process.env.PATH = searchPath; }
  await store.journal.acquire(); await store.journal.release();
  await fs.rm(guard); await fs.mkdir(store.journal.lock);
  await fs.writeFile(path.join(store.journal.lock, "owner.json"), JSON.stringify({ host: os.hostname(), pid: "unknown" }));
  await assert.rejects(store.journal.acquire(), { status: 423 });
});
test("a failed guard sync aborts initial and legacy lock acquisition", async t => {
  for (const legacy of [false, true]) {
    const { root, store } = await fixture(t), guard = path.join(root, ".pencils", "writer.guard");
    await fs.rm(guard);
    if (legacy) {
      await fs.mkdir(store.journal.lock);
      await fs.writeFile(path.join(store.journal.lock, "owner.json"), JSON.stringify({ host: os.hostname(), pid: 2147483647 }));
    }
    const open = fs.open;
    try {
      fs.open = async (file, ...args) => { const handle = await open(file, ...args); if (file === guard) handle.sync = async () => { throw Object.assign(Error("sync failed"), { code: "EIO" }); }; return handle; };
      await assert.rejects(store.journal.acquire(), { code: "EIO" });
    } finally { fs.open = open; }
  }
});
test("automatic backups protect a vault beyond the ZIP limit and can restore it", async t => {
  const { root, store, project } = await fixture(t);
  const file = path.join(store.projectDir(project.id), "large.bin"), h = await fs.open(file, "w");
  await h.truncate(BACKUP_EXPANDED_BYTES + 1); await h.close();
  const card = (await store.snapshot(project.id)).tasks[0];
  await fs.rm(path.join(root, ".backups"), { recursive: true, force: true });
  store.lastBackupDay = null;
  await store.mutate(() => store.updateTask(project.id, card.id, { revision: card.revision, title: "Changed" }));
  const backup = (await store.backups())[0];
  assert.equal(backup.format, "directory");
  assert.equal((await store.verifyBackup(backup.id)).ok, true);
  await store.mutate(() => store.restoreBackup(backup.id));
  assert.equal((await store.snapshot(project.id)).tasks[0].title, "Keep this card");
  assert.equal((await fs.stat(file)).size, BACKUP_EXPANDED_BYTES + 1);
  assert.ok((await fs.readdir(path.join(root, ".backups"))).length);
});
test("history pages contain summaries and fetch only the chosen version's contents", async t => {
  const { root, store, project } = await fixture(t);
  let doc = await store.createDocument(project.id, { title: "Versions", body: "first" });
  for (let i = 0; i < 4; i++) doc = await store.updateDocument(project.id, doc.id, { revision: doc.revision, body: `body ${i}` });
  const page = await store.historyPage(doc.file, { limit: 2 });
  assert.equal(page.versions.length, 2);
  assert.ok(page.next);
  assert.equal(page.versions[0].body, undefined);
  assert.equal(page.versions[0].data.nodes, undefined);
  assert.equal(page.versions[0].previous, page.versions[1].revision);
  const older = await store.historyPage(doc.file, { limit: 2, cursor: page.next });
  assert.equal(older.versions.length, 2);
  assert.equal(older.next, null);
  assert.equal(new Set([...page.versions, ...older.versions].map(v => v.revision)).size, 4);
  assert.equal((await store.historyVersion(doc.file, older.versions.at(-1).revision)).body, "first");
  const folder = path.join(root, ".history", createHash("sha256").update(doc.file).digest("hex"));
  const revisions = [...page.versions, ...older.versions].map(v => v.revision).sort();
  for (const [i, revision] of revisions.entries()) {
    const file = path.join(folder, `${revision}.json`), row = JSON.parse(await fs.readFile(file));
    row.updated = i < 2 ? "2026-10-31T12:00:00Z" : "2026-10-30T12:00:00Z";
    await fs.writeFile(file, JSON.stringify(row));
  }
  assert.deepEqual((await store.historyPage(doc.file)).versions.map(v => v.revision), [revisions[1], revisions[0], revisions[3], revisions[2]], "newest dates first, with a stable revision order for ties");
});
test("history validates paths and cursors, and rebuilds old metadata without reading indexed versions", async t => {
  const { root, store, project } = await fixture(t);
  let doc = await store.createDocument(project.id, { title: "Old history", body: "before" });
  assert.deepEqual(await store.historyPage(doc.file), { versions: [], next: null });
  await assert.rejects(store.historyPage("../elsewhere"), { status: 400 });
  await assert.rejects(store.historyVersion("../elsewhere", "a".repeat(64)), { status: 400 });
  await assert.rejects(store.historyVersion(doc.file, "invalid"), { status: 400 });
  const revision = doc.revision;
  doc = await store.updateDocument(project.id, doc.id, { revision, body: "after" });
  const dir = path.join(root, ".history", createHash("sha256").update(doc.file).digest("hex")), metadata = path.join(dir, `${revision}.json`);
  const read = store.read.bind(store);
  store.read = file => { assert.ok(!file.includes("/.history/"), "indexed history must not read full snapshots"); return read(file); };
  assert.equal((await store.historyPage(doc.file)).versions[0].previous, null);
  store.read = read;
  await fs.rm(metadata);
  assert.equal((await store.historyPage(doc.file)).versions[0].title, doc.title);
  assert.equal(JSON.parse(await fs.readFile(metadata)).title, doc.title);
  await fs.writeFile(metadata, "{");
  assert.equal((await store.historyPage(doc.file)).versions.length, 1);
  await assert.rejects(store.historyPage(doc.file, { cursor: "not-a-version" }), { status: 400 });
  await fs.rm(metadata); await fs.symlink(path.join(dir, `${revision}.md`), metadata);
  await assert.rejects(store.historyPage(doc.file), /Symlinks/);
});
test("directory backups omit private files and refuse invalid paths, symlinks and missing organisations", async t => {
  const { root, store, project } = await fixture(t), folder = store.projectDir(project.id);
  await fs.writeFile(path.join(folder, ".private"), "secret");
  await fs.writeFile(path.join(folder, "partial.tmp"), "partial");
  await fs.symlink(path.join(folder, "project.md"), path.join(folder, "alias.md"));
  const backup = await store.createDirectoryBackup("test"), dir = await store.backupDirectory(backup.id);
  for (const name of [".private", "partial.tmp", "alias.md"]) await assert.rejects(fs.stat(path.join(dir, "Projects", project.id, name)), { code: "ENOENT" });
  await assert.rejects(store.backupDirectory("../invalid"), { status: 400 });
  await assert.rejects(store.backupDirectory(1234567890123), { status: 400 });
  await assert.rejects(store.backupBytes(backup.id), { status: 413 });
  await fs.symlink(path.join(folder, "project.md"), path.join(dir, "unsafe.md"));
  await assert.rejects(store.verifyBackup(backup.id), /Symlinks/);
  await fs.rm(path.join(dir, "unsafe.md"));
  await fs.writeFile(path.join(dir, "outside.md"), "invalid");
  await assert.rejects(store.verifyBackup(backup.id), { status: 400 });
  await fs.rm(path.join(dir, "outside.md"));
  await fs.rm(path.join(dir, "Organisations"), { recursive: true });
  await assert.rejects(store.verifyBackup(backup.id), /no organisations/);
  await assert.rejects(store.restoreBackup(backup.id), /no organisations/);
  assert.equal((await store.snapshot(project.id)).tasks[0].title, "Keep this card");
});
test("backup failures leave no directory snapshot and restore rejects unsafe ZIP paths", async t => {
  const { root, store, project } = await fixture(t), folder = path.join(root, ".backups"), before = await fs.readdir(folder);
  const copy = fs.cp;
  for (const partial of [false, true]) try {
    fs.cp = async (...args) => { if (partial) await copy(...args); throw Object.assign(Error("disk error"), { code: "EIO" }); };
    await assert.rejects(store.createDirectoryBackup("failed"), { code: "EIO" });
  } finally { fs.cp = copy; }
  assert.deepEqual(await fs.readdir(folder), before);
  const stat = fs.stat;
  try {
    fs.stat = async (file, ...args) => { if (file === path.join(store.projectDir(project.id), "project.md")) throw Object.assign(Error("cannot read"), { code: "EACCES" }); return stat(file, ...args); };
    await assert.rejects(store.createBackup(), { code: "EACCES" });
  } finally { fs.stat = stat; }
  const id = "invalid-backup-20261101";
  await fs.writeFile(path.join(folder, `${id}.zip`), zipSync({ "Organisations/org.md": strToU8("org"), "../outside.md": strToU8("unsafe") }));
  await assert.rejects(store.restoreBackup(id), { status: 400 });
});
test("recovery rejects symlinked directories and reports storage errors without hiding them", async t => {
  const { root, store, project } = await fixture(t);
  let doc = await store.createDocument(project.id, { title: "Storage errors", body: "before" });
  const revision = doc.revision;
  doc = await store.updateDocument(project.id, doc.id, { revision, body: "after" });
  const dir = path.join(root, ".history", createHash("sha256").update(doc.file).digest("hex"));
  const fault = async (method, file, operation) => {
    const original = fs[method];
    try { fs[method] = async (name, ...args) => { if (name === file) throw Object.assign(Error("disk error"), { code: "EIO" }); return original(name, ...args); }; await assert.rejects(operation(), { code: "EIO" }); }
    finally { fs[method] = original; }
  };
  await fault("readdir", dir, () => store.historyPage(doc.file));
  await fault("readFile", path.join(dir, `${revision}.json`), () => store.historyPage(doc.file));
  const backupDir = path.join(root, ".backups", "linked-backup-files.files");
  await fault("stat", backupDir, () => store.backupDirectory("linked-backup-files"));
  await fs.symlink(path.join(root, "Projects"), backupDir);
  await assert.rejects(store.backupDirectory("linked-backup-files"), /Symlinks/);
  const empty = await store.createDocument(project.id, { title: "No versions" });
  await fs.mkdir(path.join(root, "empty"));
  await fs.symlink(path.join(root, "empty"), path.join(root, ".history", createHash("sha256").update(empty.file).digest("hex")));
  await assert.rejects(store.historyPage(empty.file), /Symlinks/);
  await fs.rm(path.join(root, ".pencils", "writer.guard"));
  await fault("stat", store.journal.lock, () => store.journal.acquire());
});
test("light project snapshots and deltas include full contents only for the open board", async t => {
  const { store, project } = await fixture(t);
  let board = (await store.snapshot(project.id)).boards[0];
  const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}`, type: "sticky", text: "Large board contents", x: i, y: 0, w: 100, h: 100 }));
  const since = store.version;
  board = await store.updateBoard(project.id, board.id, { revision: board.revision, nodes, edges: [] });
  const light = await store.snapshot(project.id, { summaries: true });
  assert.equal(light.boards[0].summary, true);
  assert.equal(light.boards[0].nodes, undefined);
  assert.equal(light.boards[0].nodeCount, 1000);
  assert.equal(light.boards[0].strokeCount, 0);
  assert.ok(JSON.stringify(light).length < 20000);
  const open = await store.snapshot(project.id, { summaries: true, board: board.id });
  assert.equal(open.boards[0].nodes.length, 1000);
  const delta = await store.delta(project.id, since, { summaries: true });
  assert.equal(delta.records.find(r => r.kind === "boards").value.nodes, undefined);
  assert.ok(delta.records.find(r => r.kind === "boards").value.summary);
  assert.equal((await store.delta(project.id, since, { summaries: true, board: board.id })).records.find(r => r.kind === "boards").value.nodes.length, 1000);
  (await store.children(project.id, "boards")).items[0].nodes.pop();
  assert.equal((await store.snapshot(project.id)).boards[0].nodes.length, 1000, "a returned board is a copy");
});
test("deltas validate every record kind before returning either summaries or contents", async t => {
  const { store, project } = await fixture(t);
  const doc = await store.createDocument(project.id, { title: "Validate" });
  const snapshot = await store.snapshot(project.id);
  for (const record of [doc, snapshot.tasks[0], snapshot.boards[0]]) {
    const file = store.resolveFile(record.file), before = await store.read(file), since = store.version;
    await store.write(file, { ...before.data, title: "Valid rename" }, before.body, before);
    assert.equal((await store.delta(project.id, since, { summaries: true })).full, false);
    await store.write(file, { ...before.data, title: "x".repeat(301) }, before.body, await store.read(file));
    assert.equal((await store.delta(project.id, since, { summaries: true })).full, true);
    await store.write(file, before.data, before.body, await store.read(file));
  }
});
