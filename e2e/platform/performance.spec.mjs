// Store scale: a project of 3,001 Markdown task files loads cold and from the cache without
// warnings, and an edit made to a file outside the app shows in the next snapshot. Reports the
// cold and cached snapshot times and the payload size (no browser).
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { test, expect } from "../fixtures.mjs";
import { Store } from "../../server/store.js";

test("3,001 task files load cold and cached without warnings, and outside edits show up", async ({}, testInfo) => {
  test.setTimeout(120000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-large-"));
  const store = new Store(root);
  try {
    await store.init();
    const project = await store.createProject({ title: "Large project" });
    const seed = await store.createTask(project.id, { title: "Seed" });
    const raw = await fs.readFile(path.join(root, seed.file), "utf8");
    for (let i = 0; i < 3000; i += 100)
      await Promise.all(
        Array.from({ length: 100 }, (_, j) => {
          const id = `t-scale-${i + j}`;
          return fs.writeFile(store.file(project.id, "tasks", id), raw.replaceAll(seed.id, id).replace("title: Seed", `title: Task ${i + j}`));
        }),
      );
    store.cache.clear();
    const start = performance.now();
    const cold = await store.snapshot(project.id);
    const middle = performance.now();
    const warm = await store.snapshot(project.id);
    const end = performance.now();
    expect(warm.tasks.length).toBe(3001);
    expect(cold.warnings.length).toBe(0);
    const file = store.file(project.id, "tasks", "t-scale-0");
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("title: Task 0", "title: External edit"));
    expect((await store.snapshot(project.id)).tasks.find((t) => t.id === "t-scale-0").title).toBe("External edit");
    const result = {
      tasks: warm.tasks.length,
      coldMs: Math.round(middle - start),
      cachedMs: Math.round(end - middle),
      payloadKiB: Math.round(Buffer.byteLength(JSON.stringify(warm)) / 1024),
      externalChangeDetected: true,
    };
    console.log(JSON.stringify(result));
    await testInfo.attach("store-scale.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  } finally {
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});
