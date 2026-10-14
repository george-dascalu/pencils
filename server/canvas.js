import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Problem } from "./problem.js";
import {
  decodeCanvas,
  encodeCanvas,
  markdownSlice,
} from "../public/canvas-format.js";
import { merge } from "../public/sync.js";
const hash = (text) => createHash("sha256").update(text).digest("hex");
// Canvas metadata can change key order when encoded and read back. Compare
// JSON values rather than insertion order, while preserving array ordering.
const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
const equal = (a, b) => canonical(a) === canonical(b);
const editable = (b) =>
  Object.fromEntries(
    [
      "title",
      "nodes",
      "edges",
      "archived",
      "templates",
      "presentation",
      "settings",
      "layers",
    ]
      .filter((k) => b[k] !== undefined)
      .map((k) => [k, b[k]]),
  );
// A compact, reversible change set. Field-level guards let undo coexist with other writers.
export function difference(before, after) {
  const changes = [];
  for (const kind of ["nodes", "edges"]) {
    const a = new Map((before[kind] || []).map((v) => [v.id, v])),
      b = new Map((after[kind] || []).map((v) => [v.id, v]));
    if (
      a.size === b.size &&
      [...a.keys()].every((id) => b.has(id)) &&
      !equal([...a.keys()], [...b.keys()])
    )
      changes.push({
        kind: "order",
        collection: kind,
        before: [...a.keys()],
        after: [...b.keys()],
      });
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const old = a.get(id),
        next = b.get(id);
      if (!old || !next) {
        if (!equal(old, next))
          changes.push({ kind, id, before: old ?? null, after: next ?? null });
      } else
        for (const key of new Set([...Object.keys(old), ...Object.keys(next)]))
          if (key !== "native" && !equal(old[key], next[key]))
            changes.push({
              kind,
              id,
              key,
              before: old[key] ?? null,
              after: next[key] ?? null,
            });
    }
  }
  for (const key of [
    "title",
    "archived",
    "templates",
    "presentation",
    "settings",
    "layers",
  ])
    if (!equal(before[key], after[key]))
      changes.push({
        key,
        before: before[key] ?? null,
        after: after[key] ?? null,
      });
  return changes;
}
function inverse(current, changes) {
  const data = structuredClone(current);
  for (const c of changes) {
    if (c.kind === "order") {
      const ids = new Set(c.after),
        order = data[c.collection].map((n) => n.id).filter((id) => ids.has(id));
      if (!equal(order, c.after))
        throw new Problem(409, "Object ordering changed after this operation.");
      const map = new Map(data[c.collection].map((n) => [n.id, n]));
      let i = 0;
      data[c.collection] = data[c.collection].map((n) =>
        ids.has(n.id) ? map.get(c.before[i++]) : n,
      );
    } else if (c.kind) {
      const node = data[c.kind].find((n) => n.id === c.id);
      const value = c.key ? node?.[c.key] : node;
      if (!equal(value ?? null, c.after))
        throw new Problem(
          409,
          "A value touched by this operation has changed. Undo would overwrite someone else’s work.",
        );
      if (c.key) {
        if (c.before === null) delete node[c.key];
        else node[c.key] = c.before;
      } else {
        data[c.kind] = data[c.kind].filter((n) => n.id !== c.id);
        if (c.before) data[c.kind].push(c.before);
      }
    } else {
      if (!equal(data[c.key] ?? null, c.after))
        throw new Problem(
          409,
          "This board setting has changed since the operation.",
        );
      if (c.before === null && c.key === "settings") data.settings = {};
      else if (c.before === null) delete data[c.key];
      else data[c.key] = c.before;
    }
  }
  return data;
}
function describe(changes) {
  const count = new Set(changes.filter((c) => c.id).map((c) => c.id)).size;
  const noun = count === 1 ? "object" : "objects";
  if (changes.every((c) => ["x", "y"].includes(c.key)))
    return `Moved ${count} ${noun}`;
  if (changes.some((c) => c.key === "comments"))
    return "Updated object comments";
  if (changes.some((c) => c.key === "text"))
    return `Edited text on ${count} ${noun}`;
  if (changes.some((c) => c.key === "collapsed"))
    return "Changed frame visibility";
  if (changes.some((c) => c.kind === "order")) return "Changed object layers";
  if (changes.some((c) => c.key === "presentation"))
    return "Changed presentation order";
  if (changes.some((c) => c.key === "templates"))
    return "Updated reusable templates";
  if (changes.some((c) => c.key === "settings"))
    return "Updated board settings";
  if (changes.every((c) => c.before === null)) return `Added ${count} ${noun}`;
  if (changes.every((c) => c.after === null)) return `Removed ${count} ${noun}`;
  return count ? `Updated ${count} ${noun}` : "Updated board settings";
}
export function installCanvas(Store) {
  const originalCreate = Store.prototype.createBoard;
  Object.assign(Store.prototype, {
    async migrateBoards(project) {
      const dir = path.join(this.projectDir(project), "boards");
      await this.safe(dir);
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        if (e.code === "ENOENT") return;
        throw e;
      }
      this.canvasFiles ||= new Map();
      for (const entry of entries.filter(
        (e) => e.isFile() && e.name.endsWith(".md"),
      )) {
        const legacy = path.join(dir, entry.name),
          target = legacy.slice(0, -3) + ".canvas";
        try {
          const old = await this.read(legacy);
          if (old.data.kind !== "board" || old.data.project !== project)
            continue;
          this.validateBoard(old.data);
          try {
            await fs.access(target);
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
            await this.write(target, old.data, old.body);
          }
          // Retain the exact legacy source, even when resuming after an interrupted migration.
          await this.recordHistory(legacy, old);
          const archive = path.join(
            this.root,
            ".pencils",
            "legacy-boards",
            project,
            entry.name,
          );
          await this.safe(archive);
          await fs.mkdir(path.dirname(archive), { recursive: true });
          try {
            await fs.copyFile(legacy, archive, fs.constants.COPYFILE_EXCL);
          } catch (e) {
            if (e.code !== "EEXIST") throw e;
          }
          await fs.unlink(legacy);
        } catch (error) {
          if (!error.status)
            throw error; /* Malformed legacy files remain available for repair. */
        }
      }
      for (const name of await fs.readdir(dir))
        if (name.endsWith(".canvas")) {
          const file = path.join(dir, name);
          try {
            const record = await this.read(file);
            this.canvasFiles.set(`${project}/${record.data.id}`, file);
          } catch {
            /* Report in snapshot. */
          }
        }
    },
    async createBoard(project, input) {
      if (!input.canvas) return originalCreate.call(this, project, input);
      const id = `b-${randomUUID().slice(0, 8)}`;
      let data;
      try {
        data = decodeCanvas(input.canvas, {
          id,
          project,
          title: input.title || "Imported canvas",
        });
      } catch (e) {
        throw new Problem(400, e.message);
      }
      data.id = id;
      data.project = project;
      data.title = input.title || data.title;
      data.operations = [];
      data.created = new Date().toISOString();
      data.updated = data.created;
      this.validateBoard(data);
      return this.write(this.file(project, "boards", id), data, "");
    },
    async updateBoard(project, id, input, actor = "Shared workspace") {
      const file = this.file(project, "boards", id),
        current = await this.read(file);
      const operationId =
        typeof input.operationId === "string" &&
        /^[\w-]{1,100}$/.test(input.operationId)
          ? input.operationId
          : randomUUID();
      if (current.data.operations?.some((o) => o.id === operationId))
        return this.public(current, file);
      let data = { ...current.data, ...editable(input) };
      if (input.base) {
        if (!input.revision || input.base.revision !== input.revision)
          throw new Problem(428, "A matching base revision is required.");
        const result = merge(
          editable(input.base),
          editable(data),
          editable(current.data),
        );
        if (result.conflicts.length)
          throw new Problem(
            409,
            `Conflicting board edits: ${result.conflicts
              .slice(0, 3)
              .map((c) => c.path)
              .join(", ")}. Your draft is retained.`,
          );
        data = { ...current.data, ...result.value };
      } else this.checkRevision(current, input.revision);
      this.validateBoard(data);
      if (
        data.templates &&
        (!Array.isArray(data.templates) ||
          data.templates.length > 30 ||
          data.templates.some(
            (t) =>
              !t.id ||
              typeof t.name !== "string" ||
              t.name.length > 100 ||
              !Array.isArray(t.nodes) ||
              t.nodes.length > 500 ||
              !Array.isArray(t.edges),
          ))
      )
        throw new Problem(400, "Invalid board templates.");
      if (
        data.presentation &&
        (!Array.isArray(data.presentation) ||
          data.presentation.length > 500 ||
          data.presentation.some(
            (id) => !data.nodes.some((n) => n.id === id && n.type === "frame"),
          ))
      )
        throw new Problem(400, "Presentation must contain frame IDs.");
      // Log the exact persisted node representation, including integer geometry
      // and generated Markdown fallbacks, so a read/write round trip is undoable.
      data.nodes = decodeCanvas(encodeCanvas(data)).nodes;
      const changes = difference(current.data, data);
      if (!changes.length) return this.public(current, file);
      const operation = {
        id: operationId,
        client: String(input.client || "").slice(0, 100),
        ...(input.undoOf ? { undoOf: input.undoOf } : {}),
        actor: String(actor).slice(0, 100),
        time: new Date().toISOString(),
        changes,
        summary: input.summary
          ? String(input.summary).slice(0, 100)
          : describe(changes),
      };
      // The log and the content commit in the same atomic rename. Older entries remain in file history.
      data.operations = [...(current.data.operations || []), operation].slice(
        -200,
      );
      while (
        data.operations.length > 1 &&
        JSON.stringify(data.operations).length > 2000000
      )
        data.operations.shift();
      data.updated = operation.time;
      return this.write(file, data, current.body, current);
    },
    async undoBoard(project, id, input, actor) {
      const file = this.file(project, "boards", id),
        current = await this.read(file);
      const operation = current.data.operations?.find(
        (o) => o.id === input.operation,
      );
      if (!operation)
        throw new Problem(
          404,
          "Operation is no longer in the recent log. Older versions are available in file history.",
        );
      const data = inverse(current.data, operation.changes);
      return this.updateBoard(
        project,
        id,
        {
          ...editable(data),
          revision: current.revision,
          operationId: input.operationId,
          client: input.client,
          undoOf: operation.id,
          summary: `Undo: ${operation.summary}`,
        },
        actor,
      );
    },
    async boardDependency(project, id, input) {
      const board = await this.read(this.file(project, "boards", id)),
        edge = board.data.edges.find((e) => e.id === input.edge);
      if (!edge || edge.relationship !== "blocks")
        throw new Problem(400, "Choose a blocks connector first.");
      const from = board.data.nodes.find((n) => n.id === edge.from),
        to = board.data.nodes.find((n) => n.id === edge.to);
      if (from?.type !== "task" || to?.type !== "task")
        throw new Problem(400, "A dependency requires two task cards.");
      const file = this.file(project, "tasks", to.task),
        target = await this.read(file);
      if (target.data.dependencies?.includes(from.task))
        return this.public(target, file);
      return this.updateTask(project, to.task, {
        revision: target.revision,
        dependencies: [...(target.data.dependencies || []), from.task],
      });
    },
    async canvasNote(project, relative) {
      if (
        typeof relative !== "string" ||
        !relative.startsWith(`Projects/${project}/`) ||
        !relative.endsWith(".md")
      )
        throw new Problem(400, "Choose a Markdown file inside this project.");
      const file = this.resolveFile(relative);
      await this.safe(file);
      let raw;
      try {
        raw = await fs.readFile(file, "utf8");
      } catch (e) {
        if (e.code === "ENOENT")
          throw new Problem(404, "This note no longer exists.");
        throw e;
      }
      if (raw.length > 2000000)
        throw new Problem(413, "This note is too large to edit on the canvas.");
      const front = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(raw)?.[0] || "";
      return {
        file: relative,
        body: raw.slice(front.length),
        revision: hash(raw),
        title: path.basename(file, ".md"),
      };
    },
    async editCanvasNote(project, input) {
      const note = await this.canvasNote(project, input.file);
      this.checkRevision(note, input.revision);
      if (typeof input.body !== "string" || input.body.length > 200000)
        throw new Problem(
          400,
          "Note content must be text up to 200,000 characters.",
        );
      const section = markdownSlice(note.body, input.subpath || "");
      if (!section)
        throw new Problem(409, "This heading or block no longer exists.");
      const body =
        note.body.slice(0, section.start) +
        input.body +
        note.body.slice(section.end);
      const taskMatch = new RegExp(
        `^Projects/${project}/tasks/([\\w-]+)\\.md$`,
      ).exec(input.file);
      if (taskMatch)
        return this.updateTask(project, taskMatch[1], {
          revision: input.revision,
          body,
        });
      const file = this.resolveFile(input.file),
        raw = await fs.readFile(file, "utf8"),
        temporary = `${file}.${randomUUID()}.tmp`;
      try {
        const handle = await fs.open(temporary, "wx");
        try {
          await handle.writeFile(
            raw.slice(0, raw.length - note.body.length) + body,
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (hash(await fs.readFile(file, "utf8")) !== note.revision)
          throw new Problem(
            409,
            "This note changed in Obsidian. Your draft is retained.",
          );
        await this.recordHistory(file, { revision: note.revision, raw });
        await fs.rename(temporary, file);
        this.cache.delete(file);
        this.changed();
      } finally {
        await fs.rm(temporary, { force: true });
      }
      return this.canvasNote(project, input.file);
    },
    async canvasBacklinks(project, relative) {
      const target = await this.canvasNote(project, relative),
        names = new Set([
          relative,
          relative.replace(/\.md$/, ""),
          path.posix.basename(relative),
          path.posix.basename(relative, ".md"),
        ]);
      try {
        const record = await this.read(this.resolveFile(relative));
        if (record.data.title) names.add(record.data.title);
        for (const alias of record.data.aliases || []) names.add(alias);
      } catch {}
      const results = [];
      for (const file of await this.canvasNotes(project)) {
        if (file === relative) continue;
        const note = await this.canvasNote(project, file);
        const refs = [...note.body.matchAll(/!?\[\[([^\]\n]+)\]\]/g)].map(
          (m) => m[1].split("|")[0].split("#")[0],
        );
        for (const m of note.body.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
          try {
            refs.push(
              path.posix.normalize(
                path.posix.join(
                  path.posix.dirname(file),
                  decodeURIComponent(m[1].split("#")[0]),
                ),
              ),
            );
          } catch {}
        }
        if (refs.some((ref) => names.has(ref))) {
          let title = note.title,
            id = null;
          try {
            const r = await this.read(this.resolveFile(file));
            title = r.data.title || title;
            if (r.data.kind === "task") id = r.data.id;
          } catch {}
          results.push({ file, title, id });
        }
      }
      return results;
    },
    async canvasNotes(project) {
      const result = [];
      const walk = async (dir) => {
        await this.safe(dir);
        for (const e of await fs.readdir(dir, { withFileTypes: true })) {
          if (e.name.startsWith(".") || e.isSymbolicLink()) continue;
          const f = path.join(dir, e.name);
          if (e.isDirectory()) await walk(f);
          else if (e.name.endsWith(".md"))
            result.push(path.relative(this.root, f).split(path.sep).join("/"));
        }
      };
      await walk(this.projectDir(project));
      return result;
    },
  });
}
