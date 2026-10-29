// Syntax-checks every module, one `node --check` per file, across all cores.
// Optional arguments name other directories to check.
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const e2e = (await fs.readdir("e2e", { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => `e2e/${d.name}`);
const dirs = process.argv.length > 2 ? process.argv.slice(2) : ["server", "public", "test", "e2e", ...e2e];
const files = [];
for (const dir of dirs)
  for (const file of await fs.readdir(dir))
    if (/\.(m?js)$/.test(file)) files.push(`${dir}/${file}`);
const queue = [...files];
const failures = [];
await Promise.all(Array.from({ length: os.availableParallelism() }, async () => {
  for (let file; (file = queue.shift()); )
    await run(process.execPath, ["--check", file]).catch((error) => failures.push(error.stderr || `${file}: ${error.message}`));
}));
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`All ${files.length} JavaScript modules pass syntax checks.`);
