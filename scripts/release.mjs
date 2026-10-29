// One-step release of the working tree to the running Pencils container (AGENTS.md › Deployment):
// syntax/type/unit checks, version and changelog date, an image build that keeps a rollback
// image, and a health check for the new version. Browser suites run separately (npm run e2e).
// Usage: npm run release -- patch|minor|<x.y.z>
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { command, deploy, projectRoot } from "./deploy.mjs";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function nextVersion(current, wanted) {
  const [, major, minor, patch] = current.match(SEMVER).map(Number);
  if (wanted === "patch") return `${major}.${minor}.${patch + 1}`;
  if (wanted === "minor") return `${major}.${minor + 1}.0`;
  const parts = wanted?.match(SEMVER);
  if (!parts) throw new Error(`Give patch, minor or a version like 1.2.3 (got "${wanted}").`);
  const newer = parts.slice(1).map(Number).map((n, i) => n - [major, minor, patch][i]).find(d => d !== 0) > 0;
  if (!newer) throw new Error(`${wanted} must be newer than the current ${current}.`);
  return wanted;
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

async function main() {
  const file = name => path.join(projectRoot, name);
  const current = JSON.parse(fs.readFileSync(file("package.json"), "utf8")).version;
  const version = nextVersion(current, process.argv[2] || "patch");
  const changelog = datedChangelog(fs.readFileSync(file("CHANGELOG.md"), "utf8"), version, londonDate());
  const url = process.env.PENCILS_URL || "http://127.0.0.1:3000";
  const logFile = path.join(os.tmpdir(), `pencils-release-${version}.log`);
  const log = fs.createWriteStream(logFile);
  const run = (cmd, args) => command(cmd, args, { log });
  // A failed deploy restores the previous container; these files go back with it, so a retry starts clean.
  const versioned = ["package.json", "package-lock.json", "public/app-version.js", "CHANGELOG.md"];
  const originals = Object.fromEntries(versioned.map((name) => [name, fs.readFileSync(file(name), "utf8")]));
  let bumped = false;
  const started = Date.now();
  const step = async (name, fn) => {
    const t = Date.now();
    process.stdout.write(`${name}… `);
    const result = await fn();
    console.log(`${((Date.now() - t) / 1000).toFixed(1)}s`);
    return result;
  };
  try {
    await step("Checks (syntax, types, unit tests)", async () => { await run("npm", ["run", "check"]); await run("npm", ["test"]); });
    await step(`Version ${current} → ${version}`, async () => {
      bumped = true;
      await run("npm", ["version", version, "--no-git-tag-version"]);
      fs.writeFileSync(file("public/app-version.js"), withAppVersion(fs.readFileSync(file("public/app-version.js"), "utf8"), version));
      fs.writeFileSync(file("CHANGELOG.md"), changelog);
    });
    const rollback = `pencils:rollback-before-${version}`;
    await step("Build, deploy and wait for the new version", () => deploy(projectRoot, version, { log, url, rollback }));
    bumped = false; // live now: keep the new version files
    await step("Tag the release image", () => run("docker", ["tag", "pencils:local", `pencils:release-${version}`]));
    const health = await fetch(`${url}/api/health`).then(r => r.json());
    console.log(`Live: ${JSON.stringify(health)} in ${((Date.now() - started) / 1000).toFixed(0)}s. Rollback image: ${rollback}.`);
  } catch (error) {
    console.log("failed");
    console.error(`${error.message}\nLog: ${logFile}`);
    if (bumped) {
      for (const [name, text] of Object.entries(originals)) fs.writeFileSync(file(name), text);
      console.error(`Version files restored to ${current}.`);
    }
    process.exitCode = 1;
  } finally { log.end(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
