import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The offline drawing page runs from the worker's cache, so the worker keeps every module the page
// imports, directly or through another.
test("the offline drawing worker caches every module the offline page imports", () => {
  const dir = path.resolve("public"), seen = new Set();
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    for (const [, spec] of source.matchAll(/^\s*import\s(?:[^;]*?\sfrom\s)?["'](\.\/[^"']+)["']/gm)) walk(path.normalize(path.join(path.dirname(file), spec)));
  })("drawing-offline.js");
  const cached = new Set([...fs.readFileSync(path.join(dir, "drawing-worker.js"), "utf8").matchAll(/"\/([^"]+\.js)"/g)].map((m) => m[1]));
  assert.ok(seen.size > 5, "the import graph was read");
  assert.deepEqual([...seen].filter((file) => !cached.has(file)), []);
});
