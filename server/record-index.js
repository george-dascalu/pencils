import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";

export class RecordIndex {
  constructor(store) {
    this.store = store;
    this.worker = null;
    this.opening = null;
    this.closing = null;
    this.pending = new Map();
    this.sequence = 0;
    this.versions = new Map();
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
      const history = this.store.changeLog;
      const changes = history.filter((c) => c.version > since);
      const full =
        force ||
        since === undefined ||
        (history.length && since < history[0].version - 1) ||
        changes.some(
          (c) =>
            !c.record ||
            (c.record.project === project && c.record.kind === "project"),
        );
      const started = performance.now(),
        tasks = [],
        deleted = [];
      if (full) {
        // No board/document payloads are read just to index task text.
        tasks.push(...(await this.store.children(project, "tasks")).items);
      } else {
        const ids = new Set(
          changes
            .filter(
              (c) => c.record?.project === project && c.record.kind === "tasks",
            )
            .map((c) => c.record.id),
        );
        for (const id of ids) {
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
  async search(project, text, limit = 60) {
    await this.ensure(project);
    return this.call("search", { project, text, limit });
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
    for (const p of (await this.store.list()).projects)
      await this.ensure(p.id, true);
    return { projects: this.versions.size, last: this.lastRebuild };
  }
  close() {
    const worker = this.worker;
    this.worker = null;
    this.opening = null;
    this.versions.clear();
    for (const p of this.pending.values())
      p.reject(new Error("Search index closed."));
    this.pending.clear();
    this.closing = worker?.terminate();
    return this.closing;
  }
}
