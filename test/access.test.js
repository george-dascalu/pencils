// authorizeWrite checks each write again inside the store's write lock. The routes check the same
// things first, so the HTTP tests (route-access) pass with any of its checks removed
// (npm run test:mutants); these call it directly.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { authorizeWrite } from "../server/http/access.js";

test("a write needs a signed-in person with edit access where it lands, then and now", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-access-"));
  const store = new Store(root);
  await store.init();
  t.after(async () => {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const hidden = await store.createOrganisation({ title: "Hidden" });
  const open = await store.createProject({ title: "Open" });
  const secret = await store.createProject({ title: "Secret", organisation: hidden.id });
  const synced = await store.createProject({ title: "Synced" });
  const record = await store.read(store.file(synced.id, "project"));
  await store.write(store.file(synced.id, "project"), { ...record.data, source_owner: "boss" }, record.body, record);
  // Viewers of an organisation can read it, so a check that asks only for reading lets them through.
  const people = {
    boss: { username: "boss", admin: true, organisations: {} },
    editor: { username: "editor", admin: false, organisations: { "o-default": "editor", [hidden.id]: "viewer" } },
    viewer: { username: "viewer", admin: false, organisations: { "o-default": "viewer" } },
    insider: { username: "insider", admin: false, organisations: { [hidden.id]: "editor" } },
  };
  const auth = new Auth(store, true);
  // The status a write to `url` gets: 200 when it may go ahead.
  const status = (who, url, data = {}) => {
    const parts = url.split("/").filter(Boolean), [, resource, project, kind] = parts;
    const ctx = { store, auth: Object.assign(Object.create(auth), { user: async () => people[who] || null }), req: { pencilsInput: data }, parts, resource, project, kind };
    return authorizeWrite(ctx).then(() => 200, (error) => error.status);
  };

  assert.equal(await status(null, `/api/projects/${open.id}/tasks`), 401);
  for (const resource of ["accounts", "backups", "trash", "organisations"]) {
    assert.equal(await status("editor", `/api/${resource}`), 403, resource);
    assert.equal(await status("boss", `/api/${resource}`), 200, resource);
  }
  assert.equal(await status("editor", "/api/organisations/o-default"), 200);
  assert.equal(await status("viewer", "/api/organisations/o-default"), 403);
  assert.equal(await status("editor", `/api/organisations/${hidden.id}`), 403);
  assert.equal(await status("editor", `/api/projects/${open.id}/sources`), 403, "sources are for administrators");

  // A project's records: edit access to its organisation, and its private source data.
  assert.equal(await status("editor", `/api/projects/${open.id}/tasks`), 200);
  assert.equal(await status("viewer", `/api/projects/${open.id}/tasks`), 403);
  assert.equal(await status("editor", `/api/projects/${secret.id}/tasks`), 403);
  assert.equal(await status("insider", `/api/projects/${secret.id}/tasks`), 200);
  assert.equal(await status("editor", `/api/projects/${synced.id}/tasks`), 403, "someone else's source data");
  assert.equal(await status("boss", `/api/projects/${synced.id}/tasks`), 200);

  // New projects and demos need edit access to their organisation, and a move to where it goes.
  assert.equal(await status("editor", "/api/projects"), 200);
  assert.equal(await status("viewer", "/api/projects"), 403);
  assert.equal(await status("editor", "/api/projects", { organisation: hidden.id }), 403);
  assert.equal(await status("viewer", "/api/demo"), 403);
  assert.equal(await status("editor", `/api/projects/${open.id}`, { title: "Renamed" }), 200);
  assert.equal(await status("editor", `/api/projects/${open.id}`, { organisation: hidden.id }), 403);
  assert.equal(await status("editor", `/api/projects/${open.id}/tasks`, { organisation: hidden.id }), 200, "only the project itself moves");

  // Restoring a version needs edit access to where the file lives, and for a project, to where that version was.
  const task = await store.createTask(open.id, { title: "First" });
  await store.updateTask(open.id, task.id, { title: "Second", revision: task.revision });
  const taskVersion = (await store.history(task.file)).find((v) => v.data.title === "First");
  assert.equal(await status("editor", "/api/history", { file: task.file, version: taskVersion.revision }), 200);
  assert.equal(await status("viewer", "/api/history", { file: task.file, version: taskVersion.revision }), 403);
  assert.equal(await status("editor", "/api/history", { file: hidden.file }), 403, "an organisation's own record");
  const moved = await store.createProject({ title: "Moved", organisation: hidden.id });
  const here = await store.updateProject(moved.id, { organisation: "o-default", teams: [], revision: moved.revision });
  await store.updateProject(moved.id, { title: "Moved here", revision: here.revision });
  const versions = await store.history(here.file);
  const there = versions.find((v) => v.data.organisation === hidden.id), local = versions.find((v) => v.data.organisation === "o-default");
  assert.ok(there && local, "the history has a version in each organisation");
  assert.equal(await status("editor", "/api/history", { file: here.file, version: local.revision }), 200);
  assert.equal(await status("editor", "/api/history", { file: here.file, version: there.revision }), 403);
});
