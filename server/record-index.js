import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { documentEntry, boardEntry } from "./search-query.js";

export class RecordIndex {
  constructor(store) {
    this.store = store;
    this.worker = null;
    this.opening = null;
    this.closing = null;
    this.pending = new Map();
    this.sequence = 0;
    this.versions = new Map();
    this.contentVersions = new Map();
    this.queue = Promise.resolve();
    this.lastRebuild = null;
  }
  async open() {
    if (this.opening) return this.opening;
    this.opening = (async () => {
      await this.closing;
      const file = path.join(this.store.root, ".pencils", "index.sqlite");
      await this.store.safe(file);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const worker = (this.worker = new Worker(
        new URL("./index-worker.js", import.meta.url),
        { workerData: { file } },
      ));
      await new Promise((resolve, reject) => {
        worker.on("message", (message) => {
          if (message.ready) {
            worker.unref();
            resolve();
            return;
          }
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          message.error
            ? pending.reject(new Error(message.error))
            : pending.resolve(message.result);
          if (!this.pending.size) worker.unref();
        });
        const failed = (error) => {
          reject(error);
          if (this.worker !== worker) return;
          for (const pending of this.pending.values()) pending.reject(error);
          this.pending.clear();
          this.worker = null;
          this.opening = null;
          this.versions.clear();
          this.contentVersions.clear();
        };
        worker.on("error", failed);
        worker.on("exit", (code) => {
          if (this.worker === worker)
            failed(
              new Error(`Search worker stopped (${code}). Retry the request.`),
            );
        });
      });
    })().catch((error) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }
  async call(action, data) {
    await this.open();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.ref();
      this.worker.postMessage({ id, action, data });
    });
  }
  async ensure(project, force = false) {
    const work = this.queue.then(async () => {
      await this.open();
      const since = this.versions.get(project);
      const version = this.store.version;
      if (!force && since === version) return;
      const changed = force ? null : this.changes(project, since, ["tasks"]);
      const full = !changed;
      const started = performance.now(),
        tasks = [],
        deleted = [];
      if (full) {
        // No board/document payloads are read just to index task text.
        tasks.push(...(await this.store.children(project, "tasks")).items);
      } else {
        for (const id of changed.tasks) {
          const file = this.store.file(project, "tasks", id);
          try {
            tasks.push(this.store.public(await this.store.read(file), file));
          } catch (error) {
            if (error.status !== 404 && error.code !== "ENOENT") throw error;
            deleted.push(id);
          }
        }
      }
      if (full || tasks.length || deleted.length) {
        await this.call("update", { project, full: !!full, tasks, deleted });
        this.lastRebuild = {
          project,
          tasks: tasks.length,
          deleted: deleted.length,
          incremental: !full,
          duration_ms: Math.round(performance.now() - started),
          at: new Date().toISOString(),
        };
      }
      this.versions.set(project, version);
    });
    this.queue = work.catch(() => {});
    return work;
  }
  // Which records of `kinds` changed since `since`; null when only a full reindex is safe.
  changes(project, since, kinds) {
    const history = this.store.changeLog;
    const changes = history.filter((c) => c.version > since);
    if (
      since === undefined ||
      (history.length && since < history[0].version - 1) ||
      changes.some((c) => !c.record || (c.record.project === project && c.record.kind === "project"))
    )
      return null;
    return Object.fromEntries(kinds.map((kind) => [kind, new Set(changes.filter((c) => c.record.project === project && c.record.kind === kind).map((c) => c.record.id))]));
  }
  // Documents and board text for search, tracked apart from cards so table queries never read them.
  async ensureContent(project) {
    const work = this.queue.then(async () => {
      await this.open();
      const since = this.contentVersions.get(project), version = this.store.version;
      if (since === version) return;
      const changed = this.changes(project, since, ["documents", "boards"]);
      const entries = [], deleted = [];
      for (const [kind, short, entry] of [["documents", "doc", documentEntry], ["boards", "board", boardEntry]]) {
        if (!changed) {
          for (const item of (await this.store.children(project, kind)).items) entries.push({ kind: short, ...entry(item) });
          continue;
        }
        for (const id of changed[kind]) {
          const file = this.store.file(project, kind, id);
          // Deleted or unreadable: left out of search (the full read skips it with a warning too).
          try {
            entries.push({ kind: short, ...entry(this.store.public(await this.store.read(file), file)) });
          } catch {
            deleted.push([short, id]);
          }
        }
      }
      if (!changed || entries.length || deleted.length)
        await this.call("content", { project, full: !changed, entries, deleted });
      this.contentVersions.set(project, version);
    });
    this.queue = work.catch(() => {});
    return work;
  }
  // One ranked list across the projects the caller can open (index-worker.js "search").
  async search(projects, text, limit = 60) {
    for (const p of projects) {
      await this.ensure(p.id);
      await this.ensureContent(p.id);
    }
    return this.call("search", { projects: projects.map((p) => p.id), text, limit, now: Date.now() });
  }
  async query(project, input, user) {
    await this.ensure(project);
    const p = (await this.store.read(this.store.file(project, "project"))).data;
    return {
      ...(await this.call("query", {
        project,
        input,
        config: p.schema,
        username: user.username,
      })),
      version: this.versions.get(project),
    };
  }
  async rebuild() {
    this.contentVersions.clear();
    for (const p of (await this.store.list()).projects)
      await this.ensure(p.id, true);
    return { projects: this.versions.size, last: this.lastRebuild };
  }
  close() {
    const worker = this.worker;
    this.worker = null;
    this.opening = null;
    this.versions.clear();
    this.contentVersions.clear();
    for (const p of this.pending.values())
      p.reject(new Error("Search index closed."));
    this.pending.clear();
    this.closing = worker?.terminate();
    return this.closing;
  }
}
