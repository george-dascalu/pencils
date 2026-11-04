import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { Problem } from "./problem.js";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function atomic(file, bytes) {
  const tmp = `${file}.${randomUUID()}.tmp`,
    handle = await fs.open(tmp, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  const dir = await fs.open(path.dirname(file), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
export class WriteJournal {
  constructor(store) {
    this.store = store;
    this.root = path.join(store.root, ".pencils", "journal");
    this.lock = path.join(store.root, ".pencils", "writer.lock");
    this.active = null;
    this.context = new AsyncLocalStorage();
  }
  // Runs fn as the active transaction's own work.
  run(fn) {
    return this.context.run(this.active, fn);
  }
  // A scoped transaction (mutate's) takes only the writes made inside run(): another writer's save,
  // even one made while it starts, goes unjournaled instead of being undone with it (F0.22-8).
  foreign(tx) {
    return tx.scoped && this.context.getStore() !== tx;
  }
  async acquire() {
    if (this.handle) throw new Problem(423, "Another Pencils process is writing this vault. Retry shortly.");
    await this.store.safe(this.lock);
    await fs.mkdir(path.dirname(this.lock), { recursive: true });
    const guard = path.join(path.dirname(this.lock), "writer.guard");
    await this.store.safe(guard);
    const handle = await fs.open(guard, "a+", 0o600);
    try {
      // flock belongs to the inherited open file description: our descriptor holds it until close/crash.
      await new Promise((resolve, reject) => {
        const child = spawn("flock", ["-n", "3"], { stdio: ["ignore", "ignore", "pipe", handle.fd] });
        child.on("error", reject);
        child.on("exit", code => code === 0 ? resolve() : reject(new Problem(423, "Another Pencils process is writing this vault. Retry shortly.")));
      });
      this.kernelProtocol = (await handle.readFile("utf8")) === "kernel\n";
      if (!this.kernelProtocol && !(await fs.stat(this.lock).catch(error => { if (error.code !== "ENOENT") throw error; }))) {
        await handle.writeFile("kernel\n"); await handle.sync(); this.kernelProtocol = true;
      }
      await this.acquireOwner(handle);
      this.handle = handle;
    } catch (error) { await handle.close(); throw error; }
  }
  async acquireOwner(handle) {
    try {
      await fs.mkdir(this.lock);
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let old;
      try {
        old = JSON.parse(
          await fs.readFile(path.join(this.lock, "owner.json"), "utf8"),
        );
      } catch {
        if (this.kernelProtocol) old = { kernel: true };
        else throw new Problem(
          423,
          "Vault writer lock is incomplete. Stop other servers and inspect .pencils/writer.lock before removing it.",
        );
      }
      if (!old.kernel && old.host !== os.hostname())
        throw new Problem(423, "Another host owns the vault writer lock.");
      if (!old.kernel && !Number.isInteger(old.pid))
        throw new Problem(423, "The legacy writer lock has no valid process ID. Stop other servers and inspect it before removing it.");
      let alive = true;
      try {
        if (!old.kernel) process.kill(old.pid, 0);
      } catch (e) {
        if (e.code === "ESRCH") alive = false;
      }
      if (!old.kernel && alive)
        throw new Problem(
          423,
          "Another Pencils process is writing this vault. Retry shortly.",
        );
      if (!this.kernelProtocol) { await handle.writeFile("kernel\n"); await handle.sync(); this.kernelProtocol = true; }
      await fs.rm(this.lock, { recursive: true });
      await fs.mkdir(this.lock);
    }
    await fs.writeFile(
      path.join(this.lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        host: os.hostname(),
        created: new Date().toISOString(),
        kernel: true,
      }),
      { flag: "wx", mode: 0o600 },
    );
  }
  async release() {
    if (!this.handle) return;
    try { await fs.rm(this.lock, { recursive: true, force: true }); }
    finally { await this.handle.close(); this.handle = null; }
  }
  async start({ scoped = false } = {}) {
    await this.acquire();
    try {
      await this.store.safe(this.root);
      await fs.mkdir(this.root, { recursive: true });
      const id = randomUUID();
      this.active = { id, phase: "active", files: [], moves: [], ...(scoped && { scoped }) };
      await fs.mkdir(path.join(this.root, id));
      await this.persist();
    } catch (error) {
      this.active = null;
      await this.release();
      throw error;
    }
  }
  async persist() {
    await atomic(
      path.join(this.root, this.active.id, "transaction.json"),
      JSON.stringify(this.active),
    );
  }
  // A transaction can end while a write waits here (another save finishes); that write then goes
  // unjournaled, as with no transaction, instead of reading the ended transaction.
  async stage(file, text) {
    // A closing transaction (finish has begun) counts as ended (T35).
    const tx = this.active, ended = () => this.active !== tx || tx.closing;
    if (!tx || tx.closing || this.foreign(tx)) return;
    const relative = path.relative(this.store.root, file);
    await this.store.safe(file);
    if (ended()) return;
    let item = tx.files.find((f) => f.path === relative);
    if (!item) {
      let before = null;
      try {
        before = await fs.readFile(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (ended()) return;
      item = {
        path: relative,
        before: before ? digest(before) : null,
        after: [],
        // Unique, so files staged at once keep their own backups (T35).
        backup: `before-${randomUUID()}`,
      };
      // An ended transaction's folder may be gone before its backup lands.
      if (before)
        await atomic(path.join(this.root, tx.id, item.backup), before).catch((error) => { if (!ended()) throw error; });
      if (ended()) return;
      tx.files.push(item);
    }
    item.after.push(digest(text));
    await this.persist();
  }
  async fingerprint(file) {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink())
      throw new Problem(400, "Journal moves cannot follow symlinks.");
    if (stat.isDirectory()) {
      const entries = (await fs.readdir(file)).sort(),
        parts = [];
      for (const name of entries)
        parts.push(`${name}:${await this.fingerprint(path.join(file, name))}`);
      return digest(parts.join("\n"));
    }
    return digest(await fs.readFile(file));
  }
  async move(source, target) {
    const tx = this.active;
    if (!tx || this.foreign(tx)) return fs.rename(source, target);
    await this.store.safe(source);
    await this.store.safe(target);
    const hash = await this.fingerprint(source);
    // As in stage: a transaction that ended meanwhile leaves this move unjournaled.
    if (this.active === tx && !tx.closing) {
      tx.moves.push({
        source: path.relative(this.store.root, source),
        target: path.relative(this.store.root, target),
        hash,
      });
      await this.persist();
    }
    await fs.rename(source, target);
  }
  async rollback(record) {
    const conflicts = [];
    for (const move of [...record.moves].reverse()) {
      const source = path.join(this.store.root, move.source),
        target = path.join(this.store.root, move.target);
      await this.store.safe(source);
      await this.store.safe(target);
      const has = async (file) =>
        fs.lstat(file).then(
          () => true,
          (e) => (e.code === "ENOENT" ? false : Promise.reject(e)),
        );
      if (await has(source)) {
        if (await has(target)) conflicts.push(move.source);
        continue;
      }
      if ((await has(target)) && (await this.fingerprint(target)) === move.hash)
        await fs.rename(target, source);
      else conflicts.push(move.source);
    }
    for (const item of [...record.files].reverse()) {
      const file = path.join(this.store.root, item.path);
      await this.store.safe(file);
      let bytes = null;
      try {
        bytes = await fs.readFile(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      const current = bytes ? digest(bytes) : null;
      if (current === item.before) continue;
      if (current && item.after.includes(current)) {
        if (item.before) {
          const backup = path.join(this.root, record.id, item.backup);
          await this.store.safe(backup);
          await atomic(file, await fs.readFile(backup));
        } else await fs.rm(file, { force: true });
      } else if (!(current === null && item.before === null))
        conflicts.push(item.path);
    }
    return conflicts;
  }
  async finish(success) {
    if (!this.active || this.active.closing) return;
    const record = this.active;
    record.closing = true;
    try {
      if (success) {
        record.phase = "committed";
        await this.persist();
        await fs.rm(path.join(this.root, record.id), { recursive: true });
      } else {
        const conflicts = await this.rollback(record);
        if (conflicts.length) {
          record.phase = "conflict";
          record.conflicts = conflicts;
          await this.persist();
        } else
          await fs.rm(path.join(this.root, record.id), { recursive: true });
      }
    } finally {
      this.active = null;
      // Successful writes invalidate their own file. Clearing every parsed note
      // here made unrelated readers reparse the entire vault after each save.
      if (!success) this.store.cache.clear();
      await this.release();
    }
  }
  async recover() {
    await this.acquire();
    try {
      await this.store.safe(this.root);
      await fs.mkdir(this.root, { recursive: true });
      for (const id of await fs.readdir(this.root)) {
        if (!/^[a-f0-9-]{36}$/.test(id)) continue;
        const dir = path.join(this.root, id),
          file = path.join(dir, "transaction.json");
        await this.store.safe(file);
        let record;
        try {
          record = JSON.parse(await fs.readFile(file, "utf8"));
        } catch (e) {
          if (e.code === "ENOENT") continue;
          throw e;
        }
        if (record.id !== id)
          throw new Problem(
            409,
            "Invalid journal identity. Preserve the journal and inspect it before continuing.",
          );
        if (record.phase === "conflict") continue;
        if (record.phase === "active") {
          const conflicts = await this.rollback(record);
          if (conflicts.length) {
            record.phase = "conflict";
            record.conflicts = conflicts;
            await atomic(file, JSON.stringify(record));
            continue;
          }
        }
        await fs.rm(dir, { recursive: true });
      }
    } finally {
      await this.release();
    }
  }
  async issues() {
    try {
      const items = [];
      for (const id of await fs.readdir(this.root)) {
        if (!/^[a-f0-9-]{36}$/.test(id)) continue;
        const file = path.join(this.root, id, "transaction.json");
        await this.store.safe(file);
        const r = JSON.parse(await fs.readFile(file, "utf8"));
        if (r.phase === "conflict") items.push({ id, files: r.conflicts });
      }
      return items;
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
}
