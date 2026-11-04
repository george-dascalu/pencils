import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { nextVersion, releaseFeatures, londonDate, datedChangelog, withAppVersion, unreleasedNames, mergedChangelog, mainCopy, releasedBefore, secretFiles } from "../scripts/release.mjs";

test("the next release bumps the patch or takes an explicit newer version", () => {
  assert.equal(nextVersion("0.19.27", "patch"), "0.19.28");
  assert.equal(nextVersion("0.19.27", "minor"), "0.20.0");
  assert.equal(nextVersion("0.19.27", "0.20.0"), "0.20.0");
  assert.throws(() => nextVersion("0.19.27", "0.19.27"), /newer/);
  assert.throws(() => nextVersion("0.19.27", "0.9.30"), /newer/);
  assert.throws(() => nextVersion("0.19.27", "banana"), /version/);
});

test("feature 100 rolls into the next minor without changing the major", () => {
  assert.equal(nextVersion("0.21.0", "patch"), "0.21.1");
  assert.equal(nextVersion("0.21.98", "patch"), "0.21.99");
  assert.equal(nextVersion("0.21.99", "patch"), "0.22.0");
  assert.equal(nextVersion("0.22.0", "patch"), "0.22.1");
  assert.equal(nextVersion("2.99.99", "patch"), "2.100.0");
  assert.equal(nextVersion("0.20.130", "0.21.0"), "0.21.0", "the new baseline preserves history");
  assert.throws(() => nextVersion("0.21.99", "0.21.100"), /patch.*99/i);
});

test("a patch release ships the completed features numbered next in its cycle", () => {
  const first = { id: "F0.21-1", status: "done", version: "0.21.1" };
  assert.deepEqual(releaseFeatures("0.21.0", [first]), { version: "0.21.1", items: [first] });
  const tracking = { requested: '2026-11-03T17:08:26Z', started: '2026-11-03T17:08:45Z', done: '2026-11-03T17:35:00Z', model: 'gpt-6.1-sol', effort: 'xhigh' };
  const last = { ...tracking, id: "F0.21-100", status: "done", version: "0.22.0" };
  assert.deepEqual(releaseFeatures("0.21.99", [first, last]).items, [last]);
  const restarted = { ...tracking, id: "F0.22-1", status: "done", version: "0.22.1" };
  assert.deepEqual(releaseFeatures("0.22.0", [first, last, restarted]).items, [restarted]);
  for (const entries of [[], [{ ...first, id: "T114" }], [{ ...first, status: "in progress" }]])
    assert.throws(() => releaseFeatures("0.21.0", entries), /F0\.21-1.*0\.21\.1/);
  assert.throws(() => releaseFeatures("0.20.130", []), /baseline/i);
});

// F0.21-94: one test run for every feature completed since the last release.
test("completed features in a row ship together under the last one's version", () => {
  const tracking = { requested: '2026-11-04T08:00:00Z', started: '2026-11-04T08:10:00Z', done: '2026-11-04T08:20:00Z', model: 'claude-opus-5-5', effort: 'xhigh' };
  const a = { ...tracking, id: "F0.21-94", status: "done", version: "0.21.95" }, b = { ...tracking, id: "F0.21-95", status: "done", version: "0.21.95" };
  assert.deepEqual(releaseFeatures("0.21.93", [b, a]), { version: "0.21.95", items: [a, b] });
  assert.deepEqual(releaseFeatures("0.21.93", [{ ...a, version: "0.21.94" }, { ...b, status: "in progress", version: undefined }]), { version: "0.21.94", items: [{ ...a, version: "0.21.94" }] }, "a feature still in progress waits");
  assert.throws(() => releaseFeatures("0.21.93", [{ ...a, version: "0.21.94" }, b]), /F0\.21-94.*0\.21\.95/, "each names the release that ships it");
  const end = [{ ...tracking, id: "F0.21-99", status: "done", version: "0.22.0" }, { ...tracking, id: "F0.21-100", status: "done", version: "0.22.0" }];
  assert.equal(releaseFeatures("0.21.98", end).version, "0.22.0", "a batch can roll into the next minor");
});

