import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vaultSource } from "../scripts/deploy.mjs";

// A drive remounted at another path leaves the container's recorded vault missing; Docker then
// recreates it as an empty folder owned by root and Pencils cannot start (1 November 2026).
const made = [];
test.after(() => made.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
function folders() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "pencils-deploy-"));
  made.push(base);
  const dir = (...parts) => { const p = path.join(base, ...parts); fs.mkdirSync(p, { recursive: true }); return p; };
  return { base, dir, fill: p => fs.writeFileSync(path.join(p, "project.md"), "x") };
}

test("a release keeps the recorded vault while it holds files", () => {
  const { dir, fill } = folders();
  const vault = dir("Work", "pencils", "vault");
  fill(vault);
  assert.equal(vaultSource(vault, dir("Work", "pencils"), dir("Work1", "pencils")), vault);
});

test("a release finds the repository's vault at its new path when the drive moved", () => {
  const { dir, fill } = folders();
  const moved = dir("Work1", "pencils", "vault");
  fill(moved);
  const stub = dir("Work", "pencils", "vault");
  assert.equal(vaultSource(stub, path.join(stub, ".."), path.join(moved, "..")), moved, "an empty stub at the old path");
  const old = dir("Old", "pencils");
  assert.equal(vaultSource(path.join(old, "vault"), old, path.join(moved, "..")), moved, "a missing old path");
});

test("a release stops instead of guessing when another vault is missing", () => {
  const { dir, fill } = folders();
  fill(dir("Work1", "pencils", "vault"));
  const elsewhere = dir("Elsewhere", "vault");
  assert.throws(() => vaultSource(elsewhere, dir("Work", "pencils"), dir("Work1", "pencils")), /missing or empty/);
  const stub = dir("Work", "pencils", "vault");
  assert.throws(() => vaultSource(stub, dir("Work", "pencils"), dir("Empty", "pencils")), /missing or empty/, "no vault at the new path either");
});

test("a release stops when it cannot read the recorded vault, rather than treating it as gone", () => {
  const { dir, fill } = folders();
  fill(dir("Work1", "pencils", "vault"));
  const vault = dir("Work", "pencils", "vault");
  fill(vault);
  fs.chmodSync(vault, 0);
  try {
    assert.throws(() => vaultSource(vault, dir("Work", "pencils"), dir("Work1", "pencils")), /Cannot read the vault/);
  } finally {
    fs.chmodSync(vault, 0o755);
  }
});
