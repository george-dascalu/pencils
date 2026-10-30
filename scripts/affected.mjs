// Which browser tests a change needs (AGENTS.md › Testing). The files changed since the last
// release commit map to e2e areas: a public/ module counts for its own area and for the area of
// every module that imports it, directly or through others (stopping at the shared modules,
// which import nearly everything). Any change to public/ also runs e2e/ui (sizing, visual rules,
// accessibility across views). Shared code runs every area, and a file the map doesn't know runs
// everything, so the map fails safe. The @heavy scale tests join when board data, selection or
// server code changes. The full suite still runs once per batch (npm run test:release).
// Usage: node scripts/affected.mjs [--run]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command, projectRoot } from "./deploy.mjs";

const NONE = [/\.md$/, /^test\//, /^reports\//, /^artifacts\//, /^\.claude\//, /^scripts\/(release|deploy|affected)\.mjs$/];
const SHARED = [
  /^public\/(app|features|navigation|project-layout|sync|save-state|open-focus|editable-controls|app-status|app-version|appearance|layout-width|popover-position|deferred-controller|uuid|layout-tray)\.js$/,
  /^public\/(controls|styles|appearance|enhancements|project-layout|fonts|themes)\.css$/,
  /^public\/[^/]+\.html$/,
  /^server\//, /^e2e\/fixtures\.mjs$/, /^e2e\/helpers\//, /^playwright\.config/, /^package(-lock)?\.json$/,
  /^scripts\/(build|postinstall)/, /^tsconfig/, /^(Dockerfile|compose|\.dockerignore)/,
];
const HEAVY = [/^public\/(canvas|board-(delta|scene|session|limits|preview|detail-transition)|selection-|spatial-index|viewport-cache|drawing-(store|worker))/, /^server\//];
// public/ file name prefixes per area; a file may belong to several.
const AREAS = {
  board: /^(alignment-guides|board-|camera-motion|canvas|comment-model|connector-|dependency-style|drag-feedback|drawing-|edge-labels|frame-|grid-merge|ink-|miro-import|node-layout|note-style|object-|orthogonal-route|pen-|phone-board-tools|project-frame|query-|rule-diagram|scroll-gestures|select-symbols|selection-|spatial-index|text-alignment|viewport-cache)/,
  documents: /^(document-|project-documents|markdown|rich-toolbar-scroll|sketch-|ink-capture)/,
  tasks: /^(task-(?!timeline)|draft-|attachment-preview|recurrence-|dependency-model|hierarchy-model)/,
  lists: /^(grid(?!-merge)|table-|kanban-|view-layout|drag-feedback|task-row-editor|task-order-model|task-reorder|task-colors)/,
  planning: /^(calendar|capacity|planning|timeline-|task-timeline|schedule-|teams)/,
  settings: /^(project-settings|personal-settings|capture-settings|style-settings|project-sources|source-model|project-automations|workflow-|teams|recovery-ui|backup-limits)/,
  navigation: /^(help|topbar-title|bookmarks|bottom-bar)/,
  ui: /^(color-|select-menu|date-picker|confirm-popover|format-date|in-place-editing)/,
};
const shared = (file) => SHARED.some((rule) => rule.test(file));
const areasOf = (name) => Object.keys(AREAS).filter((area) => AREAS[area].test(name));

// For each public/ module, the modules that import it.
const graphs = new Map();
function importers(root) {
  if (graphs.has(root)) return graphs.get(root);
  const graph = new Map();
  for (const name of fs.readdirSync(path.join(root, "public")).filter((n) => n.endsWith(".js")))
    for (const [, dep] of fs.readFileSync(path.join(root, "public", name), "utf8").matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']\.\/([\w.-]+\.js)["']/g))
      graph.set(dep, [...(graph.get(dep) || []), name]);
  graphs.set(root, graph);
  return graph;
}
// The areas a public/ file reaches: its own and its importers', not counting shared modules.
function reach(name, root) {
  const graph = importers(root), seen = new Set([name]), queue = [name], areas = new Set();
  while (queue.length) {
    const current = queue.shift();
    for (const area of areasOf(current)) areas.add(area);
    for (const parent of graph.get(current) || [])
      if (!seen.has(parent) && !shared(`public/${parent}`)) { seen.add(parent); queue.push(parent); }
  }
  return [...areas].sort();
}

export function affected(files, { root = projectRoot } = {}) {
  const reasons = [], paths = new Set(), specs = new Set();
  let all = false, heavy = false;
  for (const file of files) {
    if (HEAVY.some((rule) => rule.test(file))) heavy = true;
    if (NONE.some((rule) => rule.test(file))) continue;
    if (shared(file)) { all = true; reasons.push(`${file} → everything (shared)`); continue; }
    const spec = file.match(/^e2e\/([\w-]+)\/.+\.spec\.mjs$/), areaFile = file.match(/^e2e\/([\w-]+)\//);
    if (spec) {
      if (!fs.existsSync(path.join(root, file))) { reasons.push(`${file} → nothing (deleted)`); continue; }
      specs.add(file);
      if (spec[1] === "platform") heavy = true;
      reasons.push(`${file} → itself`);
      continue;
    }
    if (areaFile) { paths.add(`e2e/${areaFile[1]}`); reasons.push(`${file} → e2e/${areaFile[1]}`); continue; }
    const name = file.startsWith("public/") && !file.slice(7).includes("/") ? file.slice(7) : null;
    const areas = name ? reach(name, root) : [];
    if (!areas.length) { all = true; reasons.push(`${file} → everything (not mapped)`); continue; }
    for (const area of [...areas, "ui"]) paths.add(`e2e/${area}`);
    reasons.push(`${file} → ${areas.map((area) => `e2e/${area}`).join(", ")}, e2e/ui`);
  }
  // The @heavy tests all live in e2e/platform.
  if (heavy && !all && paths.size) { paths.add("e2e/platform"); reasons.push("board data, selection or server changed → e2e/platform with @heavy"); }
  for (const spec of specs) if (![...paths].some((area) => spec.startsWith(`${area}/`))) paths.add(spec);
  return { all, heavy, paths: all ? [] : [...paths].sort(), reasons };
}

// Files changed since the last release commit, committed or not, including deleted, renamed
// (both names) and untracked files. Without a release commit, since the last commit.
export function changedFiles(root = projectRoot) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const base = git("log", "-1", "--format=%H", "--grep=^Release ").trim() || "HEAD";
  const list = (output) => output.split("\0").filter(Boolean);
  return [...new Set([...list(git("diff", "--name-only", "--no-renames", "-z", base)), ...list(git("ls-files", "--others", "--exclude-standard", "-z"))])];
}

export const describe = (plan) => plan.all ? `every test${plan.heavy ? " and @heavy" : ""}` : plan.paths.length ? `${plan.paths.join(" ")}${plan.heavy ? " and @heavy" : ""}` : "none needed";

// Runs the chosen tests in Chromium; resolves without running when none are needed.
export function runAffected(plan, { log } = {}) {
  if (!plan.all && !plan.paths.length) return Promise.resolve("");
  return command("npx", ["playwright", "test", "--project=chromium", ...plan.paths], { log, env: { ...process.env, HEAVY: plan.heavy ? "1" : "0" } });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = affected(changedFiles());
  console.log(plan.reasons.join("\n") || "No changes since the last release.");
  console.log(`Browser tests: ${describe(plan)}`);
  if (process.argv.includes("--run")) await runAffected(plan, { log: process.stdout }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
