// F0.21-94: a release runs from a snapshot of the working tree, so work can go on meanwhile, and
// commits that snapshot without touching what was written after it.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshot, commitRelease, lock } from "../scripts/release.mjs";

const made = [];
test.after(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-test-"));
  made.push(root);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
  fs.writeFileSync(path.join(root, ".gitignore"), "ignored/\nnode_modules/\n");
  fs.writeFileSync(path.join(root, "kept.txt"), "one\n");
  fs.writeFileSync(path.join(root, "gone.txt"), "old\n");
  git("add", "-A"); git("commit", "-q", "-m", "start");
  fs.mkdirSync(path.join(root, "node_modules")); fs.mkdirSync(path.join(root, "ignored"));
  fs.writeFileSync(path.join(root, "ignored", "big.bin"), "x");
  return { root, git };
}

test("the snapshot holds tracked and new files, not ignored ones, with node_modules linked", () => {
  const { root } = repo();
  fs.writeFileSync(path.join(root, "kept.txt"), "two\n");
  fs.writeFileSync(path.join(root, "new.txt"), "new\n");
  fs.rmSync(path.join(root, "gone.txt"));
  const snap = snapshot(root); made.push(snap);
  assert.equal(fs.readFileSync(path.join(snap, "kept.txt"), "utf8"), "two\n");
  assert.equal(fs.readFileSync(path.join(snap, "new.txt"), "utf8"), "new\n");
  assert.equal(fs.existsSync(path.join(snap, "gone.txt")), false);
  assert.equal(fs.existsSync(path.join(snap, "ignored")), false);
  assert.equal(fs.realpathSync(path.join(snap, "node_modules")), fs.realpathSync(path.join(root, "node_modules")));
});

test("the release commit is the snapshot; later edits stay in the working tree, uncommitted", async () => {
  const { root, git } = repo();
  fs.writeFileSync(path.join(root, "kept.txt"), "two\n");
  fs.writeFileSync(path.join(root, "new.txt"), "new\n");
  fs.rmSync(path.join(root, "gone.txt"));
  const base = git("rev-parse", "HEAD"), snap = snapshot(root); made.push(snap);
  fs.writeFileSync(path.join(snap, "kept.txt"), "two, versioned\n"); // the release's own edit
  fs.writeFileSync(path.join(root, "staged.txt"), "staged\n"); git("add", "staged.txt"); // staged while it ran
  fs.writeFileSync(path.join(root, "next.txt"), "next feature\n"); // written while it ran
  fs.writeFileSync(path.join(root, "kept.txt"), "two, versioned\n");
  const result = await commitRelease(root, snap, base, "refs/heads/main", "1.0.1", "Release 1.0.1: thing");
  assert.equal(result.moved, true);
  assert.equal(result.pushed, false, "no remote here");
  assert.equal(git("rev-parse", "HEAD"), result.commit);
  assert.equal(git("log", "-1", "--format=%s"), "Release 1.0.1: thing");
  assert.equal(git("show", "HEAD:kept.txt"), "two, versioned");
  assert.equal(git("show", "HEAD:new.txt"), "new");
  assert.throws(() => git("show", "HEAD:gone.txt"), "the deletion is committed");
  assert.throws(() => git("show", "HEAD:node_modules"), "the link is not committed");
  assert.equal(git("status", "--porcelain"), "A  staged.txt\n?? next.txt", "only the later work is left, still staged as it was");
});

test("if something was committed meanwhile, the release commit waits on its own branch", async () => {
  const { root, git } = repo();
  const base = git("rev-parse", "HEAD"), snap = snapshot(root); made.push(snap);
  fs.writeFileSync(path.join(snap, "kept.txt"), "released\n");
  fs.writeFileSync(path.join(root, "other.txt"), "x\n");
  git("add", "other.txt"); git("commit", "-q", "-m", "meanwhile");
  const head = git("rev-parse", "HEAD");
  const result = await commitRelease(root, snap, base, "refs/heads/main", "1.0.1", "Release 1.0.1: thing\n\nCo-Authored-By: X <x@example.com>");
  assert.equal(result.moved, false);
  assert.equal(result.branch, "release-1.0.1");
  assert.equal(git("rev-parse", "HEAD"), head, "the branch keeps its own commit");
  assert.equal(git("rev-parse", "release-1.0.1"), result.commit);
  // A switch to another branch meanwhile counts too.
  const again = await commitRelease(root, snap, head, "refs/heads/other", "1.0.2", "Release 1.0.2");
  assert.equal(again.moved, false);
  assert.equal(git("rev-parse", "HEAD"), head);
});

test("one release at a time, with a stale or empty lock taken over", () => {
  const { root } = repo();
  const unlock = lock(path.join(root, ".git"));
  assert.throws(() => lock(path.join(root, ".git")), /Another release is running/);
  unlock();
  fs.writeFileSync(path.join(root, ".git", "pencils-release.lock"), "999999999 0");
  lock(path.join(root, ".git"))();
  fs.writeFileSync(path.join(root, ".git", "pencils-release.lock"), "");
  lock(path.join(root, ".git"))();
});
