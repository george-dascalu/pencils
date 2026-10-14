import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

async function serverFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-api-"));
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
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = "GET", body) =>
    fetch(`${base}${route}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { root, store, base, request };
}
test("HTTP project/task lifecycle, revision errors and persistent deletion", async (t) => {
  const { request } = await serverFixture(t);
  let response = await request("/api/projects", "POST", {
    title: "Through the API",
  });
  assert.equal(response.status, 201);
  const project = await response.json();
  response = await request(`/api/projects/${project.id}/tasks`, "POST", {
    title: "First task",
  });
  assert.equal(response.status, 201);
  const task = await response.json();
  response = await request(
    `/api/projects/${project.id}/tasks/${task.id}`,
    "PATCH",
    { title: "Updated task", revision: task.revision },
  );
  assert.equal(response.status, 200);
  const updated = await response.json();
  response = await request(
    `/api/projects/${project.id}/tasks/${task.id}`,
    "PATCH",
    { title: "Stale", revision: task.revision },
  );
  assert.equal(response.status, 409);
  response = await request(`/api/projects/${project.id}`);
  assert.equal((await response.json()).tasks[0].title, "Updated task");
  response = await request(
    `/api/projects/${project.id}/tasks/${task.id}`,
    "DELETE",
    { revision: updated.revision },
  );
  assert.equal(response.status, 200);
  assert.equal(
    (await (await request(`/api/projects/${project.id}`)).json()).tasks.length,
    0,
  );
});
test("static app is self-contained and vault contents are not served as assets", async (t) => {
  const { request } = await serverFixture(t);
  for (const asset of [
    "/",
    "/app.js",
    "/styles.css",
    "/icon.svg",
    "/api/health",
  ])
    assert.equal((await request(asset)).status, 200);
  const index = await request("/");
  assert.match(
    index.headers.get("content-security-policy"),
    /default-src 'self'/,
  );
  assert.equal((await request("/server/store.js")).status, 404);
  assert.equal((await request("/vault/Projects")).status, 404);
  assert.equal((await request("/%2e%2e%2fpackage.json")).status, 404);
});
test("API rejects cross-origin writes, non-JSON bodies, invalid JSON, and oversize input", async (t) => {
  const { base } = await serverFixture(t);
  let response = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://another-site.example",
    },
    body: '{"title":"Blocked"}',
  });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/projects`, {
    method: "POST",
    body: "title=test",
  });
  assert.equal(response.status, 415);
  response = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{broken",
  });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Large", body: "a".repeat(2_000_001) }),
  });
  assert.equal(response.status, 413);
});

test("organisation API creates, renames and scopes multiple projects, including examples and moves", async (t) => {
  const { request } = await serverFixture(t);
  const initial = await (await request("/api/organisations")).json();
  assert.equal(initial.organisations.length, 1);
  let response = await request("/api/organisations", "POST", { title: "Acme" });
  assert.equal(response.status, 201);
  const organisation = await response.json();
  const projects = [];
  for (const title of ["Website", "Operations"]) {
    response = await request("/api/projects", "POST", {
      title,
      organisation: organisation.id,
    });
    assert.equal(response.status, 201);
    projects.push(await response.json());
  }
  response = await request(`/api/projects?organisation=${organisation.id}`);
  assert.equal((await response.json()).projects.length, 2);
  response = await request("/api/projects?organisation=o-default");
  assert.equal((await response.json()).projects.length, 0);
  response = await request(`/api/organisations/${organisation.id}`, "PATCH", {
    title: "Acme Studio",
    revision: organisation.revision,
  });
  assert.equal(response.status, 200);
  response = await request(`/api/organisations/${organisation.id}`);
  assert.equal((await response.json()).title, "Acme Studio");
  response = await request(`/api/organisations/${organisation.id}`, "PATCH", {
    title: "Stale",
    revision: organisation.revision,
  });
  assert.equal(response.status, 409);
  response = await request(`/api/projects/${projects[0].id}`, "PATCH", {
    organisation: "o-default",
    revision: projects[0].revision,
  });
  assert.equal(response.status, 200);
  response = await request(`/api/projects?organisation=${organisation.id}`);
  assert.equal((await response.json()).projects.length, 1);
  response = await request("/api/demo", "POST", {
    organisation: organisation.id,
  });
  assert.equal((await response.json()).organisation, organisation.id);
  response = await request("/api/projects?organisation=o-missing");
  assert.equal(response.status, 404);
  response = await request("/api/projects", "POST", {
    title: "Invalid",
    organisation: "o-missing",
  });
  assert.equal(response.status, 404);
});
