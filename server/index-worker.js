import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { chmodSync } from "node:fs";
import { tablePreferences, tableResult } from "../public/table-model.js";
import { parseSearch, searchMatch, editDistance, rankResults, cardEntry } from "./search-query.js";

// Disposable index: Markdown is authoritative. SQLite/filtering run off the HTTP thread.
const db = new DatabaseSync(workerData.file);
chmodSync(workerData.file, 0o600);
db.exec(`PRAGMA journal_mode=DELETE;
  CREATE TABLE IF NOT EXISTS tasks(project TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,status TEXT,due TEXT,record TEXT NOT NULL,PRIMARY KEY(project,id));
  CREATE INDEX IF NOT EXISTS task_status ON tasks(project,status);
  CREATE INDEX IF NOT EXISTS task_due ON tasks(project,due);
  DROP TABLE IF EXISTS task_search;
  CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(kind UNINDEXED,project UNINDEXED,id UNINDEXED,info UNINDEXED,title,headings,tags,body,tokenize="unicode61 remove_diacritics 2",prefix="2 3");
  CREATE VIRTUAL TABLE IF NOT EXISTS search_terms USING fts5vocab(search,row);`);
const remove = db.prepare("DELETE FROM tasks WHERE project=? AND id=?");
const insert = db.prepare("INSERT OR REPLACE INTO tasks VALUES (?,?,?,?,?,?)");
// One search table for cards, documents and board text (search-query.js builds the entries).
const removeEntry = db.prepare("DELETE FROM search WHERE project=? AND kind=? AND id=?");
const insertEntry = db.prepare("INSERT INTO search(kind,project,id,info,title,headings,tags,body) VALUES (?,?,?,?,?,?,?,?)");
const clean = (text) => String(text || "").replace(/[\u0000-\u0008]/g, " ");
function indexEntry(kind, project, entry) {
  removeEntry.run(project, kind, entry.id);
  insertEntry.run(kind, project, entry.id, JSON.stringify(entry.info), clean(entry.title), clean(entry.headings), clean(entry.tags), clean(entry.body));
}
const fold = (text) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
// Indexed terms near a word that matched nothing (one edit away, two for longer words), nearest
// and commonest first. The index spans every project, so callers check each against their own.
function nearby(word) {
  const target = fold(word), max = target.length > 5 ? 2 : 1, found = [];
  for (const { term, doc } of db.prepare("SELECT term, doc FROM search_terms WHERE length(term) BETWEEN ? AND ?").all(target.length - max, target.length + max)) {
    const distance = editDistance(target, term, max);
    if (distance && distance <= max) found.push({ term, doc, distance });
  }
  return found.sort((a, b) => a.distance - b.distance || b.doc - a.doc).map((c) => c.term);
}
parentPort.on("message", ({ id, action, data }) => {
  try {
    let result;
    if (action === "update") {
      const { project, full, tasks, deleted } = data;
      db.exec("BEGIN");
      try {
        if (full) {
          db.prepare("DELETE FROM tasks WHERE project=?").run(project);
          db.prepare("DELETE FROM search WHERE project=? AND kind='card'").run(project);
        }
        for (const key of deleted) {
          remove.run(project, key);
          removeEntry.run(project, "card", key);
        }
        for (const t of tasks) {
          insert.run(
            project,
            t.id,
            t.title,
            t.status,
            t.due || null,
            JSON.stringify(t),
          );
          indexEntry("card", project, cardEntry(t));
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      result = { updated: tasks.length, deleted: deleted.length, full };
    } else if (action === "content") {
      // Documents and board text: { project, full, entries: [{ kind, ...entry }], deleted: [[kind, id]] }.
      const { project, full, entries, deleted } = data;
      db.exec("BEGIN");
      try {
        if (full) db.prepare("DELETE FROM search WHERE project=? AND kind IN ('doc','board')").run(project);
        for (const [kind, key] of deleted) removeEntry.run(project, kind, key);
        for (const { kind, ...entry } of entries) indexEntry(kind, project, entry);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      result = { updated: entries.length, deleted: deleted.length, full };
    } else if (action === "search") {
      // One ranked list across the given projects: bm25 weights title 10, headings 5, tags 3,
      // body 1, then rankResults' title and recency boosts.
      const { projects, text, limit, now } = data;
      const parsed = parseSearch(text);
      const kinds = JSON.stringify(parsed.kinds ? [...parsed.kinds] : ["card", "doc", "board"]);
      const find = (match) => match && projects.length ? db.prepare(
        "SELECT kind, project, id, info, snippet(search, 7, char(2), char(3), '…', 12) AS excerpt, bm25(search, 0, 0, 0, 0, 10, 5, 3, 1) AS score FROM search WHERE search MATCH ? AND project IN (SELECT value FROM json_each(?)) AND kind IN (SELECT value FROM json_each(?)) ORDER BY score LIMIT ?",
      ).all(match, JSON.stringify(projects), kinds, limit * 3) : [];
      const rows = find(searchMatch(parsed));
      let suggestion = null;
      // "Did you mean": each word that finds nothing here becomes the nearest term these projects
      // hold exactly, offered only when the corrected query finds something.
      if (!rows.length && parsed.words.length) {
        const holds = (term) => find(`"${term}"`).length > 0;
        const fixed = parsed.words.map((word) => (find(`"${word}"*`).length ? null : nearby(word).slice(0, 10).find(holds) || null));
        const words = parsed.words.map((word, i) => fixed[i] || word);
        if (fixed.some(Boolean) && find(searchMatch({ ...parsed, words })).length)
          suggestion = parsed.words.reduce((query, word, i) => fixed[i] ? query.replace(new RegExp(`(?<![\\p{L}\\p{N}#"-])${word}(?![\\p{L}\\p{N}])`, "u"), () => fixed[i]) : query, String(text));
      }
      result = {
        results: rankResults(rows.map(({ info, ...row }) => ({ ...JSON.parse(info), ...row })), parsed, now).slice(0, limit).map(({ score, ...row }) => row),
        suggestion,
      };
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
