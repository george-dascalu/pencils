import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { nextVersion, londonDate, datedChangelog, withAppVersion } from "../scripts/release.mjs";

test("the next release bumps the patch or takes an explicit newer version", () => {
  assert.equal(nextVersion("0.19.27", "patch"), "0.19.28");
  assert.equal(nextVersion("0.19.27", "minor"), "0.20.0");
  assert.equal(nextVersion("0.19.27", "0.20.0"), "0.20.0");
  assert.throws(() => nextVersion("0.19.27", "0.19.27"), /newer/);
  assert.throws(() => nextVersion("0.19.27", "0.9.30"), /newer/);
  assert.throws(() => nextVersion("0.19.27", "banana"), /version/);
});

test("release dates use Europe/London", () => {
  assert.equal(londonDate(new Date("2026-10-28T23:30:00Z")), "2026-10-28", "GMT in winter");
  assert.equal(londonDate(new Date("2026-07-01T23:30:00Z")), "2026-07-02", "BST in summer");
});

test("the Unreleased changelog section becomes the dated release", () => {
  const log = "# Changelog\n\nIntro.\n\n## Unreleased\n\n### Fixed\n\n- A fix.\n\n## 0.19.27 — 2026-10-28\n";
  assert.equal(datedChangelog(log, "0.19.28", "2026-10-29"), log.replace("## Unreleased", "## 0.19.28 — 2026-10-29"));
  const written = log.replace("## Unreleased", "## 0.19.28 — 2026-10-27");
  assert.equal(datedChangelog(written, "0.19.28", "2026-10-29"), log.replace("## Unreleased", "## 0.19.28 — 2026-10-29"), "An entry written for the version gets the release date");
  assert.throws(() => datedChangelog("# Changelog\n\n## 0.19.27 — 2026-10-28\n", "0.19.28", "2026-10-29"), /CHANGELOG/);
});

test("the client version constant is rewritten", () => {
  assert.equal(withAppVersion("export const APP_VERSION = '0.19.27';\nrest", "0.19.28"), "export const APP_VERSION = '0.19.28';\nrest");
});

test("package files, the app and the changelog agree on the version", async () => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
  const lock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
  const app = await fs.readFile("public/app-version.js", "utf8");
  const top = (await fs.readFile("CHANGELOG.md", "utf8")).match(/^## (.+)$/m)[1];
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.match(app, new RegExp(`APP_VERSION = '${pkg.version.replaceAll(".", "\\.")}'`));
  assert.ok(top === "Unreleased" || top.startsWith(`${pkg.version} `), `Newest changelog heading "${top}" is Unreleased or ${pkg.version}`);
});
