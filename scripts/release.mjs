// One-step release of the working tree to the running Pencils container (AGENTS.md › Deployment):
// the completed features numbered next ship together (F0.21-94). It copies the working tree to a
// snapshot first and does everything else there: syntax/type/unit checks, the asset build, the
// browser tests the change needs (scripts/affected.mjs, failing fast), version and changelog date,
// an image build that keeps a rollback image, and a health check for the new version. The working
// tree stays free for the next change meanwhile; it gets the new version at the end, and the
// release commit (made from the snapshot) is pushed. The full suite runs once per batch
// (npm run test:release).
// Usage: npm run release -- patch|minor|<x.y.z>   (RELEASE_COMMIT_TRAILER adds commit trailers)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command, deploy, projectRoot, pruneReleaseImages } from "./deploy.mjs";
import { affected, changedFiles, describe, gitChanges, runAffected } from "./affected.mjs";
import { roadmap, recordedTime } from "../public/roadmap.js";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, wanted) {
  const [, major, minor, patch] = current.match(SEMVER).map(Number);
  if (wanted === "patch") return patch >= 99 ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  if (wanted === "minor") return `${major}.${minor + 1}.0`;
  const parts = wanted?.match(SEMVER);
  if (!parts) throw new Error(`Give patch, minor or a version like 1.2.3 (got "${wanted}").`);
  if (Number(parts[3]) > 99) throw new Error("The patch must be between 0 and 99; feature 100 starts the next minor at patch 0.");
  const newer = parts.slice(1).map(Number).map((n, i) => n - [major, minor, patch][i]).find(d => d !== 0) > 0;
  if (!newer) throw new Error(`${wanted} must be newer than the current ${current}.`);
  return wanted;
}

// The completed features numbered next, in a row, ship in one release and one test run (F0.21-94):
// the release takes the last one's number, and each of them names that version.
export function releaseFeatures(current, entries) {
  if (Number(current.split(".")[2]) > 99) throw new Error("Start the new numbering baseline with an explicit minor release first.");
  const items = [];
  let version = current;
  for (;;) {
    const [major, minor, patch] = version.split(".").map(Number);
    const item = entries.find((entry) => entry.id === `F${major}.${minor}-${patch + 1}`);
    if (item?.status !== "done") break;
    items.push(item);
    version = nextVersion(version, "patch");
  }
  if (!items.length) {
    const [major, minor, patch] = current.split(".").map(Number);
    throw new Error(`Record the completed feature F${major}.${minor}-${patch + 1} for ${nextVersion(current, "patch")} in public/roadmap.js before releasing.`);
  }
  const ids = items.map((item) => item.id).join(", ");
  for (const item of items) if (item.version !== version) throw new Error(`${item.id}: record version ${version}, the release that ships ${ids}.`);
  const others = entries.filter((entry) => entry.version === version && !items.includes(entry));
  if (others.length) throw new Error(`${others.map((entry) => entry.id).join(", ")} also claim ${version}; only ${ids} ship in it.`);
  if (version.localeCompare('0.21.67', undefined, { numeric: true }) >= 0) for (const item of items) {
    const times = ['requested', 'started', 'done'].map(key => recordedTime(item[key]));
    if (times.some(time => time === null)) throw new Error(`${item.id}: record Requested, Started and Done timestamps before releasing.`);
    if (times[0] > times[1] || times[1] > times[2]) throw new Error(`${item.id}: timestamps must be in Requested, Started, Done order.`);
    if (!item.model?.trim() || !item.effort?.trim()) throw new Error(`${item.id}: record the actual model and effort used before releasing.`);
  }
  return { version, items };
}

export const londonDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(date);

