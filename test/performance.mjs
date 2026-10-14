import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { Store } from "../server/store.js";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-large-")),
  store = new Store(root);
try {
  await store.init();
  const project = await store.createProject({ title: "Large project" }),
    seed = await store.createTask(project.id, { title: "Seed" }),
    raw = await fs.readFile(path.join(root, seed.file), "utf8");
  for (let i = 0; i < 3000; i += 100)
    await Promise.all(
      Array.from({ length: 100 }, (_, j) => {
        const id = `t-scale-${i + j}`;
        return fs.writeFile(
          store.file(project.id, "tasks", id),
          raw
            .replaceAll(seed.id, id)
            .replace("title: Seed", `title: Task ${i + j}`),
        );
      }),
    );
  store.cache.clear();
  const start = performance.now(),
    cold = await store.snapshot(project.id),
    middle = performance.now(),
    warm = await store.snapshot(project.id),
    end = performance.now();
  assert.equal(warm.tasks.length, 3001);
  assert.equal(cold.warnings.length, 0);
  const file = store.file(project.id, "tasks", "t-scale-0");
  await fs.writeFile(
    file,
    (await fs.readFile(file, "utf8")).replace(
      "title: Task 0",
      "title: External edit",
    ),
  );
  assert.equal(
    (await store.snapshot(project.id)).tasks.find((t) => t.id === "t-scale-0")
      .title,
    "External edit",
  );
  console.log(
    JSON.stringify({
      tasks: warm.tasks.length,
      coldMs: Math.round(middle - start),
      cachedMs: Math.round(end - middle),
      payloadKiB: Math.round(Buffer.byteLength(JSON.stringify(warm)) / 1024),
      externalChangeDetected: true,
    }),
  );
} finally {
  store.close();
  await fs.rm(root, { recursive: true, force: true });
}
