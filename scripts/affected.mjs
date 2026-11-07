// Which browser tests a change needs (AGENTS.md › Testing). The files changed since the last
// release commit map to e2e areas: a public/ module counts for its own area and for the area of
// every module that imports it, directly or through others (stopping at the shared modules,
// which import nearly everything). Any change to public/ also runs e2e/ui (sizing, visual rules,
// accessibility across views). Shared code runs every area, and a file the map doesn't know runs
// everything, so the map fails safe. The @heavy scale tests join when board data, selection or
// server code changes. The full suite still runs once per batch (npm run test:release).
// F0.21-94: given each file's changed lines (`changes`), a shared file reaches only the areas and
// specs that use the markup its changed rules or lines name, unless they touch the whole app; and
// WebKit (the ios project) runs only when touch or phone code changes. Without them nothing narrows.
// Usage: node scripts/affected.mjs [--run]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command, projectRoot } from "./deploy.mjs";
import { TIERS } from "./tiers.mjs";

const NONE = [/\.md$/, /^test\//, /^reports\//, /^artifacts\//, /^\.claude\//, /^scripts\/(release|deploy|affected|mutants|tiers)\.mjs$/];
const SHARED = [
  /^public\/(app|features|navigation|project-layout|sync|save-state|open-focus|editable-controls|overflow-title|app-status|app-version|appearance|layout-width|popover-position|popup-motion|deferred-controller|uuid|layout-tray|morph)\.js$/,
  /^public\/(controls|styles|appearance|enhancements|project-layout|fonts|themes)\.css$/,
  /^public\/[^/]+\.html$/,
  /^server\//, /^e2e\/fixtures\.mjs$/, /^scripts\/browser-coverage\.mjs$/, /^e2e\/helpers\//, /^playwright\.config/, /^package(-lock)?\.json$/,
  /^scripts\/(build|postinstall)/, /^tsconfig/, /^(Dockerfile|compose|\.dockerignore)/,
];
const HEAVY = [/^public\/(canvas|board-(delta|scene|session|limits|preview|detail-transition)|selection-|spatial-index|viewport-cache|drawing-(store|worker))/, /^server\//];
// public/ file name prefixes per area; a file may belong to several.
const AREAS = {
  board: /^(alignment-guides|board-|list-panel|camera-motion|canvas|comment-model|connector-|dependency-style|drag-feedback|drawing-|edge-labels|frame-|grid-merge|ink-|miro-import|node-layout|note-style|object-|orthogonal-route|pen-|phone-board-tools|project-frame|query-|rule-diagram|scroll-gestures|select-symbols|selection-|spatial-index|text-alignment|viewport-cache)/,
  documents: /^(drag-feedback|history-pages|document-|project-documents|folder-|list-panel|markdown|rich-toolbar-scroll|sketch-|ink-capture)/,
  tasks: /^(history-pages|task-(?!timeline)|card-fields|draft-|attachment-preview|recurrence-|dependency-model|hierarchy-model)/,
  lists: /^(grid(?!-merge)|table-|kanban-|view-layout|project-filters|drag-feedback|task-row-editor|task-order-model|task-reorder|task-group-order|task-colors|card-key|slide-moves)/,
  planning: /^(drag-feedback|slide-moves|calendar|capacity|planning|project-filters|range-menu|timeline-|task-timeline|schedule-|teams)/,
  settings: /^(hotkey|history-pages|project-create|project-settings|project-tags|project-records|debug-log|personal-settings|capture-settings|style-settings|project-sources|source-model|project-automations|workflow-|teams|recovery-ui|backup-limits)/,
  navigation: /^(hotkey|boot-progress|help|topbar-title|bookmarks|bottom-bar|roadmap|search-items)/,
  home: /^home/,
  ui: /^(quiet-scrollbars|toolbar-scroll|assignee-name|card-key|color-|select-menu|date-picker|confirm-popover|format-date|in-place-editing)/,
};
const shared = (file) => SHARED.some((rule) => rule.test(file));
// Touch and phone code, by name or by the words around a changed line (10 lines either side).
const TOUCH_FILE = /(phone|touch|ipad|mobile|tabbar|bottom-bar|layout-tray|gesture|webkit|pointer)/i;
const TOUCH_TEXT = /coarse|touch|pointerType|max-width:\s*600px|min-width:\s*601px|tabBar|narrow\b|phone|ipad|webkit|safe-area|visualViewport|inputmode|onDevices|hover:\s*none/i;
// A token used by this many public/ files is everywhere: changing its styling runs everything.
const WIDE = 10;
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

// The text around a change's lines, old and new.
function around(change) {
  const near = (text, lines) => { const all = (text || "").split("\n"); return lines.map((n) => all.slice(Math.max(0, n - 11), n + 10).join("\n")).join("\n"); };
  return `${near(change.after, change.added)}\n${near(change.before, change.removed)}`;
}
function touches(file, change) {
  if (TOUCH_FILE.test(file) || (shared(file) && !file.startsWith("public/"))) return true; // test and build setup
  if (!change) return true;
  if (TOUCH_TEXT.test(around(change))) return true;
  // A stylesheet's change inside a touch or phone media query, however far above it starts.
  if (!file.endsWith(".css")) return false;
  return [[change.after, change.added], [change.before, change.removed]].some(([text, lines]) => {
    const rules = lines.length ? cssRules(text || "") : [];
    return lines.some((n) => rules.some((r) => r.start <= n && n <= r.end && [r.prelude, ...r.at].some((at) => at.startsWith("@") && TOUCH_TEXT.test(at))));
  });
}

// Source and spec text, read once per root.
const corpora = new Map();
function corpus(root) {
  if (corpora.has(root)) return corpora.get(root);
  const source = fs.readdirSync(path.join(root, "public")).filter((n) => /\.(js|css|html)$/.test(n)).map((name) => [name, fs.readFileSync(path.join(root, "public", name), "utf8")]);
  const spec = specFiles(root, "e2e").map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]);
  const value = { source, spec };
  corpora.set(root, value);
  return value;
}
export function specFiles(root, dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory() && file !== "e2e/helpers") out.push(...specFiles(root, file));
    else if (entry.name.endsWith(".spec.mjs")) out.push(file);
  }
  return out.sort();
}
const named = (text, token) => new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(text);