// The newest section must be "## Unreleased" or already name this version; it gets the release date.
export function datedChangelog(text, version, date) {
  const top = text.match(/^## (.+)$/m);
  if (!top || !(top[1] === "Unreleased" || top[1] === version || top[1].startsWith(`${version} `)))
    throw new Error(`Add the user-visible changes to CHANGELOG.md under "## Unreleased" before releasing ${version}.`);
  return text.replace(top[0], `## ${version} — ${date}`);
}

export const withAppVersion = (source, version) => source.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${version}'`);

// The newest changelog section, from its heading to the next one.
function newestSection(text) {
  const heading = text.match(/^## .+$/m);
  if (!heading) return null;
  const body = heading.index + heading[0].length, next = text.slice(body).search(/^## /m);
  return { heading: heading[0], start: heading.index, body, end: next < 0 ? text.length : body + next };
}
export function unreleasedNames(text, ids) {
  const section = newestSection(text), body = section ? text.slice(section.body, section.end) : "";
  const missing = ids.filter((id) => !new RegExp(`\\b${id.replaceAll(".", "\\.")}\\b`).test(body));
  if (missing.length) throw new Error(`CHANGELOG.md's newest section doesn't describe ${missing.join(", ")}.`);
}
// The release ran from a snapshot (F0.21-94), so the working tree may have new changelog lines.
// They stay under Unreleased, above the released section; null if a released line changed meanwhile.
export function mergedChangelog(main, before, released) {
  if (main === before) return released;
  const was = newestSection(before), now = newestSection(main);
  const lines = before.slice(was.body, was.end).trim();
  if (!now || now.heading !== was.heading) return null;
  const body = main.slice(now.body, now.end).trim();
  if (!body.endsWith(lines)) return null;
  const added = body.slice(0, body.length - lines.length).trim();
  return `${main.slice(0, now.start)}${added ? `${was.heading}\n\n${added}\n\n` : ""}${released.match(/^## .+$/m)[0]}\n\n${lines}\n\n${main.slice(now.end)}`;
}
// A version file for the working tree: the release's copy if untouched since the snapshot, else the
// new version written into its current text; null (for a person to finish) when that isn't safe.
export function mainCopy(name, main, before, after, version) {
  if (main === before) return after;
  if (name === "public/app-version.js") return withAppVersion(main, version);
  if (name === "package.json") return main.replace(/^(\s*"version":\s*")[^"]*(")/m, `$1${version}$2`);
  return null;
}
// The last release's changelog section must be dated before the next one starts (a merge that
// failed would otherwise date the old lines again).
export function releasedBefore(text, current) {
  if (!text.includes(`\n## ${current} `)) throw new Error(`CHANGELOG.md has no "## ${current}" section: date the last release's lines before releasing again.`);
}
// New files that look like keys or secrets: a release would deploy, commit and push them.
export const secretFiles = (files) => files.filter((file) => /^(\.env(\..+)?|id_(rsa|dsa|ecdsa|ed25519)|secrets?\b.*|credentials\b.*|.+\.(pem|key|p12|pfx))$/i.test(path.basename(file)));

// The working tree's tracked and new files, copied to a temporary folder, with node_modules linked.
export function snapshot(root) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pencils-release-"));
  const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 })
    .split("\0").filter((name) => name && fs.existsSync(path.join(root, name)));
  execFileSync("rsync", ["-a", "--from0", "--files-from=-", `${root}/`, `${dir}/`], { input: files.join("\0") });
  fs.symlinkSync(path.join(root, "node_modules"), path.join(dir, "node_modules"));
  return dir;
}
// One release at a time: two would deploy over each other. The lock lives in the repository, so
// every shell sees it; a lock whose process has gone is taken over.
export function lock(gitDir) {
  const file = path.join(gitDir, "pencils-release.lock");
  for (let attempt = 0; ; attempt++) {
    try {
      fs.writeFileSync(file, `${process.pid} ${Date.now()}`, { flag: "wx" });
      return () => fs.rmSync(file, { force: true });
    } catch (error) {
      if (error.code !== "EEXIST" || attempt) throw error.code === "EEXIST" ? new Error(`Another release is running. If none is, remove ${file}.`) : error;
    }
    const pid = Number(fs.readFileSync(file, "utf8").split(" ")[0]);
    let alive = false;
    if (Number.isInteger(pid) && pid > 0) try { process.kill(pid, 0); alive = true; } catch (error) { alive = error.code === "EPERM"; }
    if (alive) throw new Error(`Another release is running (process ${pid}). If none is, remove ${file}.`);
    fs.rmSync(file, { force: true });
  }
}
// Commits the snapshot on top of the commit it was taken from, moves the branch there if nothing
// else was committed meanwhile, and pushes. The working tree's files are left as they are.
// branch: the branch checked out when the snapshot was taken (refs/heads/...). Only the released
// paths' index entries are reset, so anything staged meanwhile stays staged.
export async function commitRelease(root, snap, base, branch, version, message, { log } = {}) {
  const index = path.join(os.tmpdir(), `pencils-release-index-${process.pid}`);
  const env = { ...process.env, GIT_INDEX_FILE: index, GIT_WORK_TREE: snap };
  const git = (args, options = {}) => command("git", args, { cwd: root, env: process.env, log, ...options });
  let commit;
  try {
    await git(["read-tree", base], { env });
    await git(["add", "-A", "--", ".", ":(exclude)node_modules"], { env });
    const tree = (await git(["write-tree"], { env })).trim();
    commit = (await git(["commit-tree", tree, "-p", base, "-m", message])).trim();
  } finally { fs.rmSync(index, { force: true }); }
  const current = (await git(["symbolic-ref", "-q", "HEAD"]).catch(() => "")).trim();
  let moved = current === branch && !!branch;
  if (moved) try { await git(["update-ref", branch, commit, base]); } catch { moved = false; }
  if (!moved) {
    let side = `release-${version}`;
    if (await git(["rev-parse", "-q", "--verify", `refs/heads/${side}`]).then(() => true, () => false)) side += `-${Date.now()}`;
    await git(["branch", side, commit]);
    return { commit, moved: false, branch: side };
  }
  const pushed = await git(["push", "origin", branch.replace("refs/heads/", "")]).then(() => true, () => false);
  const paths = (await git(["diff", "--name-only", "-z", base, commit])).split("\0").filter(Boolean);
  const reset = !paths.length || await git(["reset", "-q", "--", ...paths]).then(() => true, () => false);
  return { commit, moved: true, pushed, reset, branch: branch.replace("refs/heads/", "") };
}

async function main() {
  const file = (name, root = projectRoot) => path.join(root, name);
  const git = (...args) => execFileSync("git", args, { cwd: projectRoot, encoding: "utf8", maxBuffer: 1 << 26 }).trim();
  const current = JSON.parse(fs.readFileSync(file("package.json"), "utf8")).version;
  const wanted = process.argv[2] || "patch";
  const batch = wanted === "patch" ? releaseFeatures(current, roadmap) : null;
  const version = batch?.version || nextVersion(current, wanted);
  const log0 = fs.readFileSync(file("CHANGELOG.md"), "utf8");
  releasedBefore(log0, current);
  if (batch) unreleasedNames(log0, batch.items.map((item) => item.id));
  // New files, staged or not: both are copied, deployed, committed and pushed.
  const added = [...new Set([...git("ls-files", "-o", "--exclude-standard", "-z").split("\0"), ...git("diff", "--cached", "--name-only", "--diff-filter=A", "-z", "HEAD").split("\0")])].filter(Boolean);
  const secrets = secretFiles(added);
  if (secrets.length) throw new Error(`These new files look like secrets and would be committed and pushed: ${secrets.join(", ")}. Ignore or remove them first.`);
  const url = process.env.PENCILS_URL || "http://127.0.0.1:3000";
  // A release that went live and then failed must not run again: it would retag the rollback image to the live one.
  const running = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json(), () => null);
  if (running?.version === version) throw new Error(`Pencils already runs ${version}: an earlier release went live without finishing. Finish the steps its log lists instead of releasing again.`);
  const logFile = path.join(os.tmpdir(), `pencils-release-${version}.log`);
  const unlock = lock(git("rev-parse", "--absolute-git-dir"));
  const log = fs.createWriteStream(logFile);
  const started = Date.now();
  let stage = "";
  const step = async (name, fn) => {
    const t = Date.now();
    stage = name;
    process.stdout.write(`${name}… `);
    const result = await fn();
    const took = `${((Date.now() - t) / 1000).toFixed(1)}s`;
    console.log(took);
    log.write(`\n[release] ${name}: ${took}\n`);
    return result;
  };
  // The container starts from the repository's compose file and installs from the snapshot's lockfile.
  const pinned = ["compose.yaml", "package-lock.json"], hash = () => pinned.map((name) => fs.readFileSync(file(name), "utf8")).join("\0");
  let snap, live = false;
  const written = [];
  try {
    const base = git("rev-parse", "HEAD"), branch = git("symbolic-ref", "-q", "HEAD");
    const pins = hash();
    if (added.length) log.write(`New files in this release:\n${added.join("\n")}\n`);
    const plan = await step("Snapshot of the working tree", () => {
      snap = snapshot(projectRoot);
      return affected(changedFiles(projectRoot), { root: snap, changes: gitChanges(projectRoot, snap) });
    });
    const run = (cmd, args) => command(cmd, args, { cwd: snap, log });
    const versioned = ["package.json", "package-lock.json", "public/app-version.js", "CHANGELOG.md"];
    const before = Object.fromEntries(versioned.map((name) => [name, fs.readFileSync(file(name, snap), "utf8")]));
    const changelog = datedChangelog(before["CHANGELOG.md"], version, londonDate());
    await step("Checks (syntax, types, unit tests) and assets", async () => { await run("npm", ["run", "check"]); await run("npm", ["test"]); await run("npm", ["run", "build"]); });
    log.write(`Browser test selection:\n${plan.reasons.join("\n")}\n`);
    await step(`Browser tests (${describe(plan)})`, () => runAffected(plan, { log, cwd: snap }));
    await step(`Version ${current} → ${version}`, async () => {
      await run("npm", ["version", version, "--no-git-tag-version"]);
      fs.writeFileSync(file("public/app-version.js", snap), withAppVersion(before["public/app-version.js"], version));
      fs.writeFileSync(file("CHANGELOG.md", snap), changelog);
    });
    const unchanged = () => { if (hash() !== pins) throw new Error(`${pinned.join(" or ")} changed in the working tree during the release; release again once that work is done.`); };
    unchanged();
    const rollback = `pencils:rollback-before-${version}`;
    await step("Build, deploy and wait for the new version", () => deploy(projectRoot, version, { log, url, rollback, context: snap, check: unchanged }));
    live = true;
    await step("Tag the release image", () => command("docker", ["tag", "pencils:local", `pencils:release-${version}`], { log }));
    const health = await fetch(`${url}/api/health`).then(r => r.json());
    // Live now. The working tree takes the new version, keeping what was written while this ran.
    const unfinished = [];
    stage = "Give the working tree the new version";
    for (const name of versioned) {
      const after = fs.readFileSync(file(name, snap), "utf8"), main = fs.readFileSync(file(name), "utf8");
      const merged = name === "CHANGELOG.md" ? mergedChangelog(main, before[name], after) : mainCopy(name, main, before[name], after, version);
      if (merged === null) unfinished.push(name); else { fs.writeFileSync(file(name), merged); written.push(name); }
    }
    const titles = batch ? batch.items.map((item) => item.title).join("; ") : "";
    const message = `Release ${version}${titles ? `: ${titles}` : ""}${process.env.RELEASE_COMMIT_TRAILER ? `\n\n${process.env.RELEASE_COMMIT_TRAILER}` : ""}`;
    const committed = await step("Commit and push", () => commitRelease(projectRoot, snap, base, branch, version, message, { log }));
    try {
      await step("Keep the last three Pencils images", async () => {
        const result = await pruneReleaseImages((cmd, args) => command(cmd, args, { log }), { version, health });
        log.write(`Image retention: ${JSON.stringify(result)}\n`);
        if (result.skipped.length || result.errors.length)
          console.warn(`\nImage cleanup incomplete: ${result.skipped.length} images in use; ${result.errors.length} removal errors. See ${logFile}.`);
      });
    } catch (error) {
      // Cleanup cannot roll back a healthy deployment or delete around a failed safeguard.
      console.warn(`\nImage cleanup skipped: ${error.message} See ${logFile}.`);
      log.write(`Image cleanup skipped: ${error.message}\n`);
    }
    if (unfinished.length) console.warn(`\nChanged while the release ran; give these version ${version} by hand: ${unfinished.join(", ")}.`);
    if (!committed.moved) console.warn(`\nThe branch moved while the release ran: the release commit ${committed.commit.slice(0, 7)} is on the branch ${committed.branch}. Merge it.`);
    else {
      if (!committed.pushed) console.warn(`\nThe push failed; push ${committed.branch} when the remote is reachable.`);
      if (!committed.reset) console.warn(`\nThe index could not be updated; run "git reset -q" before committing.`);
    }
    fs.rmSync(snap, { recursive: true, force: true });
    console.log(`Live: ${JSON.stringify(health)} in ${((Date.now() - started) / 1000).toFixed(0)}s. Rollback image: ${rollback}. Commit: ${committed.commit.slice(0, 7)}.`);
  } catch (error) {
    console.log("failed");
    if (live) {
      console.error(`${version} is live, but "${stage}" failed: ${error.message}\nWorking tree files given the new version: ${written.join(", ") || "none"}. Finish the remaining steps by hand; don't release ${version} again.\nLog: ${logFile}${snap ? `\nSnapshot: ${snap}` : ""}`);
    } else {
      // Keep the test results; the rest of the snapshot (assets, a copy of the tree) goes.
      let results = "";
      if (snap) {
        results = path.join(os.tmpdir(), `pencils-release-${version}-results`);
        fs.rmSync(results, { recursive: true, force: true });
        fs.mkdirSync(results);
        for (const name of ["test-results", "playwright-report"]) if (fs.existsSync(path.join(snap, name))) fs.renameSync(path.join(snap, name), path.join(results, name));
        fs.rmSync(snap, { recursive: true, force: true });
      }
      console.error(`${error.message}\nLog: ${logFile}${results ? `\nTest results: ${results}` : ""}\nThe working tree was not changed.`);
    }
    process.exitCode = 1;
  } finally { log.end(); unlock(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
