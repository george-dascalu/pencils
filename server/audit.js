// Each project's audit log (owner request T93, 1 November 2026): who created, changed, deleted or
// restored which card, document or board, kept for 365 days. One JSON line per change in
// .audit/<project>.jsonl. One person's saves of one item within ten minutes of the first merge into
// one entry, so autosave doesn't flood the log.
import fs from "node:fs/promises";
import path from "node:path";

export const AUDIT_DAYS = 365;
const DAY = 86_400_000,
  MERGE = 10 * 60_000;
// Fields a save can't change, or that change with every board save.
const SKIP = new Set(["id", "kind", "project", "created", "updated", "revision", "file", "number", "key", "version", "assignee_id", "nodes", "edges", "native", "operations"]);

// The fields a save changed: a card's or document's fields and text, a board's name and folder.
export function changedFields(before, after) {
  if (!before || !after) return [];
  const old = { ...before.data, body: before.body };
  return Object.keys(after)
    .filter((k) => !SKIP.has(k) && !(after.kind === "board" && k === "body"))
    .filter((k) => JSON.stringify(old[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .sort();
}

export class AuditLog {
  constructor(store) {
    this.store = store;
    this.dir = path.join(store.root, ".audit");
    this.last = new Map();
    this.queue = Promise.resolve();
  }
  async file(project) {
    if (!/^[\w-]+$/.test(project)) throw new Error("Invalid project.");
    const file = path.join(this.dir, `${project}.jsonl`);
    await this.store.safe(file);
    return file;
  }
  // Writes run one at a time, so a merge rewrites only the line this log appended last.
  record(project, entry) {
    this.queue = this.queue
      .then(() => this.write(project, entry))
      .catch((error) => console.error(`Audit log: ${error.message}`));
    return this.queue;
  }
  async write(project, entry) {
    const file = await this.file(project),
      last = this.last.get(project),
      key = [entry.user, entry.kind, entry.id, entry.action].join("\n");
    await fs.mkdir(this.dir, { recursive: true });
    const size = (await fs.stat(file).catch(() => ({ size: 0 }))).size;
    let offset = size,
      next = entry;
    const since = last?.entry.since ?? last?.entry.at;
    if (entry.action === "edited" && last?.key === key && last.size === size && entry.at - since < MERGE) {
      offset = last.offset;
      next = { ...last.entry, since, at: entry.at, title: entry.title, fields: [...new Set([...last.entry.fields, ...entry.fields])].sort() };
      await fs.truncate(file, offset);
    }
    const line = JSON.stringify(next) + "\n";
    await fs.appendFile(file, line);
    this.last.set(project, { key, offset, size: offset + Buffer.byteLength(line), entry: next });
  }
  // Newest first, within the last 365 days, before the given time.
  async list(project, { before = Infinity, limit = 200 } = {}, now = Date.now()) {
    let text;
    try {
      text = await fs.readFile(await this.file(project), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const since = now - AUDIT_DAYS * DAY,
      entries = [];
    for (const line of text.split("\n")) {
      try {
        const entry = JSON.parse(line);
        if (entry.at >= since && entry.at < before) entries.push(entry);
      } catch {
        /* A blank or damaged line is skipped. */
      }
    }
    return entries.reverse().slice(0, limit);
  }
  // Drops entries older than 365 days from every project's log.
  purge(now = Date.now()) {
    this.queue = this.queue
      .then(async () => {
        let names;
        try {
          names = (await fs.readdir(this.dir)).filter((name) => name.endsWith(".jsonl"));
        } catch {
          return;
        }
        for (const name of names) {
          const project = name.slice(0, -".jsonl".length);
          if (!/^[\w-]+$/.test(project)) continue;
          const file = await this.file(project),
            lines = (await fs.readFile(file, "utf8")).split("\n").filter(Boolean);
          const kept = lines.filter((line) => {
            try {
              return JSON.parse(line).at >= now - AUDIT_DAYS * DAY;
            } catch {
              return false;
            }
          });
          if (kept.length === lines.length) continue;
          // Through a temporary file, so a crash can't leave half a log.
          await fs.writeFile(`${file}.tmp`, kept.map((line) => line + "\n").join(""));
          await fs.rename(`${file}.tmp`, file);
          this.last.delete(project);
        }
      })
      .catch((error) => console.error(`Audit log: ${error.message}`));
    return this.queue;
  }
}
