import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import YAML from "yaml";
import { EventEmitter } from "node:events";
import { watch } from "node:fs";
import { Problem } from "./problem.js";
import {
  schema,
  validateExtras,
  validateViews,
  progress,
  nextDate,
} from "./model.js";
import { installRecovery } from "./recovery.js";
import { decodeCanvas, encodeCanvas } from "../public/canvas-format.js";
import { installCanvas } from "./canvas.js";
import { installWorkspace } from "./workspace.js";
export { Problem } from "./problem.js";

export const STATUSES = ["backlog", "todo", "in-progress", "review", "done"];
export const TYPES = ["epic", "milestone", "story", "task", "bug"];
export const PRIORITIES = ["none", "low", "medium", "high", "urgent"];
export const DEFAULT_ORGANISATION = "o-default";
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
const now = () => new Date().toISOString();
const hash = (text) => createHash("sha256").update(text).digest("hex");
function validId(id) {
  if (typeof id !== "string" || !idPattern.test(id))
    throw new Problem(400, "Invalid identifier.");
  return id;
}
function title(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 300)
    throw new Problem(400, "A title between 1 and 300 characters is required.");
  return value.trim();
}
function body(value) {
  if (typeof value !== "string" || value.length > 200_000)
    throw new Problem(
      400,
      "Description must be text, up to 200,000 characters.",
    );
  return value;
}
function choice(value, choices, label) {
  if (!choices.includes(value)) throw new Problem(400, `Invalid ${label}.`);
  return value;
}
function date(value) {
  if (value === "" || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Problem(400, "Use a valid YYYY-MM-DD date.");
  return value;
}
function tags(value) {
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((t) => typeof t !== "string" || t.length > 80)
  )
    throw new Problem(400, "Tags must be a list of short strings.");
  return [...new Set(value.map((t) => t.trim()).filter(Boolean))];
}
function color(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value))
    throw new Problem(400, "Use a six-digit hex color.");
  return value;
}
function parse(text, file) {
  if (file.endsWith(".canvas") || /^\s*\{/.test(text)) {
    try {
      const source = JSON.parse(text),
        parts = file.split(path.sep),
        index = parts.lastIndexOf("Projects");
      const name = path.basename(file, ".canvas");
      const defaults =
        index >= 0
          ? {
              project: parts[index + 1],
              id: idPattern.test(name) ? name : `b-${hash(name).slice(0, 16)}`,
              title: name,
            }
          : {};
      const data = decodeCanvas(source, defaults);
      return {
        data,
        canvas: true,
        body: source.pencils?.body || "",
        revision: hash(text),
        raw: text,
      };
    } catch (error) {
      throw new Problem(
        422,
        `Invalid canvas in ${path.basename(file)}: ${error.message}`,
      );
    }
  }
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    if (text.startsWith("---"))
      throw new Problem(
        422,
        `Invalid YAML frontmatter in ${path.basename(file)}.`,
      );
    const parts = file.split(path.sep),
      index = parts.lastIndexOf("Projects");
    return {
      data: {
        id: path.basename(file, ".md"),
        kind: "note",
        project: index >= 0 ? parts[index + 1] : undefined,
        title: path.basename(file, ".md"),
      },
      plain: true,
      body: text,
      raw: text,
      revision: hash(text),
    };
  }
  const doc = YAML.parseDocument(match[1]);
  if (doc.errors.length)
    throw new Problem(
      422,
      `Invalid YAML in ${path.basename(file)}: ${doc.errors[0].message}`,
    );
  const data = doc.toJS({ maxAliasCount: 50 });
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Problem(422, "Frontmatter must be a YAML mapping.");
  return { data, doc, body: match[2], revision: hash(text), raw: text };
}

