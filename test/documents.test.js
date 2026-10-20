import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

test("documents persist as Markdown, report changes and use revision/history/trash protection", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-documents-"));
  const store = new Store(root);
  t.after(async () => { store.close(); await fs.rm(root, { recursive: true, force: true }); });
  await store.init();
  const project = await store.createProject({ title: "Documents" });
  const other = await store.createProject({ title: "Other" });
  const before = store.version;
  const doc = await store.createDocument(project.id, { title: "Brief", body: "# Goals\n\n- **One**\n- Two\n" });
  assert.match(doc.file, /\/documents\/d-[\w-]+\.md$/);
  assert.match(await fs.readFile(path.join(root, doc.file), "utf8"), /kind: document/);
  assert.deepEqual((await store.snapshot(project.id)).documents, [doc]);
  assert.deepEqual((await store.snapshot(project.id)).tasks, []);
  assert.deepEqual((await store.delta(project.id, before)).records.map(r => r.kind), ["documents"]);
  await assert.rejects(() => store.getDocument(other.id, doc.id), e => e.status === 404);
  await assert.rejects(() => store.getDocument(project.id, "../project"), e => e.status === 400);
  await assert.rejects(() => store.updateDocument(project.id, doc.id, { title: "Oops" }), e => e.status === 428);
  const updated = await store.updateDocument(project.id, doc.id, { title: "Renamed brief", body: "Updated\n\nNotes", revision: doc.revision, project: other.id, kind: "task" });
  assert.equal(updated.kind, "document");
  assert.equal(updated.project, project.id);
  assert.equal(doc.version, 1);
  assert.equal(updated.version, 2);
  const same = await store.updateDocument(project.id, doc.id, { title: updated.title, body: updated.body, revision: updated.revision, version: 999 });
  assert.equal(same.revision, updated.revision, "No-op saves do not create a version");
  assert.equal((await store.history(doc.file))[0].body, doc.body);
  await assert.rejects(() => store.updateDocument(project.id, doc.id, { body: "Stale", revision: doc.revision }), e => e.status === 409);
  await assert.rejects(() => store.createDocument(project.id, { title: "", body: "" }), e => e.status === 400);
  await assert.rejects(() => store.createDocument(project.id, { title: "Too long", body: "a".repeat(200001) }), e => e.status === 400);
  const restarted = new Store(root);
  t.after(() => restarted.close());
  assert.equal((await restarted.snapshot(project.id)).documents[0].body, updated.body);
  await store.removeRecord(project.id, "documents", doc.id, updated.revision);
  assert.deepEqual((await store.snapshot(project.id)).documents, []);
  const trash = (await store.trash()).find(d => d.id === doc.id);
  assert.equal(trash.kind, "document");
  await store.restoreTrash(trash.key);
  assert.equal((await store.getDocument(project.id, doc.id)).body, updated.body);
});

test("document folders and versions survive moves and restores without overwriting current content", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-doc-folders-"));
  const store = new Store(root); await store.init();
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  let project = await store.createProject({ title: "Folders" });
  const folders = [{ id: "a", title: "Notes", parent: null }, { id: "b", title: "Meetings", parent: "a" }];
  project = await store.updateProject(project.id, { revision: project.revision, document_folders: folders });
  const first = await store.createDocument(project.id, { title: "Agenda", body: "# Original", folder: "b" });
  const edited = await store.updateDocument(project.id, first.id, { revision: first.revision, body: "# Edited" });
  const moved = await store.updateDocument(project.id, first.id, { revision: edited.revision, folder: "a" });
  assert.equal(moved.version, 3); assert.equal(moved.body, "# Edited");
  await assert.rejects(() => store.updateProject(project.id, { revision: project.revision, document_folders: [] }), e => e.status === 400);
  await assert.rejects(() => store.updateProject(project.id, { revision: project.revision, document_folders: [{ ...folders[0], parent: "b" }, folders[1]] }), e => e.status === 400);
  await assert.rejects(() => store.updateDocument(project.id, first.id, { revision: moved.revision, folder: "missing" }), e => e.status === 400);
  await assert.rejects(() => store.restoreVersion(first.file, first.revision, edited.revision), e => e.status === 409);
  const restored = await store.restoreVersion(first.file, first.revision, moved.revision);
  assert.equal(restored.version, 4); assert.equal(restored.body, "# Original"); assert.equal(restored.folder, "a");
  assert.deepEqual((await store.history(first.file)).map(v => v.data.version).sort(), [1, 2, 3]);
  await store.snapshot(project.id);
  const restarted = new Store(root);
  t.after(() => restarted.close());
  assert.equal((await restarted.getDocument(project.id, first.id)).version, 4);
  assert.deepEqual((await restarted.snapshot(project.id)).project.document_folders, folders);
});

test("document API enforces project access and viewer/editor permissions", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-document-access-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  const privateOrg = await store.createOrganisation({ title: "Private" });
  const shared = await store.createProject({ title: "Shared" });
  const privateProject = await store.createProject({ title: "Private", organisation: privateOrg.id });
  const doc = await store.createDocument(shared.id, { title: "Shared brief", body: "Readable" });
  const secret = await store.createDocument(privateProject.id, { title: "Private brief", body: "Secret" });
  for (const role of ["viewer", "editor"])
    await auth.save({ username: role, password: "document-test-password", admin: false, organisations: { "o-default": role } });
  const server = createServer(store, { auth });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  for (const role of ["viewer", "editor"]) {
    const login = await fetch(base + "/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: role, password: "document-test-password" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    const request = (url, method = "GET", body) => fetch(base + url, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    for (const suffix of ["", `/${secret.id}`])
      assert.equal((await request(`/projects/${privateProject.id}/documents${suffix}`)).status, 403);
    const url = `/projects/${shared.id}/documents`;
    assert.equal((await request(url)).status, 200);
    assert.equal((await request(`${url}/${doc.id}`)).status, 200);
    const create = await request(url, "POST", { title: "New document", body: "New text" });
    assert.equal(create.status, role === "editor" ? 201 : 403);
    const patch = await request(`${url}/${doc.id}`, "PATCH", { revision: doc.revision, body: "Updated text" });
    assert.equal(patch.status, role === "editor" ? 200 : 403);
    const latest = role === "editor" ? await patch.json() : doc;
    assert.equal((await request(`${url}/${doc.id}`, "DELETE", { revision: latest.revision })).status, role === "editor" ? 200 : 403);
  }
});
