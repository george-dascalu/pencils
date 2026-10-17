import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { tablePreferences, tableResult } from "../public/table-model.js";
import { Problem } from "./problem.js";
export class RecordIndex {
  constructor(store) {
    this.store = store;
    this.db = null;
    this.versions = new Map();
    this.queue = Promise.resolve();
    this.lastRebuild = null;
  }
  async open() {
    if (this.db) return;
    const file = path.join(this.store.root, ".pencils", "index.sqlite");
    await this.store.safe(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    await fs.chmod(file, 0o600);
    this.db.exec(
      `PRAGMA journal_mode=DELETE; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE IF NOT EXISTS tasks(project TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,status TEXT,due TEXT,record TEXT NOT NULL,PRIMARY KEY(project,id));CREATE INDEX IF NOT EXISTS task_status ON tasks(project,status);CREATE INDEX IF NOT EXISTS task_due ON tasks(project,due);CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(project UNINDEXED,id UNINDEXED,content);`,
    );
    this.db
      .prepare("INSERT OR REPLACE INTO metadata VALUES (?,?)")
      .run("schema", "1");
  }
  async ensure(project, force = false) {
    const work = this.queue.then(async () => {
      await this.open();
      if (!force && this.versions.get(project) === this.store.version) return;
      const version = this.store.version,
        snapshot = await this.store.snapshot(project),
        started = performance.now();
      this.db.exec("BEGIN");
      try {
        this.db.prepare("DELETE FROM tasks WHERE project=?").run(project);
        this.db.prepare("DELETE FROM task_search WHERE project=?").run(project);
        const insert = this.db.prepare(
            "INSERT INTO tasks VALUES (?,?,?,?,?,?)",
          ),
          search = this.db.prepare("INSERT INTO task_search VALUES (?,?,?)");
        for (const t of snapshot.tasks) {
          insert.run(
            project,
            t.id,
            t.title,
            t.status,
            t.due || null,
            JSON.stringify(t),
          );
          search.run(
            project,
            t.id,
            [
              t.key,
              t.title,
              t.body,
              t.assignee,
              ...(t.tags || []),
              ...(t.aliases || []),
              t.source?.key,
            ]
              .filter(Boolean)
              .join(" "),
          );
        }
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
      this.versions.set(project, version);
      this.lastRebuild = {
        project,
        tasks: snapshot.tasks.length,
        duration_ms: Math.round(performance.now() - started),
        at: new Date().toISOString(),
      };
    });
    this.queue = work.catch(() => {});
    return work;
  }
  async search(project, text, limit = 60) {
    await this.ensure(project);
    const tokens =
      String(text || "")
        .match(/[\p{L}\p{N}_-]+/gu)
        ?.slice(0, 20) || [];
    const rows = tokens.length
      ? this.db
          .prepare(
            "SELECT t.record FROM task_search s JOIN tasks t ON s.project=t.project AND s.id=t.id WHERE task_search MATCH ? AND t.project=? ORDER BY rank LIMIT ?",
          )
          .all(tokens.map((t) => '"' + t + '"*').join(" AND "), project, limit)
      : this.db
          .prepare(
            "SELECT record FROM tasks WHERE project=? ORDER BY title LIMIT ?",
          )
          .all(project, limit);
    return rows.map((r) => JSON.parse(r.record));
  }
  async query(project, input, user) {
    await this.ensure(project);
    const tasks = this.db
        .prepare("SELECT record FROM tasks WHERE project=?")
        .all(project)
        .map((r) => JSON.parse(r.record)),
      p = (await this.store.read(this.store.file(project, "project"))).data,
      config = p.schema,
      prefs = tablePreferences(input.preferences || {}, config),
      result = tableResult(
        input.archived ? tasks : tasks.filter((t) => !t.archived),
        prefs,
        config,
        tasks,
        { me: user.username },
      ),
      offset = Math.max(0, Math.floor(Number(input.offset) || 0)),
      limit = Math.max(
        1,
        Math.min(200, Math.floor(Number(input.limit) || 100)),
      );
    return {
      tasks: result.tasks.slice(offset, offset + limit),
      total: result.tasks.length,
      offset,
      limit,
      version: this.store.version,
    };
  }
  async rebuild() {
    for (const p of (await this.store.list()).projects)
      await this.ensure(p.id, true);
    return { projects: this.versions.size, last: this.lastRebuild };
  }
  close() {
    this.db?.close();
    this.db = null;
    this.versions.clear();
  }
}
