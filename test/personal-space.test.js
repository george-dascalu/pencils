import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";

// Owner request, 29 October 2026: documents in a personal space outside every project,
// which only its owner can open (administrators included).
test("a personal space opens only for its owner and stays out of organisations", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-personal-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  for (const [username, admin] of [["alice", false], ["bob", false], ["root", true]])
    await auth.save({ username, password: "test-password-long", admin, organisations: { "o-default": "editor" } });
  const shared = await store.createProject({ title: "Shared work" });
  const server = createServer(store, { auth });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = async (username) => {
    const login = await fetch(base + "/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: "test-password-long" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0];
    return (url, method = "GET", body) => fetch(base + url, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  };
  const alice = await session("alice"), bob = await session("bob"), admin = await session("root");

  const opened = await alice("/api/personal", "POST", {});
  assert.equal(opened.status, 200);
  const { project } = await opened.json();
  assert.equal(project.personal, "alice");
  assert.equal(project.default_view, "documents");
  assert.equal((await (await alice("/api/personal", "POST", {})).json()).project.id, project.id, "the same space opens again");
  const made = await alice(`/api/projects/${project.id}/documents`, "POST", { title: "Diary", body: "Private thoughts" });
  assert.equal(made.status, 201);
  const doc = await made.json();
  assert.equal((await alice(`/api/projects/${project.id}`)).status, 200);

  for (const user of [bob, admin]) {
    for (const url of [`/api/projects/${project.id}`, `/api/projects/${project.id}/documents/${doc.id}`, `/api/organisations/${project.organisation}`, `/api/events?project=${project.id}`, `/api/history?file=${encodeURIComponent(doc.file)}`])
      assert.equal((await user(url)).status, 403, url);
    assert.equal((await user(`/api/projects/${project.id}/documents/${doc.id}`, "PATCH", { title: "Taken", revision: doc.revision })).status, 403);
    for (const url of ["/api/projects", "/api/organisations", "/api/overview"])
      assert.doesNotMatch(await (await user(url)).text(), new RegExp(`${project.id}|${project.organisation}|Diary|Private thoughts`), url);
  }
  // Nothing moves in or out of a personal space, and no other project starts in one.
  assert.equal((await alice("/api/projects", "POST", { title: "Hidden", organisation: project.organisation })).status, 400);
  assert.equal((await alice("/api/demo", "POST", { organisation: project.organisation })).status, 400);
  const sharedRecord = await (await alice(`/api/projects/${shared.id}`)).json();
  assert.equal((await alice(`/api/projects/${shared.id}`, "PATCH", { organisation: project.organisation, revision: sharedRecord.project.revision })).status, 400);
  const own = await (await alice(`/api/projects/${project.id}`)).json();
  assert.equal((await alice(`/api/projects/${project.id}`, "PATCH", { organisation: "o-default", revision: own.project.revision })).status, 400);
  // Administrators manage the trash, except what came from someone else's personal space.
  assert.equal((await alice(`/api/projects/${project.id}/documents/${doc.id}`, "DELETE", { revision: doc.revision })).status, 200);
  const trashed = (await store.trash()).find((item) => item.id === doc.id);
  assert.ok(trashed, "the document is in the trash");
  assert.doesNotMatch(await (await admin("/api/trash")).text(), /Diary/);
  assert.equal((await admin("/api/trash", "POST", { key: trashed.key })).status, 403);
  assert.equal((await bob("/api/personal", "POST", {})).status, 200);
  assert.notEqual((await (await bob("/api/personal", "POST", {})).json()).project.id, project.id, "each account has its own space");
});