// CSS: each rule's selector and its lines (a simple scanner: comments and strings skipped).
function cssRules(text) {
  const rules = [], stack = [];
  let line = 1, prelude = "", start = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") line++;
    if (c === "/" && text[i + 1] === "*") { const end = text.indexOf("*/", i + 2); const skip = text.slice(i, end < 0 ? text.length : end + 2); line += skip.split("\n").length - 1; i += skip.length - 1; continue; }
    if (c === '"' || c === "'") { const end = text.indexOf(c, i + 1); if (end < 0) break; prelude += text.slice(i, end + 1); i = end; continue; }
    if (c === "{") { stack.push({ prelude: prelude.trim(), start: prelude.trim() ? start : line }); prelude = ""; continue; }
    if (c === "}") { const block = stack.pop(); if (block) rules.push({ ...block, end: line, at: stack.map((b) => b.prelude) }); prelude = ""; continue; }
    if (c === ";") { prelude = ""; continue; }
    if (!prelude.trim() && c.trim()) start = line;
    prelude += c;
  }
  return rules;
}
// A selector's own tokens, leaving out what :not() excludes; null for :is(), :where() and :has()
// lists, whose alternatives each reach their own elements.
function selectorTokens(selector) {
  if (/:(is|where|has|matches|-webkit-any)\(/.test(selector)) return null;
  let own = selector;
  for (let i = own.indexOf(":not("); i >= 0; i = own.indexOf(":not(")) {
    let depth = 0, j = i + 4;
    for (; j < own.length; j++) { if (own[j] === "(") depth++; else if (own[j] === ")" && --depth === 0) break; }
    own = own.slice(0, i) + own.slice(j + 1);
  }
  return [...own.matchAll(/[.#]([a-zA-Z][\w-]*)|\[([a-zA-Z][\w-]*)/g)].map((m) => m[1] || m[2]);
}
// A selector list's selectors, split at top-level commas.
function splitSelectors(list) {
  const out = [];
  let depth = 0, part = "";
  for (const c of list) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === "," && !depth) { out.push(part); part = ""; } else part += c;
  }
  return [...out, part];
}
// The markup a stylesheet's changed lines style, one group of tokens per selector (an element must
// carry them all), or null if they reach the whole app.
function cssTokens(change) {
  const groups = [];
  for (const [text, lines] of [[change.after, change.added], [change.before, change.removed]]) {
    if (!lines.length) continue;
    const rules = cssRules(text || ""), all = (text || "").split("\n");
    for (const n of lines) {
      if (!all[n - 1]?.trim() || /^\s*(\/\*.*\*\/|\*.*)?\s*$/.test(all[n - 1])) continue;
      const inside = rules.filter((r) => r.start <= n && n <= r.end).sort((a, b) => (a.end - a.start) - (b.end - b.start));
      const rule = inside[0];
      if (!rule) return null;
      // A changed at-rule line styles everything inside it.
      const targets = rule.prelude.startsWith("@") ? rules.filter((r) => r.start >= rule.start && r.end <= rule.end && !r.prelude.startsWith("@")) : [rule];
      if (rule.prelude.startsWith("@") && !/^@(media|supports|container|layer)\b/.test(rule.prelude)) return null;
      if ([rule, ...rules].some((r) => r === rule && r.at.some((at) => at.startsWith("@") && !/^@(media|supports|container|layer)\b/.test(at)))) return null;
      for (const target of targets)
        for (const complex of splitSelectors(target.prelude)) {
          const found = selectorTokens(complex);
          if (!found?.length) return null; // an element-wide rule, :root, * or a selector list
          groups.push(found);
        }
    }
  }
  return groups;
}
// The areas and specs a shared public/ file's change reaches, or null for everything.
function sharedReach(file, change, root) {
  // Scripts never narrow: markup a shared module builds may show in any view.
  if (!change || !change.before || !change.after || !/^public\/[^/]+\.css$/.test(file)) return null;
  const groups = cssTokens(change);
  if (!groups?.length) return null;
  const { source, spec } = corpus(root), areas = new Set(), specs = new Set(), tokens = new Set();
  const users = (token) => source.filter(([, text]) => named(text, token)).map(([name]) => name);
  for (const group of groups) {
    // An element must carry every token in the group, so the narrow ones bound its reach.
    const narrow = group.filter((token) => users(token).length < WIDE);
    if (!narrow.length) return null;
    // Markup that shared code builds shows in every view.
    if (narrow.some((token) => users(token).some((name) => !name.endsWith(".css") && shared(`public/${name}`)))) return null;
    narrow.forEach((token) => tokens.add(token));
  }
  for (const token of tokens) {
    for (const name of users(token)) if (!shared(`public/${name}`)) reach(name, root).forEach((area) => areas.add(area));
    for (const [specFile, text] of spec) if (named(text, token)) specs.add(specFile);
  }
  return { tokens: [...tokens], areas: [...areas].filter((area) => area !== "ui"), specs: [...specs] };
}

export function affected(files, { root = projectRoot, changes = () => null } = {}) {
  const reasons = [], paths = new Set(), specs = new Set();
  let all = false, heavy = false, touch = false;
  for (const file of files) {
    if (HEAVY.some((rule) => rule.test(file))) heavy = true;
    if (NONE.some((rule) => rule.test(file))) continue;
    const change = changes(file);
    if (!file.startsWith("server/") && touches(file, change)) touch = true;
    if (shared(file)) {
      const narrow = sharedReach(file, change, root);
      if (!narrow) { all = true; reasons.push(`${file} → everything (shared)`); continue; }
      for (const area of [...narrow.areas, "ui"]) paths.add(`e2e/${area}`);
      for (const spec of narrow.specs) specs.add(spec);
      reasons.push(`${file} → ${[...narrow.areas.map((area) => `e2e/${area}`), "e2e/ui"].join(", ")} and ${narrow.specs.length} specs that use ${narrow.tokens.join(", ")}`);
      continue;
    }
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
  const changed = [...specs].filter((spec) => files.includes(spec));
  for (const spec of specs) if (![...paths].some((area) => spec.startsWith(`${area}/`))) paths.add(spec);
  return { all, heavy, touch, specs: changed, paths: all ? [] : [...paths].sort(), reasons };
}

// Release runs fail fast (F0.21-94): first the changed specs and e2e/ui (sizing, visual rules,
// accessibility), then everything else chosen, each test once, by tier (F0.22-22): critical,
// important, then peripheral, with a spec that has no tier among the critical ones.
export function phases(plan, { root = projectRoot, tiers = TIERS } = {}) {
  const ui = plan.all || plan.paths.some((p) => p === "e2e/ui" || p.startsWith("e2e/ui/"));
  const first = [...plan.specs.filter((spec) => !spec.startsWith("e2e/ui/")), ...(ui ? ["e2e/ui"] : [])];
  const chosen = plan.all ? fs.readdirSync(path.join(root, "e2e"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== "helpers").map((e) => `e2e/${e.name}`) : plan.paths;
  const rest = [];
  for (const target of chosen) {
    if (target === "e2e/ui" || target.startsWith("e2e/ui/") || first.includes(target)) continue;
    const inside = first.filter((spec) => spec.startsWith(`${target}/`));
    rest.push(...(inside.length ? specFiles(root, target).filter((spec) => !inside.includes(spec)) : [target]));
  }
  const byTier = [[], [], []];
  for (const spec of rest.flatMap((target) => (target.endsWith(".spec.mjs") ? [target] : specFiles(root, target))))
    byTier[Math.max(0, tiers.findIndex((files) => files.includes(spec)))].push(spec);
  return [first, ...byTier].filter((list) => list.length);
}

// Files changed since the last release commit, committed or not, including deleted, renamed
// (both names) and untracked files. Without a release commit, since the last commit.
export function changedFiles(root = projectRoot) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const base = git("log", "-1", "--format=%H", "--grep=^Release ").trim() || "HEAD";
  const list = (output) => output.split("\0").filter(Boolean);
  return [...new Set([...list(git("diff", "--name-only", "--no-renames", "-z", base)), ...list(git("ls-files", "--others", "--exclude-standard", "-z"))])];
}

// Each file's changed lines since the last release commit, for narrowing and the touch check.
export function gitChanges(root = projectRoot, tree = root) {
  // A file new since the release has no old copy; keep git's "exists on disk, but not in" off the log.
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  const base = git("log", "-1", "--format=%H", "--grep=^Release ").trim() || "HEAD";
  return (file) => {
    let before = null, after = null;
    try { before = git("show", `${base}:${file}`); } catch {}
    try { after = fs.readFileSync(path.join(tree, file), "utf8"); } catch {}
    const added = [], removed = [];
    const every = (text, list) => text.split("\n").forEach((_, i) => list.push(i + 1));
    if (before === null || after === null) {
      every(after ?? before ?? "", after === null ? removed : added);
      return { before, after, added, removed };
    }
    if (before === after) return { before, after, added, removed };
    // The old text against the tree's own copy (the release's snapshot), as plain text.
    const old = path.join(os.tmpdir(), `pencils-affected-${process.pid}`);
    fs.writeFileSync(old, before);
    let diff = "";
    try { diff = git("diff", "--no-index", "--no-ext-diff", "--no-textconv", "-U0", "--no-color", old, path.join(tree, file)); }
    catch (error) { diff = error.stdout || ""; } // exits 1 when the files differ
    finally { fs.rmSync(old, { force: true }); }
    for (const [, from, fromCount = "1", to, toCount = "1"] of diff.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
      for (let i = 0; i < Number(fromCount); i++) removed.push(Number(from) + i);
      for (let i = 0; i < Number(toCount); i++) added.push(Number(to) + i);
    }
    if (!added.length && !removed.length) { every(after, added); every(before, removed); } // binary or unreadable: all of it
    return { before, after, added, removed };
  };
}

export const describe = (plan) => `${plan.all ? "every test" : plan.paths.length ? plan.paths.join(" ") : "none needed"}${plan.heavy && (plan.all || plan.paths.length) ? " and @heavy" : ""}${plan.all || plan.paths.length ? (plan.touch ? ", WebKit too" : ", Chromium only") : ""}`;

// Runs the chosen tests in Chromium, and their phone and iPad tests in WebKit too (the ios project)
// when touch code changed (IOS=1 always, IOS=0 never); in phases that stop at the first failure.
// Resolves without running when none are needed.
export async function runAffected(plan, { log, cwd = projectRoot } = {}) {
  if (!plan.all && !plan.paths.length) return "";
  const webkit = process.env.IOS === "1" || (process.env.IOS !== "0" && plan.touch);
  const projects = ["--project=chromium", ...(webkit ? ["--project=ios"] : [])];
  let output = "";
  for (const files of phases(plan, { root: cwd }))
    output += await command("npx", ["playwright", "test", "--max-failures=1", ...projects, ...files], { cwd, log, env: { ...process.env, HEAVY: plan.heavy ? "1" : "0" } });
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const plan = affected(changedFiles(), { changes: gitChanges() });
  console.log(plan.reasons.join("\n") || "No changes since the last release.");
  console.log(`Browser tests: ${describe(plan)}`);
  if (process.argv.includes("--run")) await runAffected(plan, { log: process.stdout }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
