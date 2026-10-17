import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
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
  }
  async acquire() {
    await this.store.safe(this.lock);
    await fs.mkdir(path.dirname(this.lock), { recursive: true });
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
        throw new Problem(
          423,
          "Vault writer lock is incomplete. Stop other servers and inspect .pencils/writer.lock before removing it.",
        );
      }
      if (old.host !== os.hostname())
        throw new Problem(423, "Another host owns the vault writer lock.");
      let alive = true;
      try {
        process.kill(old.pid, 0);
      } catch (e) {
        if (e.code === "ESRCH") alive = false;
      }
      if (alive)
        throw new Problem(
          423,
          "Another Pencils process is writing this vault. Retry shortly.",
        );
      await fs.rm(this.lock, { recursive: true });
      await fs.mkdir(this.lock);
    }
    await fs.writeFile(
      path.join(this.lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        host: os.hostname(),
        created: new Date().toISOString(),
      }),
      { flag: "wx", mode: 0o600 },
    );
  }
  async release() {
    await fs.rm(this.lock, { recursive: true, force: true });
  }
  async start() {
    await this.acquire();
    try {
      await this.store.safe(this.root);
      await fs.mkdir(this.root, { recursive: true });
      const id = randomUUID();
      this.active = { id, phase: "active", files: [], moves: [] };
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
  async stage(file, text) {
    if (!this.active) return;
    const relative = path.relative(this.store.root, file);
    await this.store.safe(file);
    let item = this.active.files.find((f) => f.path === relative);
    if (!item) {
      let before = null;
      try {
        before = await fs.readFile(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      item = {
        path: relative,
        before: before ? digest(before) : null,
        after: [],
        backup: `before-${this.active.files.length}`,
      };
      if (before)
        await atomic(path.join(this.root, this.active.id, item.backup), before);
      this.active.files.push(item);
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
    if (!this.active) return fs.rename(source, target);
    await this.store.safe(source);
    await this.store.safe(target);
    this.active.moves.push({
      source: path.relative(this.store.root, source),
      target: path.relative(this.store.root, target),
      hash: await this.fingerprint(source),
    });
    await this.persist();
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
    if (!this.active) return;
    const record = this.active;
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
      this.store.cache.clear();
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
