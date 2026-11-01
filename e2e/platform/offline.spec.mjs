// The Docker image works with no network at all (--network none): every page asset is served
// locally, and a vault written by one offline container reads back in a fresh one. The image is
// built from the working tree under its own tag, so the running deployment is not touched.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const image = "pencils:offline-check";
const run = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });
const docker = run("docker", ["info"]).status === 0;

test.describe.configure({ mode: "serial", timeout: 300000 });
test.skip(!docker, "Needs Docker");

let vault;
test.beforeAll(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), "pencils-offline-"));
});
test.afterAll(async () => {
  if (vault) await fs.rm(vault, { recursive: true, force: true });
  if (docker) run("docker", ["rmi", image]);
});

test("the image builds from the working tree", () => {
  const build = run("docker", ["build", "-q", "-t", image, "."]);
  expect(build.status, build.stderr).toBe(0);
});

for (const step of ["write", "read"])
  test(`an offline container can ${step} the vault`, () => {
    const env = { OFFLINE_IMAGE: image, SMOKE_VAULT_PATH: vault, LOCAL_UID: String(os.userInfo().uid), LOCAL_GID: String(os.userInfo().gid) };
    const result = run("docker", ["compose", "-f", "e2e/platform/compose.offline.yaml", "run", "--rm", "offline-check", step], env);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/PASS/);
  });

test("a replacement container recovers an interrupted writer with a different hostname", () => {
  const args = ["run", "--rm", "--network", "none", "--user", `${os.userInfo().uid}:${os.userInfo().gid}`, "-v", `${vault}:/data`, image, "node", "--input-type=module", "-e"];
  const crash = run("docker", [...args, `import { Store } from './server/store.js'; const store = new Store('/data'); await store.init(); await store.journal.start(); process.exit(73);`]);
  expect(crash.status, crash.stderr).toBe(73);
  const recover = run("docker", [...args, `import assert from 'node:assert/strict'; import { Store } from './server/store.js'; const store = new Store('/data'); await store.init(); assert.deepEqual(await store.journal.issues(), []); assert.ok((await store.list()).projects.length); store.close();`]);
  expect(recover.status, recover.stderr).toBe(0);
});
