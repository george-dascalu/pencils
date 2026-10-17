import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { Sources } from "../server/sources.js";
import { createServer } from "../server/index.js";
test("private records never appear in another user's snapshots, search, attachments or recovery", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-boundaries-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true),
    privateOrg = await store.createOrganisation({ title: "Private" });
  const project = await store.createProject({
    title: "Secret project",
    organisation: privateOrg.id,
  });
  const task = await store.createTask(project.id, {
    title: "Secret task",
    body: "Private content",
  });
  const attachment = await store.attach(project.id, {
    name: "private.txt",
    data: Buffer.from("Secret attachment").toString("base64"),
  });
  await auth.save({
    username: "limited",
    password: "test-password-long",
    admin: false,
    organisations: { "o-default": "viewer" },
  });
  const sharedProject = await store.createProject({
    title: "Private source cache",
  });
  await new Sources(store, auth).configure(
    sharedProject.id,
    { username: "owner", admin: true },
    { provider: "jira", scope: { cloudId: "test", jql: "project = TEST" } },
  );
  const sharedTask = await store.createTask(sharedProject.id, {
    title: "Confidential source issue",
  });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(base + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "limited",
      password: "test-password-long",
    }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const get = (url) => fetch(base + url, { headers: { Cookie: cookie } });
  for (const url of [
    `/api/projects/${sharedProject.id}`,
    `/api/projects/${sharedProject.id}/sources`,
    `/api/projects/${sharedProject.id}/delta?since=0`,
    `/api/events?project=${sharedProject.id}`,
    `/api/projects/${sharedProject.id}/tasks/${sharedTask.id}`,
    `/api/history?file=${encodeURIComponent(sharedTask.file)}`,
    `/api/projects/${project.id}`,
    `/api/projects/${project.id}/tasks/${task.id}`,
    attachment.url,
    "/api/backups",
    "/api/trash",
    `/api/history?file=${encodeURIComponent(task.file)}`,
  ])
    assert.equal((await get(url)).status, 403, url);
  for (const url of [
    "/api/projects",
    "/api/overview",
    "/api/organisations",
    "/api/search?q=Confidential",
  ]) {
    const response = await get(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(
      await response.text(),
      /Secret|Private content|Private source cache|Confidential source issue/,
    );
  }
  const query = await fetch(base + `/api/projects/${sharedProject.id}/query`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(query.status, 403);
  const upload = await fetch(base + "/api/backups/upload", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/zip" },
    body: new Uint8Array([1, 2, 3]),
  });
  assert.equal(upload.status, 403);
  await auth.save({ username: "limited", admin: false, organisations: {} });
  assert.equal(
    (await get("/api/overview")).status,
    401,
    "revocation invalidates the existing session",
  );
  assert.equal((await get(attachment.url)).status, 401);
});
