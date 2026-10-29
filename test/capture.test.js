import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Auth } from "../server/auth.js";
import { createServer } from "../server/index.js";
import { captureCard } from "../server/capture.js";

// Owner request, 29 October 2026 (note-taking research, idea 10): an iOS Shortcut sends text to a
// project's inbox with a token made in Settings → You.
test("captured text becomes a card: first line the title, the rest its description, #tags its tags", () => {
  assert.deepEqual(captureCard("Buy milk #home\n\nFrom the corner shop #errand #home"), { title: "Buy milk", body: "From the corner shop #errand #home", tags: ["home", "errand", "inbox"] });
  assert.deepEqual(captureCard("  #idea  "), { title: "#idea", body: "", tags: ["idea", "inbox"] }, "a line of tags stays the title");
  const long = "x".repeat(400);
  assert.deepEqual(captureCard(long), { title: "x".repeat(300), body: long, tags: ["inbox"] }, "a long first line is kept whole in the description");
});

test("capture tokens add cards to one project as their owner, and nothing else", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-capture-"));
  const store = new Store(root);
  await store.init();
  const auth = new Auth(store, true);
  for (const [username, role] of [["alice", "editor"], ["bob", "viewer"]])
    await auth.save({ username, password: "test-password-long", admin: false, organisations: { "o-default": role } });
  const inbox = await store.createProject({ title: "Inbox", key: "IN" });
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
  const alice = await session("alice"), bob = await session("bob");
  const capture = (token, body, type = "application/json") => fetch(base + "/api/capture", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": type }, body: JSON.stringify(body) });

  // Only someone who can add cards gets a token, and never for a personal space.
  assert.equal((await bob("/api/capture-tokens", "POST", { project: inbox.id })).status, 403);
  const { project: personal } = await (await alice("/api/personal", "POST", {})).json();
  assert.equal((await alice("/api/capture-tokens", "POST", { project: personal.id })).status, 400);
  assert.equal((await fetch(base + "/api/capture-tokens")).status, 401);
  const made = await alice("/api/capture-tokens", "POST", { project: inbox.id });
  assert.equal(made.status, 200);
  const { token, id } = await made.json();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const listed = await (await alice("/api/capture-tokens")).json();
  assert.deepEqual(listed.tokens.map((t) => [t.id, t.project]), [[id, inbox.id]]);
  assert.doesNotMatch(JSON.stringify(listed), new RegExp(token), "a token is shown once");
  assert.deepEqual((await (await bob("/api/capture-tokens")).json()).tokens, [], "each person sees their own");
  const file = path.join(root, ".pencils", "capture-tokens.json");
  assert.doesNotMatch(await fs.readFile(file, "utf8"), new RegExp(token), "only a hash is stored");
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

  // The token alone, without a session, adds a card to its project.
  const sent = await capture(token, { text: "Call the plumber #home\nAbout the boiler" });
  assert.equal(sent.status, 201);
  const card = await sent.json();
  const saved = await store.read(store.file(inbox.id, "tasks", card.id));
  assert.deepEqual([saved.data.title, saved.body.trim(), saved.data.tags], ["Call the plumber", "About the boiler", ["home", "inbox"]]);

  for (const [bad, body, type] of [["wrong", { text: "x" }], [token, { text: "  " }], [token, { text: 5 }], [token, { text: "x" }, "text/plain"]])
    assert.notEqual((await capture(bad, body, type)).status, 201, JSON.stringify([bad === token, body, type]));
  assert.equal((await capture("wrong", { text: "x" })).status, 401);
  assert.equal((await capture(token, { text: "x".repeat(70_000) })).status, 413, "a capture is small; big bodies stop before parsing");
  assert.equal((await fetch(base + "/api/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "x" }) })).status, 401);
  // Someone else can't revoke it; losing edit access stops it; revoking ends it.
  assert.equal((await bob(`/api/capture-tokens/${id}`, "DELETE", {})).status, 404);
  await auth.save({ username: "alice", admin: false, organisations: { "o-default": "viewer" } });
  assert.equal((await capture(token, { text: "Not now" })).status, 403);
  await auth.save({ username: "alice", admin: false, organisations: { "o-default": "editor" } });
  const again = await session("alice");
  assert.equal((await again(`/api/capture-tokens/${id}`, "DELETE", {})).status, 200);
  assert.equal((await capture(token, { text: "Too late" })).status, 401);
  // Repeated attempts from one address slow down.
  const statuses = [];
  for (let i = 0; i < 40; i++) statuses.push((await capture("guess", { text: "x" })).status);
  assert.ok(statuses.includes(429));
});
