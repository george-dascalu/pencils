// Owner request T96, 1 November 2026: Settings → Debug shows the server's recent failed requests
// with their error messages, and its recent errors and warnings.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { createServer } from "../server/index.js";

test("diagnostics list failed requests with their messages, and the server's errors, newest first", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-diagnostics-"));
  const store = new Store(root);
  await store.init();
  const server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const missing = await fetch(`${base}/projects/p-missing?secret=1`);
  const message = (await missing.json()).error;
  console.warn("Disk nearly full");
  const report = await (await fetch(`${base}/diagnostics`)).json();
  const failure = report.failures.find((f) => f.path === "/api/projects/p-missing");
  assert.ok(failure, "the failed request is listed, without its query");
  assert.equal(failure.method, "GET");
  assert.equal(failure.status, missing.status);
  assert.equal(failure.message, message);
  assert.ok(report.log.some((line) => line.level === "warn" && line.message === "Disk nearly full"));
  assert.ok(report.failures.at(0).at >= report.failures.at(-1).at, "newest first");
});
