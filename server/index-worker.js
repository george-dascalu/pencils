import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { tablePreferences, tableResult } from "../public/table-model.js";

// Disposable index: Markdown is authoritative. SQLite/filtering run off the HTTP thread.
const db = new DatabaseSync(workerData.file);
chmodSync(workerData.file, 0o600);
db.exec(`PRAGMA journal_mode=DELETE;
  CREATE TABLE IF NOT EXISTS tasks(project TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,status TEXT,due TEXT,record TEXT NOT NULL,PRIMARY KEY(project,id));
  CREATE INDEX IF NOT EXISTS task_status ON tasks(project,status);
  CREATE INDEX IF NOT EXISTS task_due ON tasks(project,due);
  CREATE VIRTUAL TABLE IF NOT EXISTS task_search USING fts5(project UNINDEXED,id UNINDEXED,content);`);
const remove = db.prepare("DELETE FROM tasks WHERE project=? AND id=?");
const removeSearch = db.prepare(
  "DELETE FROM task_search WHERE project=? AND id=?",
);
const insert = db.prepare("INSERT OR REPLACE INTO tasks VALUES (?,?,?,?,?,?)");
const insertSearch = db.prepare("INSERT INTO task_search VALUES (?,?,?)");
parentPort.on("message", ({ id, action, data }) => {
  try {
    let result;
    if (action === "update") {
      const { project, full, tasks, deleted } = data;
      db.exec("BEGIN");
      try {
        if (full) {
          db.prepare("DELETE FROM tasks WHERE project=?").run(project);
          db.prepare("DELETE FROM task_search WHERE project=?").run(project);
        }
        for (const key of deleted) {
          remove.run(project, key);
          removeSearch.run(project, key);
        }
        for (const t of tasks) {
          removeSearch.run(project, t.id);
          insert.run(
            project,
            t.id,
            t.title,
            t.status,
            t.due || null,
            JSON.stringify(t),
          );
          insertSearch.run(
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
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      result = { updated: tasks.length, deleted: deleted.length, full };
    } else if (action === "search") {
      const { project, text, limit } = data;
      const tokens =
        String(text || "")
          .match(/[\p{L}\p{N}_-]+/gu)
          ?.slice(0, 20) || [];
      const rows = tokens.length
        ? db
            .prepare(
              "SELECT t.record FROM task_search s JOIN tasks t ON s.project=t.project AND s.id=t.id WHERE task_search MATCH ? AND t.project=? ORDER BY rank LIMIT ?",
            )
            .all(
              tokens.map((t) => '"' + t + '"*').join(" AND "),
              project,
              limit,
            )
        : db
            .prepare(
              "SELECT record FROM tasks WHERE project=? ORDER BY title LIMIT ?",
            )
            .all(project, limit);
      result = rows.map((r) => JSON.parse(r.record));
    } else if (action === "query") {
      const { project, input, config, username } = data;
      const tasks = db
        .prepare("SELECT record FROM tasks WHERE project=?")
        .all(project)
        .map((r) => JSON.parse(r.record));
      const prefs = tablePreferences(input.preferences || {}, config);
      const rows = tableResult(
        input.archived ? tasks : tasks.filter((t) => !t.archived),
        prefs,
        config,
        tasks,
        { me: username },
      );
      const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
      const limit = Math.max(
        1,
        Math.min(200, Math.floor(Number(input.limit) || 100)),
      );
      result = {
        tasks: rows.tasks.slice(offset, offset + limit),
        total: rows.tasks.length,
        offset,
        limit,
      };
    } else throw new Error("Unknown index operation.");
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
parentPort.postMessage({ ready: true });
