// T42: files that arrive over the network (attachments, sketches, imported notes) are checked
// before they reach the vault, and served so a browser never runs them as a page.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

async function serverFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-uploads-"));
  const store = new Store(root);
  await store.init();
  const server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, method = "GET", body) =>
    fetch(`${base}${route}`, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const project = await (await request("/api/projects", "POST", { title: "Uploads" })).json();
  return { root, store, request, project };
}
const b64 = (text) => Buffer.from(text).toString("base64");
// Every file under the vault, relative to it.
async function files(root) {
  return (await fs.readdir(root, { recursive: true, withFileTypes: true })).filter((e) => e.isFile()).map((e) => path.relative(root, path.join(e.parentPath, e.name)));
}

test("uploads accept only the listed file types and sizes, under names the server chooses", async (t) => {
  const { root, request, project } = await serverFixture(t);
  const upload = (name, data) => request(`/api/projects/${project.id}/attachments`, "POST", { name, data });
  for (const name of ["page.html", "drawing.svg", "script.js", "noext", "x.png.exe"])
    assert.equal((await upload(name, b64("<script>alert(1)</script>"))).status, 400, name);
  for (const [label, data] of [["not base64", "%%%"], ["not text", 42], ["over 10 MB", Buffer.alloc(10_000_001).toString("base64")]])
    assert.equal((await upload("big.png", data)).status, 400, label);
  assert.equal((await request(`/api/projects/${project.id}/attachments`, "POST", { name: "huge.zip", data: "A".repeat(17_000_000) })).status, 413, "the request body limit");
  assert.equal((await upload("x.png", "")).status, 201, "an empty file is fine");
  const before = await files(root);
  const saved = await (await upload("../../../escape.png", b64("png bytes"))).json();
  assert.match(saved.url, /\/attachments\/a-[a-f0-9-]+\.png$/, "the server names the file");
  const added = (await files(root)).filter((f) => !before.includes(f));
  assert.ok(added.some((f) => f.startsWith(`Projects${path.sep}`) && f.includes(`${path.sep}attachments${path.sep}a-`)), added.join());
  assert.ok(!added.some((f) => f.includes("escape")), "the sent name is not used on disk");
  for (const name of ["..%2Fproject.md", "a-x.html", "s-x.html", "project.md"])
    assert.equal((await request(`/api/projects/${project.id}/attachments/${name}`)).status, 400, name);
  assert.equal((await request(`/api/projects/${project.id}/attachments/a-00000000-0000-0000-0000-000000000000.png`)).status, 404);
  assert.equal((await request(`/api/projects/p-missing/attachments`, "POST", { name: "x.png", data: "" })).status, 404, "no project");
});

test("attachments are served so a browser never runs them: downloads, images, PDF preview and sketches", async (t) => {
  const { request, project } = await serverFixture(t);
  const upload = async (name, text) => (await (await request(`/api/projects/${project.id}/attachments`, "POST", { name, data: b64(text) })).json()).url;
  const headers = async (url) => (await fetch(new URL(url, (await request("/api/health")).url))).headers;
  for (const name of ["notes.txt", "notes.md", "table.csv", "files.zip"]) {
    const h = await headers(await upload(name, "<html><script>alert(1)</script></html>"));
    assert.match(h.get("content-disposition"), /^attachment;/, `${name} downloads`);
    assert.equal(h.get("x-content-type-options"), "nosniff", name);
    assert.doesNotMatch(h.get("content-type") || "", /html/, name);
  }
  const image = await headers(await upload("photo.png", "png"));
  assert.equal(image.get("content-type"), "image/png");
  assert.equal(image.get("content-disposition"), null, "images show inline");
  const pdf = await upload("paper.pdf", "%PDF-1.4");
  assert.match((await headers(pdf)).get("content-disposition"), /^attachment;/, "a PDF downloads");
  const preview = await headers(`${pdf}?preview=1`);
  assert.match(preview.get("content-disposition"), /^inline;/, "its preview shows inline");
  assert.match(preview.get("content-security-policy"), /frame-ancestors 'self'/, "only in this app's own frame");
  const stroke = { x: 10, y: 20, color: "#aa3300", strokeWidth: 4, opacity: 1, brush: "pen", points: [[0, 0], [30, 10], [60, 0]] };
  const sketch = await (await request(`/api/projects/${project.id}/sketches`, "POST", { strokes: [stroke] })).json();
  const svg = `/api/projects/${project.id}/${sketch.path}`;
  const drawn = await headers(svg);
  assert.equal(drawn.get("content-type"), "image/svg+xml");
  assert.match(drawn.get("content-security-policy"), /sandbox/, "a sketch never runs as a page");
  assert.match(drawn.get("content-security-policy"), /default-src 'none'/);
});

test("note imports refuse malformed batches whole", async (t) => {
  const { request, project } = await serverFixture(t);
  const importNotes = (body) => request(`/api/projects/${project.id}/import`, "POST", body);
  const note = { name: "Note.md", content: "# Note\n" };
  for (const [label, body] of [
    ["no notes", { notes: [] }],
    ["not a list", { notes: "Note.md" }],
    ["over 200", { notes: Array.from({ length: 201 }, () => note) }],
    ["a name that isn't text", { notes: [note, { name: 1, content: "x" }] }],
    ["content over 200,000 characters", { notes: [note, { name: "Long.md", content: "x".repeat(200_001) }] }],
  ]) assert.equal((await importNotes(body)).status, 400, label);
  const { tasks } = await (await request(`/api/projects/${project.id}`)).json();
  assert.equal(tasks.length, 0, "a refused batch imports nothing");
  const done = await importNotes({ notes: [note] });
  assert.equal(done.status, 201);
  assert.equal((await done.json()).tasks.length, 1);
});
