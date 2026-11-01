// Mutation testing: small faults are put into a module one at a time (a comparison flipped, a
// negation, call or throw dropped) and each runs against the unit tests that import the module,
// stopping at the first that fails. A fault no test notices marks code the tests run but don't check.
//   npm run test:mutants [-- <module>...]   (default: the journal, store, model and write access)
// Each worker mutates its own copy of the repository; the working tree only gets the usual server
// build. A module the store imports runs many test files per surviving mutant: the four default
// modules take about six minutes with 16 workers.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parser } from "@lezer/javascript";
import { transform } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const MODULES = ["server/journal.js", "server/store.js", "server/model.js", "server/http/access.ts"];
const FLIP = { "===": "!==", "!==": "===", "==": "!=", "!=": "==", "<": "<=", "<=": "<", ">": ">=", ">=": ">", "&&": "||", "||": "&&", true: "false", false: "true" };

// A source's mutants as { from, to, text, line }; a statement that calls something (awaited or not,
// or assigning the result) is removed whole. Strings, regular expressions and comments are
// tokens of their own in the syntax tree, so nothing inside them changes.
export function mutants(source) {
  const out = [];
  const add = (from, to, text) => out.push({ from, to, text, line: source.slice(0, from).split("\n").length });
  parser.configure({ dialect: "ts" }).parse(source).iterate({
    enter({ name, from, to, node }) {
      const token = source.slice(from, to), first = node.firstChild;
      if (["CompareOp", "LogicOp", "BooleanLiteral"].includes(name) && FLIP[token]) add(from, to, FLIP[token]);
      else if (name === "LogicOp" && token === "!" && node.parent?.name === "UnaryExpression") add(from, to, "");
      else if (name === "ThrowStatement" || (name === "ExpressionStatement" && (first?.name === "CallExpression" || first?.getChild("CallExpression")))) add(from, to, ";");
    },
  });
  return out.sort((a, b) => a.from - b.from);
}

// The unit tests that import a module, directly or through other modules: its own test file
// first, then those that import it directly. TypeScript modules count as their compiled JavaScript.
export function testsFor(module) {
  const target = module.replace(/\.ts$/, ".js"), imports = new Map();
  const importsOf = (file) => {
    if (!imports.has(file)) {
      const text = fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), "utf8") : "";
      imports.set(file, [...text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.\.?\/[^"']+)["']/g)].map(([, spec]) => path.posix.join(path.posix.dirname(file), spec)));
    }
    return imports.get(file);
  };
  const reaches = (test) => {
    const seen = new Set([test]), queue = [test];
    while (queue.length) for (const dep of importsOf(queue.shift())) if (!seen.has(dep)) seen.add(dep), queue.push(dep);
    return seen.has(target);
  };
  const rank = (test) => (path.basename(test, ".test.js") === path.basename(target, ".js") ? 0 : importsOf(test).includes(target) ? 1 : 2);
  return fs.readdirSync(path.join(root, "test")).filter((name) => name.endsWith(".test.js")).map((name) => `test/${name}`)
    .filter(reaches).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

// Runs one test file in a copy: "pass", "fail" or "timeout".
const children = new Set();
const run = (copy, file, timeout) => new Promise((resolve) => {
  const child = spawn(process.execPath, [file], { cwd: copy, stdio: "ignore", timeout, killSignal: "SIGKILL" });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    resolve(signal ? "timeout" : code === 0 ? "pass" : "fail");
  });
});

// Puts a module's source into a copy; tests import TypeScript modules compiled.
async function put(copy, module, source) {
  const code = module.endsWith(".ts") ? (await transform(source, { loader: "ts", format: "esm", target: "node22" })).code : source;
  fs.writeFileSync(path.join(copy, module.replace(/\.ts$/, ".js")), code);
}

// Each copy works through the shared list of jobs.
const pool = (copies, jobs, work) => Promise.all(copies.map(async (copy) => { for (let job; (job = jobs.shift()); ) await work(copy, job); }));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const modules = process.argv.length > 2 ? process.argv.slice(2) : MODULES;
  const workers = Number(process.env.MUTANT_WORKERS) || Math.max(1, Math.floor(os.availableParallelism() / 2));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pencils-mutants-"));
  process.on("exit", () => {
    for (const child of children) child.kill("SIGKILL");
    fs.rmSync(base, { recursive: true, force: true });
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => process.exit(130));
  const files = [
    ...execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean),
    ...fs.readdirSync(path.join(root, "server/http"), { recursive: true }).filter((name) => name.endsWith(".js")).map((name) => `server/http/${name}`),
  ];
  const copies = Array.from({ length: workers }, (_, i) => {
    const copy = path.join(base, `w${i}`);
    for (const file of files) if (fs.existsSync(path.join(root, file))) fs.cpSync(path.join(root, file), path.join(copy, file));
    fs.symlinkSync(path.join(root, "node_modules"), path.join(copy, "node_modules"));
    return copy;
  });

  // Each test once as it is, for its time; a test that fails already can't judge mutants.
  const tests = Object.fromEntries(modules.map((module) => [module, testsFor(module)])), timing = new Map();
  await pool(copies, [...new Set(Object.values(tests).flat())], async (copy, file) => {
    const start = Date.now(), result = await run(copy, file, 300000);
    timing.set(file, result === "pass" ? Date.now() - start : null);
  });
  const broken = [...timing].filter(([, ms]) => ms === null).map(([file]) => file);
  if (broken.length) console.log(`Left out, failing without mutants: ${broken.join(", ")}`);

  const jobs = modules.flatMap((module) => {
    const source = fs.readFileSync(path.join(root, module), "utf8");
    return mutants(source).map((mutant) => ({ module, source, mutant, tests: tests[module].filter((file) => timing.get(file) !== null) }));
  });
  const results = [], total = jobs.length;
  await pool(copies, jobs, async (copy, job) => {
    const { module, source, mutant } = job;
    let status = "survived";
    await put(copy, module, source.slice(0, mutant.from) + mutant.text + source.slice(mutant.to));
    for (const file of job.tests) {
      const result = await run(copy, file, timing.get(file) * 3 + 10000);
      if (result !== "pass") { status = result === "timeout" ? "timed out" : "killed"; break; }
    }
    await put(copy, module, source);
    results.push({ ...job, status });
    if (results.length % 50 === 0) console.log(`${results.length}/${total} mutants`);
  });

  for (const module of modules) {
    const own = results.filter((r) => r.module === module), survived = own.filter((r) => r.status === "survived");
    const count = (status) => own.filter((r) => r.status === status).length;
    console.log(`\n${module}: ${own.length} mutants, ${count("killed")} killed, ${count("timed out")} timed out, ${survived.length} survived (${((100 * (own.length - survived.length)) / (own.length || 1)).toFixed(0)}% caught) by ${tests[module].length} test files`);
    for (const { source, mutant } of survived.sort((a, b) => a.mutant.from - b.mutant.from))
      console.log(`  ${String(mutant.line).padStart(4)}  ${JSON.stringify(source.slice(mutant.from, mutant.to))} → ${mutant.text === ";" ? "removed" : JSON.stringify(mutant.text)}   ${source.split("\n")[mutant.line - 1].trim().slice(0, 100)}`);
  }
}
