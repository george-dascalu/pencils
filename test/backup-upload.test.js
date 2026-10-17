import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

test("generated archives above 10 MB upload, verify and restore through the supported HTTP route", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "pencils-backup-large-"),
  );
  const store = new Store(root);
  await store.init();
  const project = await store.createProject({ title: "Large backup" });
  const original = randomBytes(10_100_000);
  const attachment = path.join(store.projectDir(project.id), "large.bin");
  await fs.writeFile(attachment, original);
  const saved = await store.createBackup();
  assert.ok(saved.size > 10_000_000);
  const server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/backups`;
  try {
    const response = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: await store.backupBytes(saved.id),
    });
    assert.equal(response.status, 201, await response.clone().text());
    const uploaded = await response.json();
    const verify = await fetch(`${base}/${uploaded.id}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal((await verify.json()).ok, true);
    await fs.writeFile(attachment, "changed");
    await store.restoreBackup(uploaded.id);
    assert.deepEqual(await fs.readFile(attachment), original);
    const denied = await fetch(`${base}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/zip",
        Origin: "https://different.example",
      },
      body: "invalid",
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await fs.readdir(path.join(root, ".uploads")), []);
  } finally {
    store.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});