test("the Unreleased section names every feature a release ships", () => {
  const log = "# Changelog\n\n## Unreleased\n\n### Added\n- Feature F0.21-94: one.\n\n## 0.21.93 — 2026-11-04\n- Feature F0.21-93: old.\n";
  assert.doesNotThrow(() => unreleasedNames(log, ["F0.21-94"]));
  assert.throws(() => unreleasedNames(log, ["F0.21-94", "F0.21-95"]), /F0\.21-95/);
  assert.throws(() => unreleasedNames(log, ["F0.21-93"]), /F0\.21-93/, "an older section doesn't count");
});

test("the working tree gets the release's changelog heading above lines written while it ran", () => {
  const before = "# Changelog\n\n## Unreleased\n\n### Added\n- Feature F0.21-94: one.\n\n## 0.21.93 — 2026-11-04\n";
  const released = datedChangelog(before, "0.21.94", "2026-11-05");
  assert.equal(mergedChangelog(before, before, released), released, "untouched");
  const later = before.replace("## Unreleased\n\n", "## Unreleased\n\n### Fixed\n- Feature F0.21-95: two.\n\n");
  assert.equal(mergedChangelog(later, before, released), "# Changelog\n\n## Unreleased\n\n### Fixed\n- Feature F0.21-95: two.\n\n## 0.21.94 — 2026-11-05\n\n### Added\n- Feature F0.21-94: one.\n\n## 0.21.93 — 2026-11-04\n");
  assert.equal(mergedChangelog(before.replace("- Feature F0.21-94: one.", "- Feature F0.21-94: edited."), before, released), null, "a released line changed meanwhile");
});

test("version files in the working tree take the new version, keeping edits made while the release ran", () => {
  assert.equal(mainCopy("public/app-version.js", "A", "A", "B", "0.21.94"), "B", "untouched: the release's copy");
  assert.equal(mainCopy("public/app-version.js", "export const APP_VERSION = '0.21.93';\n// note\n", "export const APP_VERSION = '0.21.93';\n", "x", "0.21.94"), "export const APP_VERSION = '0.21.94';\n// note\n");
  assert.equal(mainCopy("package.json", '{\n  "name": "p",\n  "version": "0.21.93",\n  "x": 1\n}\n', '{\n  "name": "p",\n  "version": "0.21.93"\n}\n', "x", "0.21.94"), '{\n  "name": "p",\n  "version": "0.21.94",\n  "x": 1\n}\n');
  assert.equal(mainCopy("package-lock.json", "changed", "original", "x", "0.21.94"), null, "a lockfile changed meanwhile is left for a person");
});

test('future releases require recorded times and the actual model and effort', () => {
  const item = { id: 'F0.21-67', status: 'done', version: '0.21.67', requested: '2026-11-03T17:08:26Z', started: '2026-11-03T17:08:45Z', done: '2026-11-03T17:35:00Z', model: 'gpt-6.1-sol', effort: 'xhigh' };
  assert.deepEqual(releaseFeatures('0.21.66', [item]).items, [item]);
  for (const key of ['requested', 'started', 'done', 'model', 'effort']) {
    assert.throws(() => releaseFeatures('0.21.66', [{ ...item, [key]: '' }]), /timestamp|model|effort/i);
  }
  assert.throws(() => releaseFeatures('0.21.66', [{ ...item, started: '2026-11-03' }]), /timestamp/i);
  assert.throws(() => releaseFeatures('0.21.66', [{ ...item, done: '2026-11-03T16:00:00Z' }]), /order/i);
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

test("a release waits until the last one's changelog section is dated", () => {
  assert.doesNotThrow(() => releasedBefore("## Unreleased\n\n- x\n\n## 0.21.93 — 2026-11-04\n", "0.21.93"));
  assert.throws(() => releasedBefore("## Unreleased\n\n- x\n- y\n\n## 0.21.92 — 2026-11-04\n", "0.21.93"), /0\.21\.93/);
});

test("new files that look like secrets stop a release before anything is copied", () => {
  assert.deepEqual(secretFiles(["e2e/lists/new.spec.mjs", ".env.production", "keys/id_rsa", "server.pem", "config/secrets.json", "creds/credentials.txt", "public/token-input.js"]), [".env.production", "keys/id_rsa", "server.pem", "config/secrets.json", "creds/credentials.txt"]);
});
