import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";
import { Auth } from "../server/auth.js";
import { merge } from "../public/sync.js";
import { nextDate, progress } from "../server/model.js";
async function setup(t, authMode = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-upgrade-")),
    store = new Store(root);
  await store.init();
  const auth = new Auth(store, authMode),
    server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (url, method = "GET", body, cookie = "") => {
    const response = await fetch(`${base}/api${url}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  };
  return { root, store, server, auth, base, request };
}
test("UTF-8 characters split across request chunks remain intact", async (t) => {
  const { server } = await setup(t);
  const body = Buffer.from(JSON.stringify({ title: "Café 東京 👋" })),
    cut = body.indexOf(Buffer.from("é")) + 1;
  const result = await new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: server.address().port,
        path: "/api/projects",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(chunks))));
      },
    );
    req.on("error", reject);
    req.write(body.subarray(0, cut));
    setTimeout(() => req.end(body.subarray(cut)), 10);
  });
  assert.equal(result.title, "Café 東京 👋");
});
test("history, trash and backups restore exact note content and keep current versions", async (t) => {
  const { store } = await setup(t),
    project = await store.createProject({ title: "Recovery" }),
    task = await store.createTask(project.id, {
      title: "First",
      body: "# Original\n",
    });
  const backup = await store.createBackup();
  const edited = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    title: "Second",
    body: "# Edited\n",
  });
  const versions = await store.history(task.file);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].body, "# Original\n");
  const restored = await store.restoreVersion(
    task.file,
    versions[0].revision,
    edited.revision,
  );
  assert.equal(restored.title, "First");
  assert.equal((await store.history(task.file)).length, 2);
  await store.deleteTask(project.id, task.id, restored.revision);
  const trash = await store.trash();
  assert.equal(trash.length, 1);
  await store.restoreTrash(trash[0].key);
  assert.equal((await store.snapshot(project.id)).tasks[0].title, "First");
  await store.createTask(project.id, { title: "After backup" });
  await store.restoreBackup(backup.id);
  assert.equal((await store.snapshot(project.id)).tasks.length, 1);
  assert.ok((await store.backups()).some((b) => b.reason === "before restore"));
});
test("project and board trash can be restored without changing task identifiers", async (t) => {
  const { store } = await setup(t),
    project = await store.createProject({ title: "Trash" }),
    task = await store.createTask(project.id, { title: "Task" }),
    board = (await store.snapshot(project.id)).boards[0];
  await store.removeRecord(project.id, "boards", board.id, board.revision);
  await store.restoreTrash((await store.trash())[0].key);
  assert.equal((await store.snapshot(project.id)).boards[0].id, board.id);
  await store.removeRecord(project.id, "project", null, project.revision);
  assert.equal((await store.list()).projects.length, 0);
  await store.restoreTrash((await store.trash())[0].key);
  assert.equal((await store.snapshot(project.id)).tasks[0].id, task.id);
});
test("custom workflows, typed fields, saved views, dependencies and recurrence survive restart", async (t) => {
  const { root, store } = await setup(t);
  let project = await store.createProject({ title: "Workflow" });
  project = await store.updateProject(project.id, {
    revision: project.revision,
    schema: {
      statuses: ["ready", "doing", "shipped"],
      types: ["feature", "chore"],
      done: ["shipped"],
      fields: [{ id: "points", name: "Points", type: "number" }],
    },
    views: [
      {
        id: "v-one",
        name: "Work",
        view: "table",
        filters: { assignee: "Ada" },
        columns: [{ key: "title", width: 350 }],
      },
    ],
  });
  const prerequisite = await store.createTask(project.id, {
      title: "First",
      fields: { points: 3 },
    }),
    task = await store.createTask(project.id, {
      title: "Monthly",
      dependencies: [prerequisite.id],
      due: "2026-01-31",
      recurrence: { unit: "month", interval: 1 },
    });
  await assert.rejects(
    () =>
      store.updateTask(project.id, prerequisite.id, {
        revision: prerequisite.revision,
        dependencies: [task.id],
      }),
    /cycle/,
  );
  await assert.rejects(
    () =>
      store.updateTask(project.id, task.id, {
        revision: task.revision,
        fields: { points: "bad" },
      }),
    /Invalid value/,
  );
  const done = await store.updateTask(project.id, task.id, {
    revision: task.revision,
    status: "shipped",
  });
  const snapshot = await new Store(root).snapshot(project.id);
  assert.equal(snapshot.project.views[0].name, "Work");
  assert.equal(snapshot.tasks.length, 3);
  assert.equal(
    snapshot.tasks.find((t) => t.id === done.recurrence_next).due,
    "2026-02-28",
  );
  const reopened = await store.updateTask(project.id, task.id, {
    revision: done.revision,
    status: "ready",
  });
  await store.updateTask(project.id, task.id, {
    revision: reopened.revision,
    status: "shipped",
  });
  assert.equal((await store.snapshot(project.id)).tasks.length, 3);
});
test("progress counts weighted leaf tasks and month recurrence clamps end-of-month", () => {
  assert.deepEqual(
    progress([
      { id: "p", status: "done" },
      { id: "a", parent: "p", status: "done", estimate: 3 },
      { id: "b", parent: "p", status: "todo", estimate: 1 },
    ]),
    { total: 2, done: 1, percent: 75 },
  );
  assert.equal(
    nextDate("2024-01-31", { unit: "month", interval: 1 }),
    "2024-02-29",
  );
});
test("three-way merge combines unrelated properties and board objects but reports genuine conflicts", () => {
  const base = {
      title: "One",
      status: "todo",
      nodes: [
        { id: "n-a", x: 1, text: "A" },
        { id: "n-b", x: 2, text: "B" },
      ],
    },
    local = structuredClone(base),
    remote = structuredClone(base);
  local.status = "done";
  local.nodes[0].x = 20;
  remote.title = "Two";
  remote.nodes[1].text = "Remote";
  let result = merge(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.value.nodes[0].x, 20);
  assert.equal(result.value.nodes[1].text, "Remote");
  assert.equal(result.value.title, "Two");
  remote.nodes[0].x = 30;
  result = merge(base, local, remote);
  assert.equal(result.conflicts[0].path, "nodes[n-a].x");
  assert.equal(result.value.nodes[0].x, 20);
});
test("Markdown import preserves arbitrary properties, aliases, body and safe attachment paths", async (t) => {
  const { store } = await setup(t),
    p = await store.createProject({ title: "Import" });
  const result = await store.importNotes(p.id, {
    notes: [
      {
        name: "Existing note.md",
        content:
          "---\ntitle: A useful note\nsource: Obsidian\ncustom: yes\n---\n# Notes\n\n[[Another note]]\n",
      },
    ],
  });
  assert.equal(result.tasks[0].source, "Obsidian");
  assert.equal(result.tasks[0].custom, "yes");
  assert.ok(result.tasks[0].aliases.includes("Existing note"));
  assert.match(result.tasks[0].body, /\[\[Another note\]\]/);
  const file = await store.attach(p.id, {
    name: "example.txt",
    data: Buffer.from("Hello").toString("base64"),
  });
  assert.equal(
    (await store.attachment(p.id, file.path.split("/")[1])).bytes.toString(),
    "Hello",
  );
  await assert.rejects(
    () => store.attachment(p.id, "../../outside"),
    /Invalid attachment/,
  );
  await assert.rejects(
    () => store.attach(p.id, { name: "bad.html", data: "YQ==" }),
    /Supported attachments/,
  );
});
test("authentication enforces viewer/editor organisation boundaries on every project and attachment route", async (t) => {
  const { store, auth, request } = await setup(t, true);
  const org = await store.createOrganisation({ title: "Private" }),
    p1 = await store.createProject({ title: "Shared" }),
    p2 = await store.createProject({ title: "Secret", organisation: org.id });
  await auth.save({
    username: "admin",
    password: "a-long-admin-password",
    admin: true,
    organisations: {},
  });
  await auth.save({
    username: "viewer",
    password: "a-long-viewer-password",
    admin: false,
    organisations: { "o-default": "viewer" },
  });
  await auth.save({
    username: "editor",
    password: "a-long-editor-password",
    admin: false,
    organisations: { "o-default": "editor" },
  });
  assert.equal((await request("/projects")).status, 401);
  const login = await request("/session", "POST", {
      username: "viewer",
      password: "a-long-viewer-password",
    }),
    cookie = login.cookie.split(";")[0];
  assert.match(login.cookie, /HttpOnly/);
  assert.equal(
    (await request("/projects", "GET", undefined, cookie)).body.projects.length,
    1,
  );
  assert.equal(
    (await request(`/projects/${p2.id}`, "GET", undefined, cookie)).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${p1.id}/tasks`,
        "POST",
        { title: "Denied" },
        cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/backups", "GET", undefined, cookie)).status,
    403,
  );
  assert.equal(
    (await request("/overview", "GET", undefined, cookie)).body.projects.length,
    1,
  );
  const edit = (
    await request("/session", "POST", {
      username: "editor",
      password: "a-long-editor-password",
    })
  ).cookie.split(";")[0];
  assert.equal(
    (
      await request(
        `/projects/${p1.id}/tasks`,
        "POST",
        { title: "Allowed" },
        edit,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/projects/${p1.id}`,
        "PATCH",
        { revision: p1.revision, organisation: org.id },
        edit,
      )
    ).status,
    403,
  );
  await auth.save({ username: "editor", admin: false, organisations: {} });
  assert.equal(
    (await request("/projects", "GET", undefined, edit)).status,
    401,
  );
});

test("history restore cannot move a project into an organisation outside the editor’s access", async (t) => {
  const { store, auth, request } = await setup(t, true);
  const privateOrg = await store.createOrganisation({ title: "Restricted" });
  const project = await store.createProject({
    title: "Moved project",
    organisation: privateOrg.id,
  });
  const moved = await store.updateProject(project.id, {
    revision: project.revision,
    organisation: "o-default",
  });
  await auth.save({
    username: "editor",
    password: "a-long-editor-password",
    admin: false,
    organisations: { "o-default": "editor" },
  });
  const login = await request("/session", "POST", {
    username: "editor",
    password: "a-long-editor-password",
  });
  const result = await request(
    "/history",
    "POST",
    { file: moved.file, revision: moved.revision, version: project.revision },
    login.cookie.split(";")[0],
  );
  assert.equal(result.status, 403);
  assert.equal(
    (await store.snapshot(project.id)).project.organisation,
    "o-default",
  );
});

test("saved view layouts reject malformed columns and preserve an existing definition", async (t) => {
  const { store } = await setup(t),
    project = await store.createProject({ title: "Views" });
  await assert.rejects(
    () =>
      store.updateProject(project.id, {
        revision: project.revision,
        views: [
          {
            id: "v-test",
            name: "Bad layout",
            view: "table",
            columns: "not-an-array",
          },
        ],
      }),
    /columns/,
  );
  assert.deepEqual((await store.snapshot(project.id)).project.views, []);
});

test("downloaded ZIP backups can be imported into a fresh vault and restored", async (t) => {
  const source = await setup(t),
    target = await setup(t);
  const project = await source.store.createProject({
    title: "Off-device recovery",
  });
  await source.store.createTask(project.id, {
    title: "Portable task",
    body: "# Safe elsewhere",
  });
  const backup = await source.store.createBackup();
  const imported = await target.store.importBackup({
    data: (await source.store.backupBytes(backup.id)).toString("base64"),
  });
  await target.store.restoreBackup(imported.id);
  assert.equal(
    (await target.store.snapshot(project.id)).tasks[0].title,
    "Portable task",
  );
});

test("retrying a partially completed recurrence does not duplicate its successor", async (t) => {
  const { store } = await setup(t),
    project = await store.createProject({ title: "Recurring recovery" });
  const task = await store.createTask(project.id, {
    title: "Daily review",
    recurrence: { unit: "day", interval: 1 },
    due: "2026-10-13",
  });
  const write = store.write.bind(store);
  let fail = true;
  store.write = async (file, data, body, existing) => {
    if (data.id === task.id && data.status === "done" && fail) {
      fail = false;
      throw new Error("Simulated interrupted completion");
    }
    return write(file, data, body, existing);
  };
  await assert.rejects(
    () =>
      store.updateTask(project.id, task.id, {
        revision: task.revision,
        status: "done",
      }),
    /interrupted completion/,
  );
  await store.updateTask(project.id, task.id, {
    revision: task.revision,
    status: "done",
  });
  const snapshot = await store.snapshot(project.id);
  assert.equal(snapshot.tasks.length, 2);
  assert.equal(
    snapshot.tasks.filter((t) => t.recurrence_source === task.id).length,
    1,
  );
});

test("task restoration is scoped to the project and requires editor access", async (t) => {
  const { store, auth, request } = await setup(t, true);
  const org = await store.createOrganisation({ title: "Private recovery" });
  const project = await store.createProject({ title: "Recover here" });
  const privateProject = await store.createProject({
    title: "Private",
    organisation: org.id,
  });
  const task = await store.createTask(project.id, {
    title: "Restore original",
    body: "Original description",
  });
  const original = await fs.readFile(
    store.file(project.id, "tasks", task.id),
    "utf8",
  );
  const privateTask = await store.createTask(privateProject.id, {
    title: "Private task",
  });
  await store.deleteTask(project.id, task.id, task.revision);
  await store.deleteTask(
    privateProject.id,
    privateTask.id,
    privateTask.revision,
  );
  const cookies = {};
  for (const role of ["viewer", "editor"]) {
    await auth.save({
      username: role,
      password: "a-long-recovery-password",
      admin: false,
      organisations: { "o-default": role },
    });
    cookies[role] = (
      await request("/session", "POST", {
        username: role,
        password: "a-long-recovery-password",
      })
    ).cookie.split(";")[0];
  }
  const url = `/projects/${project.id}/tasks/${task.id}/restore`;
  assert.equal((await request(url, "POST", {}, cookies.viewer)).status, 403);
  assert.equal(
    (
      await request(
        `/projects/${privateProject.id}/tasks/${privateTask.id}/restore`,
        "POST",
        {},
        cookies.editor,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/projects/${project.id}/tasks/${privateTask.id}/restore`,
        "POST",
        {},
        cookies.editor,
      )
    ).status,
    404,
  );
  assert.equal((await request(url, "POST", {}, cookies.editor)).status, 200);
  assert.equal(
    await fs.readFile(store.file(project.id, "tasks", task.id), "utf8"),
    original,
  );
  assert.equal((await request(url, "POST", {}, cookies.editor)).status, 404);
  assert.ok((await store.trash()).some((item) => item.id === privateTask.id));
});
