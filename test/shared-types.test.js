import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// The browser modules the server also runs carry `// @ts-check`, so `npm run check` type-checks the
// rules that guard saved data (F0.22-43). The ones below wait for their types.
const UNTYPED = new Set(["grid-model.js", "document-performance.js", "table-model.js", "canvas-format.js", "document-sheet-model.js"]);

test("browser modules the server imports are type-checked", () => {
  const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : /\.(js|ts)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path.join(dir, entry.name)] : []);
  const shared = new Set(files("server").flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(/from "(?:\.\.\/)+public\/([\w-]+\.js)"/g)].map((match) => match[1])));
  assert.ok(shared.size > 20);
  const unchecked = [...shared].filter((name) => !UNTYPED.has(name) && !fs.readFileSync(`public/${name}`, "utf8").startsWith("// @ts-check\n"));
  assert.deepEqual(unchecked, []);
  for (const name of UNTYPED) assert.ok(shared.has(name), `${name} is still shared`);
});
