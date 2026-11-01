// Browser code coverage: which parts of the app's modules the browser tests run.
//   npm run e2e:coverage [-- <playwright filters>]
// runs the tests in Chromium with COVERAGE=1, where each page records V8's coverage
// (e2e/fixtures.mjs) and each worker writes what its pages ran to test-results/coverage, then
// adds the workers' files up and lists each module's share, least covered first.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const folder = fileURLToPath(new URL("../test-results/coverage", import.meta.url));

// The characters of a V8 coverage entry that ran. Ranges nest, so the outer ones go first and inner ones override them.
export function ranBytes({ source, functions }) {
  const bits = new Uint8Array(source.length);
  const ranges = functions.flatMap((f) => f.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const { startOffset, endOffset, count } of ranges) bits.fill(count > 0 ? 1 : 0, startOffset, endOffset);
  return bits;
}

// Runs of ran characters as [start, end) pairs.
export function spans(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i++)
    if (bits[i]) {
      const start = i;
      while (i < bits.length && bits[i]) i++;
      out.push([start, i]);
    }
  return out;
}

// One page's coverage as records of the app's own modules, which the server serves from the root
// (not the /vendor bundles or the built /assets). V8 leaves out the source of a script it has let go.
export const records = (entries) =>
  entries.flatMap((entry) => {
    const name = URL.canParse(entry.url) && new URL(entry.url).pathname;
    return /^\/[\w.-]+\.js$/.test(name) && typeof entry.source === "string" ? [{ path: name, length: entry.source.length, ran: spans(ranBytes(entry)) }] : [];
  });

// Adds lists of records up into one map per module, in `merged` if given.
export function merge(lists, merged = new Map()) {
  for (const list of lists)
    for (const { path: name, length, ran } of list) {
      const bits = merged.get(name)?.length === length ? merged.get(name) : new Uint8Array(length);
      for (const [start, end] of ran) bits.fill(1, start, end);
      merged.set(name, bits);
    }
  return merged;
}

export const flatten = (merged) => [...merged].map(([name, bits]) => ({ path: name, length: bits.length, ran: spans(bits) }));

export function table(merged) {
  const share = ({ ran, length }) => `${((100 * ran) / (length || 1)).toFixed(1)}%`.padStart(7);
  const rows = [...merged]
    .map(([name, bits]) => ({ name, length: bits.length, ran: bits.reduce((sum, bit) => sum + bit, 0) }))
    .sort((a, b) => a.ran / (a.length || 1) - b.ran / (b.length || 1) || a.name.localeCompare(b.name));
  const total = { ran: rows.reduce((sum, row) => sum + row.ran, 0), length: rows.reduce((sum, row) => sum + row.length, 0) };
  return [...rows.map((row) => `${share(row)}  ${row.name}`), `${share(total)}  all ${rows.length} modules`].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run = spawnSync("npx", ["playwright", "test", "--project=chromium", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, COVERAGE: "1" } });
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith(".json")) : [];
  if (files.length) {
    const merged = merge(files.map((name) => JSON.parse(fs.readFileSync(path.join(folder, name), "utf8"))));
    const unloaded = fs.readdirSync(fileURLToPath(new URL("../public", import.meta.url))).filter((name) => name.endsWith(".js") && !merged.has(`/${name}`));
    console.log(`\nBrowser code coverage (characters of each module the tests ran):\n${table(merged)}`);
    if (unloaded.length) console.log(`\nNo page loaded (workers aren't measured): ${unloaded.join(", ")}`);
  } else console.error(`No coverage was written to ${folder}.`);
  process.exit(run.status ?? 1);
}