export class Store {
  constructor(root) {
    this.root = path.resolve(root);
    this.queue = Promise.resolve();
    this.initialising = null;
    this.cache = new Map();
    this.events = new EventEmitter();
    this.events.setMaxListeners(0);
    this.version = 0;
  }
  async init() {
    // A single, restart-safe migration. Project paths, task IDs and canvas links stay stable.
    if (!this.initialising)
      this.initialising = this.initialise().catch((error) => {
        this.initialising = null;
        throw error;
      });
    return this.initialising;
  }
  async initialise() {
    await fs.mkdir(this.root, { recursive: true });
    for (const name of ["Projects", "Organisations"]) {
      const dir = path.join(this.root, name);
      await this.safe(dir);
      await fs.mkdir(dir, { recursive: true });
    }
    const defaultFile = this.organisationFile(DEFAULT_ORGANISATION);
    await this.safe(defaultFile);
    try {
      await fs.access(defaultFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.write(
        defaultFile,
        {
          id: DEFAULT_ORGANISATION,
          kind: "organisation",
          title: "Our organisation",
          color: "#66856f",
          created: now(),
          updated: now(),
        },
        "A shared space for our projects.\n",
      );
    }
    const entries = await fs.readdir(path.join(this.root, "Projects"), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let file, record;
      try {
        file = this.file(entry.name, "project");
        record = await this.read(file);
        if (record.data.id !== entry.name) continue;
      } catch {
        continue;
      } // Unreadable notes remain untouched and are reported by list().
      if (!Object.hasOwn(record.data, "organisation")) {
        await this.write(
          file,
          { ...record.data, organisation: DEFAULT_ORGANISATION },
          record.body,
          record,
        );
      }
      await this.migrateBoards(entry.name);
    }
  }
  // Serialize app writers; file revisions also detect edits from Obsidian/other clients.
  mutate(fn) {
    const next = this.queue.then(async () => {
      await this.autoBackup();
      return fn();
    });
    this.queue = next.catch(() => {});
    return next;
  }
  changed() {
    this.version++;
    this.events.emit("change", this.version);
  }
  watch() {
    if (this.watcher || this.watchFallback) return;
    const handles = [];
    const fallback = () => {
      for (const handle of handles) handle.close();
      this.watcher = null;
      if (!this.watchFallback) {
        this.watchFallback = setInterval(() => this.changed(), 5000);
        this.watchFallback.unref();
      }
    };
    const changed = (_, file) => {
      if (file?.endsWith(".tmp")) return;
      clearTimeout(this.watchTimer);
      this.watchTimer = setTimeout(() => this.changed(), 100);
      this.watchTimer.unref();
    };
    try {
      // Recovery/history files can outnumber live notes. Watch only public content.
      for (const name of ["Projects", "Organisations"]) {
        const handle = watch(
          path.join(this.root, name),
          { recursive: true },
          changed,
        );
        handle.on("error", fallback);
        handle.unref();
        handles.push(handle);
      }
      this.watcher = {
        close: () => handles.forEach((handle) => handle.close()),
        handles,
      };
    } catch {
      fallback();
    }
  }
  close() {
    this.watcher?.close();
    this.watcher = null;
    clearTimeout(this.watchTimer);
    clearInterval(this.watchFallback);
    this.watchFallback = null;
  }
  projectDir(id) {
    return path.join(this.root, "Projects", validId(id));
  }
  organisationFile(id) {
    return path.join(this.root, "Organisations", `${validId(id)}.md`);
  }
  file(project, kind, id) {
    const dir = this.projectDir(project);
    return kind === "project"
      ? path.join(dir, "project.md")
      : kind === "boards"
        ? this.canvasFiles?.get(`${project}/${id}`) ||
          path.join(dir, kind, `${validId(id)}.canvas`)
        : path.join(dir, kind, `${validId(id)}.md`);
  }
  async safe(file) {
    // Never follow a vault symlink outside the mounted vault.
    const root = await fs.realpath(this.root);
    const relative = path.relative(this.root, file);
    if (
      relative === ".." ||
      relative.startsWith(".." + path.sep) ||
      path.isAbsolute(relative)
    )
      throw new Problem(400, "Path is outside the vault.");
    let current = root;
    for (const part of relative.split(path.sep)) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Problem(
            400,
            "Symlinks are not supported inside project folders.",
          );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  async read(file) {
    await this.safe(file);
    try {
      const stat = await fs.stat(file, { bigint: true });
      const key = `${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}:${stat.ino}`;
      const cached = this.cache.get(file);
      if (cached?.key === key) return cached.record;
      const record = parse(await fs.readFile(file, "utf8"), file);
      this.cache.set(file, { key, record });
      if (this.cache.size > 20000)
        this.cache.delete(this.cache.keys().next().value);
      return record;
    } catch (error) {
      if (error.code === "ENOENT")
        throw new Problem(
          404,
          "This file no longer exists. Refresh the workspace.",
        );
      throw error;
    }
  }
  public(record, file) {
    return {
      ...record.data,
      body: record.body,
      revision: record.revision,
      file: path.relative(this.root, file).split(path.sep).join("/"),
    };
  }
  async write(file, data, markdown, existing) {
    await this.safe(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const doc = existing?.doc?.clone() ?? new YAML.Document();
    for (const [key, value] of Object.entries(
      file.endsWith(".canvas") ? {} : data,
    )) {
      if (
        !existing ||
        JSON.stringify(existing.data[key]) !== JSON.stringify(value)
      )
        doc.set(key, value);
    }
    const canvasDocument = file.endsWith(".canvas") ? encodeCanvas(data) : null;
    const text = canvasDocument
      ? JSON.stringify(
          {
            ...canvasDocument,
            pencils: { ...canvasDocument.pencils, body: markdown },
          },
          null,
          2,
        ) + "\n"
      : existing?.plain
        ? markdown
        : `---\n${doc.toString({ lineWidth: 0 })}---\n${markdown}`;
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, "wx");
      try {
        await handle.writeFile(text);
        await handle.sync();
      } finally {
        await handle.close();
      }
      if (existing) {
        const latest = await this.read(file);
        if (latest.revision !== existing.revision)
          throw new Problem(
            409,
            "This file changed in another window or in Obsidian. Refresh before saving again.",
          );
        await this.recordHistory(file, latest);
      } else {
        try {
          await fs.access(file);
          throw new Problem(409, "File already exists.");
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      await fs.rename(temporary, file);
      this.cache.delete(file);
      this.changed();
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return this.public(parse(text, file), file);
  }
  checkRevision(record, expected) {
    if (!expected)
      throw new Problem(
        428,
        "A file revision is required. Refresh and try again.",
      );
    if (record.revision !== expected)
      throw new Problem(
        409,
        "This file changed in another window or in Obsidian. Your changes have not been saved. Refresh before saving again.",
      );
  }
  async getOrganisation(id) {
    await this.init();
    const file = this.organisationFile(id),
      record = await this.read(file);
    if (record.data.id !== id || record.data.kind !== "organisation")
      throw new Problem(422, "Organisation ID and kind must match its file.");
    title(record.data.title);
    color(record.data.color);
    return this.public(record, file);
  }
  async listOrganisations() {
    await this.init();
    const dir = path.join(this.root, "Organisations");
    await this.safe(dir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const organisations = [],
      warnings = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      try {
        organisations.push(await this.getOrganisation(entry.name.slice(0, -3)));
      } catch (error) {
        warnings.push(`Organisations/${entry.name}: ${error.message}`);
      }
    }
    organisations.sort((a, b) => a.title.localeCompare(b.title));
    return { organisations, warnings };
  }
  async createOrganisation(input) {
    await this.init();
    const id = `o-${randomUUID().slice(0, 8)}`;
    return this.write(
      this.organisationFile(id),
      {
        id,
        kind: "organisation",
        title: title(input.title),
        color: color(input.color || "#66856f"),
        created: now(),
        updated: now(),
      },
      body(input.body ?? ""),
    );
  }
  async updateOrganisation(id, input) {
    await this.getOrganisation(id);
    const file = this.organisationFile(id),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    if ("title" in input) data.title = title(input.title);
    if ("color" in input) data.color = color(input.color);
    return this.write(
      file,
      data,
      "body" in input ? body(input.body) : current.body,
      current,
    );
  }
  async list(organisation = null) {
    await this.init();
    if (organisation !== null) await this.getOrganisation(organisation);
    const { organisations, warnings: organisationWarnings } =
      await this.listOrganisations();
    const organisationIds = new Set(organisations.map((o) => o.id));
    await this.safe(path.join(this.root, "Projects"));
    const entries = await fs.readdir(path.join(this.root, "Projects"), {
      withFileTypes: true,
    });
    const projects = [],
      warnings = [...organisationWarnings];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const file = this.file(entry.name, "project");
        const record = await this.read(file);
        if (record.data.id !== entry.name)
          throw new Problem(422, "Project ID must match its folder name.");
        if (!organisationIds.has(record.data.organisation))
          throw new Problem(
            422,
            "Project organisation is missing or invalid. Set its organisation property to an existing organisation ID.",
          );
        if (organisation === null || record.data.organisation === organisation)
          projects.push(this.public(record, file));
      } catch (error) {
        warnings.push(`${entry.name}: ${error.message}`);
      }
    }
    projects.sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return { projects, warnings };
  }
  async children(project, kind) {
    if (kind === "boards") await this.migrateBoards(project);
    const dir = path.join(this.projectDir(project), kind);
    await this.safe(dir);
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return { items: [], warnings: [] };
      throw error;
    }
    const items = [],
      warnings = [];
    const config =
      kind === "tasks"
        ? schema((await this.read(this.file(project, "project"))).data.schema)
        : null;
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith(kind === "boards" ? ".canvas" : ".md")
      )
        continue;
      try {
        const file = path.join(dir, entry.name),
          record = await this.read(file);
        if (kind !== "boards" && record.data.id !== entry.name.slice(0, -3))
          throw new Problem(422, "ID must match the filename.");
        if (record.data.project !== project)
          throw new Problem(422, "Project ID does not match the folder.");
        if (kind === "tasks") this.validateTask(record.data, config);
        if (kind === "boards") this.validateBoard(record.data);
        items.push(this.public(record, file));
      } catch (error) {
        warnings.push(`${kind}/${entry.name}: ${error.message}`);
      }
    }
    return { items, warnings };
  }
  async snapshot(id) {
    await this.init();
    const file = this.file(id, "project");
    const project = this.public(await this.read(file), file);
    await this.getOrganisation(project.organisation);
    const [tasks, boards] = await Promise.all([
      this.children(id, "tasks"),
      this.children(id, "boards"),
    ]);
    const warnings = [...tasks.warnings, ...boards.warnings];
    const byId = new Map(tasks.items.map((t) => [t.id, t]));
    for (const task of tasks.items) {
      const seen = new Set([task.id]);
      let parent = task.parent;
      while (parent) {
        if (seen.has(parent)) {
          warnings.push(
            `Hierarchy cycle involving ${task.title}. Edit its parent to repair it.`,
          );
          break;
        }
        if (!byId.has(parent)) {
          warnings.push(
            `Missing parent for ${task.title}. Edit its parent to repair it.`,
          );
          break;
        }
        seen.add(parent);
        parent = byId.get(parent).parent;
      }
    }
    return {
      project,
      tasks: tasks.items,
      boards: boards.items,
      warnings,
      progress: progress(tasks.items, schema(project.schema)),
    };
  }
  async createProject(input) {
    const organisation = await this.getOrganisation(
      input.organisation ?? DEFAULT_ORGANISATION,
    );
    const id = `p-${randomUUID().slice(0, 8)}`;
    const project = await this.write(
      this.file(id, "project"),
      {
        id,
        kind: "project",
        organisation: organisation.id,
        title: title(input.title),
        color: color(input.color || "#587563"),
        created: now(),
        updated: now(),
        default_view: "list",
        schema: schema(input.schema),
        views: [],
        templates: [],
      },
      body(input.body ?? ""),
    );
    await this.createBoard(id, { title: "Project canvas" });
    return project;
  }
  async updateProject(id, input) {
    const file = this.file(id, "project"),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    if ("title" in input) data.title = title(input.title);
    if ("color" in input) data.color = color(input.color);
    if ("default_view" in input)
      data.default_view = choice(
        input.default_view,
        [
          "overview",
          "list",
          "tree",
          "table",
          "kanban",
          "board",
          "calendar",
          "timeline",
        ],
        "view",
      );
    if ("organisation" in input)
      data.organisation = (await this.getOrganisation(input.organisation)).id;
    if ("archived" in input) {
      if (typeof input.archived !== "boolean")
        throw new Problem(400, "Archived must be true or false.");
      data.archived = input.archived;
    }
    if ("schema" in input) {
      data.schema = schema(input.schema);
      const { items, warnings } = await this.children(id, "tasks");
      if (warnings.length)
        throw new Problem(
          409,
          "Repair unreadable tasks before changing the workflow.",
        );
      for (const task of items) this.validateTask(task, data.schema);
    }
    if ("views" in input) data.views = validateViews(input.views);
    if ("templates" in input) {
      if (
        !Array.isArray(input.templates) ||
        input.templates.length > 100 ||
        input.templates.some(
          (t) =>
            typeof t.name !== "string" ||
            !t.name.trim() ||
            t.name.length > 100 ||
            !t.task ||
            JSON.stringify(t).length > 250000,
        )
      )
        throw new Problem(400, "Invalid task templates.");
      data.templates = input.templates;
    }
    return this.write(
      file,
      data,
      "body" in input ? body(input.body) : current.body,
      current,
    );
  }
  validateTask(data, config = schema()) {
    validId(data.id);
    title(data.title);
    choice(data.status, config.statuses, "status");
    choice(data.type, config.types, "type");
    validateExtras(data, config);
    choice(data.priority, PRIORITIES, "priority");
    date(data.due ?? null);
    tags(data.tags ?? []);
    if (data.parent) validId(data.parent);
    if (
      data.assignee != null &&
      (typeof data.assignee !== "string" || data.assignee.length > 100)
    )
      throw new Problem(400, "Assignee must be text, up to 100 characters.");
  }
  async validateParent(project, taskId, parent) {
    if (!parent) return;
    validId(parent);
    const { items } = await this.children(project, "tasks");
    const map = new Map(items.map((t) => [t.id, t]));
    const seen = new Set([taskId]);
    let current = parent;
    while (current) {
      if (seen.has(current))
        throw new Problem(400, "A task cannot be its own ancestor.");
      if (!map.has(current))
        throw new Problem(
          400,
          "The parent task does not exist in this project.",
        );
      seen.add(current);
      current = map.get(current).parent;
    }
  }
  async createTask(project, input, internal = {}) {
    if (input.canvas_source) {
      if (
        typeof input.canvas_source !== "string" ||
        !/^canvas:[\w-]+:[\w-]+$/.test(input.canvas_source) ||
        input.canvas_source.length > 200
      )
        throw new Problem(400, "Invalid canvas source.");
      const existing = (await this.children(project, "tasks")).items.find(
        (t) => t.canvas_source === input.canvas_source,
      );
      if (existing) return existing;
    }
    const config = schema(
      (await this.read(this.file(project, "project"))).data.schema,
    );
    const id = `t-${randomUUID().slice(0, 8)}`;
    const data = {
      id,
      kind: "task",
      ...(input.canvas_source ? { canvas_source: input.canvas_source } : {}),
      project,
      title: title(input.title),
      type:
        input.type ??
        (config.types.includes("task") ? "task" : config.types[0]),
      status:
        input.status ??
        (config.statuses.includes("todo") ? "todo" : config.statuses[0]),
      priority: input.priority ?? "none",
      parent: input.parent || null,
      assignee: input.assignee ?? "",
      due: input.due || null,
      tags: input.tags ?? [],
      created: now(),
      updated: now(),
    };
    for (const key of [
      "start",
      "estimate",
      "dependencies",
      "recurrence",
      "fields",
      "comments",
      "order",
      "archived",
    ])
      if (key in input) data[key] = input[key];
    data.aliases = [data.title];
    if (internal.recurrenceSource)
      data.recurrence_source = internal.recurrenceSource;
    this.validateTask(data, config);
    await this.validateParent(project, id, data.parent);
    await this.validateDependencies(project, id, data.dependencies);
    return this.write(
      this.file(project, "tasks", id),
      data,
      body(input.body ?? ""),
    );
  }
  async updateTask(project, id, input) {
    const file = this.file(project, "tasks", id),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    for (const key of [
      "title",
      "type",
      "status",
      "priority",
      "parent",
      "assignee",
      "due",
      "tags",
      "start",
      "estimate",
      "dependencies",
      "recurrence",
      "fields",
      "comments",
      "order",
      "archived",
    ])
      if (key in input) data[key] = input[key];
    data.title = title(data.title);
    data.parent ||= null;
    data.due ||= null;
    const config = schema(
      (await this.read(this.file(project, "project"))).data.schema,
    );
    this.validateTask(data, config);
    await this.validateParent(project, id, data.parent);
    await this.validateDependencies(project, id, data.dependencies);
    if (data.title !== current.data.title)
      data.aliases = [
        ...new Set([
          data.title,
          ...(Array.isArray(data.aliases) ? data.aliases : []),
        ]),
      ].slice(0, 20);
    // Completing a recurring task creates exactly one successor for this task ID.
    if (
      data.recurrence &&
      config.done.includes(data.status) &&
      !config.done.includes(current.data.status) &&
      !data.recurrence_next
    ) {
      const { items } = await this.children(project, "tasks");
      let successor = items.find((t) => t.recurrence_source === id);
      if (!successor) {
        const next = {
          ...data,
          status:
            config.statuses.find((s) => !config.done.includes(s)) ||
            config.statuses[0],
          due: nextDate(data.due, data.recurrence),
          start: data.start ? nextDate(data.start, data.recurrence) : null,
          comments: [],
          body: current.body,
        };
        successor = await this.createTask(project, next, {
          recurrenceSource: id,
        });
      }
      data.recurrence_next = successor.id;
    }
    return this.write(
      file,
      data,
      "body" in input ? body(input.body) : current.body,
      current,
    );
  }
  async deleteTask(project, id, revision) {
    const file = this.file(project, "tasks", id),
      current = await this.read(file);
    this.checkRevision(current, revision);
    const { items, warnings } = await this.children(project, "tasks");
    if (warnings.length)
      throw new Problem(
        409,
        "Repair unreadable task files before removing tasks.",
      );
    if (items.some((t) => t.parent === id))
      throw new Problem(400, "Move or remove the subtasks first.");
    const trash = path.join(this.root, ".trash", `${Date.now()}-${id}.md`);
    await this.safe(trash);
    await fs.mkdir(path.dirname(trash), { recursive: true });
    if (items.some((t) => (t.dependencies || []).includes(id)))
      throw new Problem(400, "Remove references to this dependency first.");
    await fs.rename(file, trash);
    this.changed();
    return { ok: true };
  }
  validateBoard(data) {
    title(data.title);
    if (
      data.settings !== undefined &&
      (!data.settings ||
        typeof data.settings !== "object" ||
        Array.isArray(data.settings) ||
        (data.settings.snap !== undefined &&
          typeof data.settings.snap !== "boolean"))
    )
      throw new Problem(
        400,
        "Board settings must be an object with a boolean snap value.",
      );
    if (
      !Array.isArray(data.nodes) ||
      data.nodes.length > 10000 ||
      !Array.isArray(data.edges) ||
      data.edges.length > 20000
    )
      throw new Problem(
        400,
        "A board supports up to 10,000 objects and 20,000 connectors.",
      );
    const ids = new Set();
    for (const node of data.nodes) {
      validId(node.id);
      if (ids.has(node.id))
        throw new Problem(400, "Duplicate board object ID.");
      ids.add(node.id);
      choice(
        node.type,
        [
          "task",
          "sticky",
          "text",
          "shape",
          "frame",
          "image",
          "draw",
          "file",
          "link",
          "query",
        ],
        "board object",
      );
      for (const key of ["x", "y", "w", "h"])
        if (!Number.isFinite(node[key]) || Math.abs(node[key]) > 100_000)
          throw new Problem(400, "Invalid board position.");
      if (node.w < 1 || node.h < 1)
        throw new Problem(400, "Board objects are too small.");
      if (
        node.text != null &&
        (typeof node.text !== "string" || node.text.length > 200000)
      )
        throw new Problem(400, "Board text is too long.");
      if (node.color) color(node.color);
      if (node.type === "task") validId(node.task);
      if (node.group) validId(node.group);
      if (node.frame) validId(node.frame);
      if (
        node.subpath &&
        (typeof node.subpath !== "string" ||
          !node.subpath.startsWith("#") ||
          node.subpath.length > 300)
      )
        throw new Problem(400, "Invalid embed heading or block.");
      if (
        node.type === "file" &&
        (typeof node.file !== "string" || node.file.length > 1000)
      )
        throw new Problem(400, "Invalid file reference.");
      if (
        node.type === "link" &&
        (typeof node.url !== "string" ||
          !/^https?:\/\//i.test(node.url) ||
          node.url.length > 2000)
      )
        throw new Problem(400, "Use an http or https link.");
      if (
        node.type === "query" &&
        node.query != null &&
        (typeof node.query !== "object" || Array.isArray(node.query))
      )
        throw new Problem(400, "Invalid task view.");
      if (
        node.comments &&
        (!Array.isArray(node.comments) ||
          node.comments.length > 1000 ||
          node.comments.some(
            (c) =>
              typeof c.id !== "string" ||
              typeof c.text !== "string" ||
              c.text.length > 10000 ||
              typeof c.author !== "string" ||
              c.author.length > 100,
          ))
      )
        throw new Problem(400, "Invalid board comments.");
      if (
        node.type === "image" &&
        (typeof node.src !== "string" ||
          !/^attachments\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/.test(
            node.src,
          ))
      )
        throw new Problem(400, "Use a local image attachment.");
      if (
        node.type === "draw" &&
        (!Array.isArray(node.points) ||
          node.points.length > 10000 ||
          node.points.some(
            (p) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              p.some((v) => !Number.isFinite(v) || Math.abs(v) > 100000),
          ))
      )
        throw new Problem(400, "Invalid drawing.");
    }
    if (data.nodes.filter((n) => n.type === "frame").length > 500)
      throw new Problem(400, "A board supports up to 500 frames.");
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    for (const n of data.nodes) {
      const seen = new Set([n.id]);
      let parent = n.frame;
      while (parent) {
        const frame = byId.get(parent);
        if (!frame || frame.type !== "frame" || seen.has(parent))
          throw new Problem(400, "Invalid frame hierarchy.");
        seen.add(parent);
        parent = frame.frame;
      }
    }
    const edges = new Set();
    for (const edge of data.edges) {
      validId(edge.id);
      if (
        edges.has(edge.id) ||
        !ids.has(edge.from) ||
        !ids.has(edge.to) ||
        edge.from === edge.to
      )
        throw new Problem(400, "Invalid connector.");
      if (
        edge.label != null &&
        (typeof edge.label !== "string" || edge.label.length > 500)
      )
        throw new Problem(400, "Connector labels must be short text.");
      for (const key of ["fromSide", "toSide"])
        if (edge[key] != null)
          choice(
            edge[key],
            ["top", "right", "bottom", "left"],
            "connector side",
          );
      for (const key of ["fromEnd", "toEnd"])
        if (edge[key] != null)
          choice(edge[key], ["none", "arrow"], "arrow style");
      if (edge.routing)
        choice(edge.routing, ["curve", "elbow", "straight"], "connector route");
      if (edge.relationship)
        choice(
          edge.relationship,
          ["relates", "blocks", "contains", "sequence"],
          "relationship",
        );
      if (edge.color && !/^[1-6]$/.test(edge.color)) color(edge.color);
      edges.add(edge.id);
    }
  }
  async createBoard(project, input) {
    await this.read(this.file(project, "project"));
    const id = `b-${randomUUID().slice(0, 8)}`;
    return this.write(
      this.file(project, "boards", id),
      {
        id,
        kind: "board",
        project,
        title: title(input.title),
        nodes: [],
        edges: [],
        created: now(),
        updated: now(),
      },
      "",
    );
  }
  async updateBoard(project, id, input) {
    const file = this.file(project, "boards", id),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    for (const key of ["title", "nodes", "edges", "archived"])
      if (key in input) data[key] = input[key];
    this.validateBoard(data);
    return this.write(file, data, current.body, current);
  }
  async demo(input = {}) {
    const project = await this.createProject({
      organisation: input.organisation,
      title: "A little more possibility",
      color: "#66856f",
      body: "A sample project to explore Pencils. Make it yours, or create a fresh project.\n\nEvery task is a real Markdown file. Open the vault in Obsidian to keep working your way.\n",
    });
    const epic = await this.createTask(project.id, {
      title: "Build a calmer workspace",
      type: "epic",
      status: "in-progress",
      priority: "high",
      tags: ["workspace"],
      body: "# A space for good work\n\nBring the big picture and the little details together.\n\n- [x] Keep everything in Markdown\n- [ ] Map the journey\n- [ ] Make room for ideas\n",
    });
    const entries = [
      {
        title: "Collect inspiration & early ideas",
        status: "done",
        type: "task",
        tags: ["discovery"],
        assignee: "Alex",
        parent: epic.id,
      },
      {
        title: "Map the first user journey",
        status: "in-progress",
        type: "story",
        priority: "high",
        tags: ["design"],
        assignee: "George",
        parent: epic.id,
      },
      {
        title: "Sketch the project dashboard",
        status: "todo",
        type: "task",
        priority: "medium",
        tags: ["design"],
        assignee: "Alex",
        parent: epic.id,
      },
      {
        title: "Make the little details accessible",
        status: "review",
        type: "task",
        priority: "medium",
        tags: ["quality"],
      },
      {
        title: "Fix keyboard focus in dialogs",
        status: "backlog",
        type: "bug",
        priority: "low",
        tags: ["quality"],
      },
      {
        title: "Share the first working version",
        status: "todo",
        type: "milestone",
        priority: "high",
        tags: ["release"],
      },
      {
        title: "A place for the next big idea",
        status: "backlog",
        type: "story",
        tags: ["ideas"],
      },
    ];
    const tasks = [];
    for (const input of entries)
      tasks.push(await this.createTask(project.id, input));
    const board = (await this.children(project.id, "boards")).items[0];
    await this.updateBoard(project.id, board.id, {
      revision: board.revision,
      nodes: [
        {
          id: "n-heading",
          type: "text",
          x: 80,
          y: 65,
          w: 520,
          h: 70,
          text: "Good things start with a little space.",
        },
        {
          id: "n-note",
          type: "sticky",
          x: 90,
          y: 180,
          w: 220,
          h: 180,
          text: "What if project planning felt a little less like work?",
          color: "#f5e7a2",
        },
        {
          id: "n-task",
          type: "task",
          x: 430,
          y: 200,
          w: 280,
          h: 140,
          task: tasks[1].id,
        },
        {
          id: "n-note2",
          type: "sticky",
          x: 820,
          y: 180,
          w: 220,
          h: 180,
          text: "Keep the big picture close.\nKeep the files yours.",
          color: "#d6e4d3",
        },
      ],
      edges: [
        { id: "e-one", from: "n-note", to: "n-task" },
        { id: "e-two", from: "n-task", to: "n-note2" },
      ],
    });
    return project;
  }
}

installRecovery(Store);
installWorkspace(Store);
installCanvas(Store);
