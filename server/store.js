import { boardsMethods } from "./services/boards.js";
import { tasksMethods } from "./services/tasks.js";
import { documentsMethods } from "./services/documents.js";
import { WriteJournal } from "./journal.js";
import { documentFolders, documentFolder } from "./document-folders.js";
import { hierarchyError } from "../public/hierarchy-model.js";
import { directory, projectTeams } from "./teams.js";
import { installIdentity } from "./identity.js";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import YAML from "yaml";
import { EventEmitter } from "node:events";
import { watch, readdirSync, statSync } from "node:fs";
import { Problem } from "./problem.js";
import { schema, upgradeDefaultTaskTypes, validateViews, progress } from "./model.js";
import { installRecovery } from "./recovery.js";
import { decodeCanvas, encodeCanvas } from "../public/canvas-format.js";
import { installCanvas } from "./canvas.js";
import { installWorkspace } from "./workspace.js";
import { DEFAULT_ORGANISATION, idPattern, now, hash, validId, title, body, choice, tags, color, personalOrganisation, isPersonalOrganisation } from "./values.js";
export { STATUSES, TYPES, PRIORITIES, DEFAULT_ORGANISATION } from "./values.js";
export { Problem } from "./problem.js";

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
    this.snapshots = new Map();
    this.childrenCache = new Map();
    this.childrenReads = new Map();
    this.events = new EventEmitter();
    this.events.setMaxListeners(0);
    this.version = 0;
    this.changeLog=[];
    this.recentWrites=new Map();
    this.journal=new WriteJournal(this);
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
    await this.journal.recover();
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
      const upgradedSchema = upgradeDefaultTaskTypes(record.data.schema);
      if (!Object.hasOwn(record.data, "organisation") || upgradedSchema !== record.data.schema) {
        await this.write(
          file,
          { ...record.data,
            organisation: record.data.organisation ?? DEFAULT_ORGANISATION,
            ...(upgradedSchema ? { schema: upgradedSchema } : {}),
          },
          record.body,
          record,
        );
      }
      await this.ensureTaskIdentities(entry.name);
      await this.migrateBoards(entry.name);
    }
  }
  // Serialize app writers; file revisions also detect edits from Obsidian/other clients.
  mutate(fn) {
    const next = this.queue.then(async () => {
      await this.init();
      await this.journal.start();
      const version=this.version;
      try {await this.autoBackup();const result=await fn();await this.journal.finish(true);
        const changes=this.changeLog.filter(c=>c.version>version);
        if(changes.length){const projects=new Set(changes.map(c=>c.record?.kind!=="project"?c.record?.project:null));if(projects.has(null)||projects.has(undefined))this.events.emit("change",this.version,{});else for(const project of projects)this.events.emit("change",this.version,{project});}
        return result;}
      catch(error){await this.journal.finish(false);this.changed();throw error;}
    });
    this.queue = next.catch(() => {});
    return next;
  }
  changed(file=null, value=null) {
    this.version++;
    const relative=file?path.relative(this.root,file).split(path.sep).join('/'):"";
    const match=/^Projects\/([\w-]+)\/(?:(tasks|boards|documents)\/([\w-]+)\.(md|canvas)|project\.md)$/.exec(relative);
    const identity=/^Projects\/([\w-]+)\/identity\.md$/.exec(relative);
    const record=match?{project:match[1],kind:match[2] || "project",id:match[3] || match[1]}:identity?{project:identity[1],kind:"identity",id:"identity"}:null;
    if (!record) this.childrenCache.clear();
    else if (record.kind === "project") {
      for (const key of this.childrenCache.keys())
        if (key.startsWith(record.project + "/")) this.childrenCache.delete(key);
    } else {
      const key = `${record.project}/${record.kind}`, cached = this.childrenCache.get(key);
      if (value && cached && !cached.value.warnings.length) {
        // Maintain the short-lived projection from our own confirmed writes.
        const items = [...cached.value.items];
        const index = items.findIndex(item => item.id === value.id);
        if (index < 0) items.push(value); else items[index] = value;
        cached.value = { items, warnings: [] };
      } else this.childrenCache.delete(key);
    }
    this.changeLog.push({version:this.version,record});if(this.changeLog.length>1000)this.changeLog.shift();
    if(!this.journal.active)this.events.emit("change",this.version,{project:record?.kind!=="project"?record?.project:null});
  }
  async delta(project,since){
    const version=this.version;if(!Number.isInteger(since) || since<0 || since>version || (this.changeLog[0] && since<this.changeLog[0].version-1))return {full:true,version};
    const changes=this.changeLog.filter(c=>c.version>since);if(changes.some(c=>!c.record))return {full:true,version};
    const records=new Map();for(const {record:r} of changes)if(r.project===project && r.kind!=="identity")records.set(`${r.kind}/${r.id}`,r);
    const result=[];for(const r of records.values()){try{const file=this.file(project,r.kind,r.id),record=await this.read(file);if(r.kind==="tasks")this.validateTask(record.data,schema((await this.read(this.file(project,"project"))).data.schema));if(r.kind==="boards")this.validateBoard(record.data);if(r.kind==="documents")this.validateDocument(record.data);result.push({kind:r.kind,value:this.public(record,file)});}catch{return {full:true,version};}}
    return {full:false,version,records:result};
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
    const pendingFiles=new Set();
    const changed = (file) => {
      if(file?.endsWith(".tmp"))return;
      pendingFiles.add(file);
      clearTimeout(this.watchTimer);
      this.watchTimer=setTimeout(async()=>{
        const files=[...pendingFiles];pendingFiles.clear();
        for(const file of files){
          const expected=this.recentWrites.get(file);
          if(expected){try{await this.safe(file);if(hash(await fs.readFile(file,"utf8"))===expected.hash){this.recentWrites.delete(file);continue;}}catch{}}
          this.changed(file);
        }
      },100);this.watchTimer.unref();
    };
    // One watcher per directory: Linux recursive watchers stop reporting a file once it has
    // been replaced by a rename, which is how Pencils saves, so later in-place edits (Obsidian)
    // went unseen. New directories get a watcher as they appear.
    const directories = new Map();
    const watchDirectory = (dir) => {
      if (directories.has(dir)) return;
      const handle = watch(dir, (event, name) => {
        const file = name ? path.join(dir, String(name)) : null;
        if (file && event === "rename") {
          let folder = false;
          try { folder = statSync(file).isDirectory(); } catch {}
          // Files may land in a new folder before its watcher starts: report what it holds.
          // The folder can vanish again meanwhile; then there is nothing to report.
          if (folder && !directories.has(file)) {
            try {
              watchDirectory(file);
              for (const entry of readdirSync(file, { recursive: true, withFileTypes: true }))
                if (entry.isFile()) changed(path.join(entry.parentPath, entry.name));
            } catch {}
            return;
          }
          // A removed folder may have held anything: forget it and its subfolders, refresh once.
          if (!folder && directories.has(file)) {
            for (const [dir, watcher] of directories)
              if (dir === file || dir.startsWith(file + path.sep)) { watcher.close(); directories.delete(dir); }
            return changed(null);
          }
        }
        // A watched folder's own watcher reports its files; this event says nothing new.
        if (file && directories.has(file)) return;
        changed(file);
      });
      handle.on("error", fallback);
      handle.unref();
      handles.push(handle);
      directories.set(dir, handle);
      for (const entry of readdirSync(dir, { withFileTypes: true }))
        if (entry.isDirectory()) watchDirectory(path.join(dir, entry.name));
    };
    try {
      // Recovery/history files can outnumber live notes. Watch only public content.
      for (const name of ["Projects", "Organisations"]) watchDirectory(path.join(this.root, name));
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
      ...(record.data.kind === "board" && record.data.operations ? { operations: record.data.operations.map(({ changes, ...operation }) => changes.length > 1000 ? operation : { ...operation, changes }) } : {}),
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
    let written;
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
      await this.journal.stage(file,text);
      if(existing && (await this.read(file)).revision!==existing.revision)throw new Problem(409,"This file changed while the save was being prepared. Your edit is retained for review.");
      this.recentWrites.set(file,{hash:hash(text)});if(this.recentWrites.size>2000)this.recentWrites.delete(this.recentWrites.keys().next().value);
      if(existing)await fs.rename(temporary,file);
      else {await fs.link(temporary,file);await fs.rm(temporary,{force:true});}
      const directory=await fs.open(path.dirname(file),"r");
      try{await directory.sync();}finally{await directory.close();}
      this.cache.delete(file);
      written = parse(text, file);
      this.changed(file, this.public(written, file));
    } finally {
      await fs.rm(temporary, { force: true });
    }
    return this.public(written, file);
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
    const members = directory(record.data.people, record.data.teams);
    return { ...this.public(record, file), ...members };
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
        ...directory(input.people, input.teams),
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
    if ("people" in input || "teams" in input)
      Object.assign(data, directory(input.people ?? data.people, input.teams ?? data.teams));
    if ("teams" in input) {
      const removed = new Set((current.data.teams || []).filter(t => !data.teams.some(next => next.id === t.id)).map(t => t.id));
      const {projects} = await this.list(id);
      if (projects.some(p => (p.teams || []).some(team => removed.has(team))))
        throw new Problem(409, "Remove a team from its projects before deleting it.");
    }
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
    const key = `${project}/${kind}`;
    const cached = this.childrenCache.get(key);
    // Watcher events invalidate external edits; the bounded TTL also covers
    // missed platform events. Revision checks always read/stat the actual file.
    if (this.watcher && cached && Date.now() - cached.at < 1000)
      return structuredClone(cached.value);
    const active = this.childrenReads.get(key);
    if (active?.version === this.version) return structuredClone(await active.work);
    const entry = { version: this.version, work: this.readChildren(project, kind) };
    this.childrenReads.set(key, entry);
    try {
      const value = await entry.work;
      if (entry.version === this.version && this.watcher) {
        this.childrenCache.set(key, { value, at: Date.now() });
        if (this.childrenCache.size > 100) this.childrenCache.delete(this.childrenCache.keys().next().value);
      }
      return structuredClone(value);
    } finally { if (this.childrenReads.get(key) === entry) this.childrenReads.delete(key); }
  }
  async readChildren(project, kind) {
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
    const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(kind === "boards" ? ".canvas" : ".md"));
    // Bounded parallel reads avoid serial stat/realpath round trips for every file.
    for (let start = 0; start < files.length; start += 16) {
      const results = await Promise.all(files.slice(start, start + 16).map(async entry => {
      try {
        const file = path.join(dir, entry.name),
          record = await this.read(file);
        if (kind !== "boards" && record.data.id !== entry.name.slice(0, -3))
          throw new Problem(422, "ID must match the filename.");
        if (record.data.project !== project)
          throw new Problem(422, "Project ID does not match the folder.");
        if (kind === "tasks") this.validateTask(record.data, config);
        if (kind === "boards") this.validateBoard(record.data);
        if (kind === "documents") this.validateDocument(record.data);
        return { item: this.public(record, file) };
      } catch (error) {
        return { warning: `${kind}/${entry.name}: ${error.message}` };
      }
      }));
      for (const result of results) {
        if (result.item) items.push(result.item);
        else warnings.push(result.warning);
      }
    }
    return { items, warnings };
  }
  async snapshot(id) {
    const requiredVersion = this.version;
    const existing = this.snapshots.get(id);
    if (existing) {
      const value = await existing.work;
      if (value.version >= requiredVersion) return structuredClone(value);
      if (this.snapshots.get(id) === existing) this.snapshots.delete(id);
      return this.snapshot(id);
    }
    const entry = { version: this.version, work: this.readSnapshot(id) };
    this.snapshots.set(id, entry);
    try { return structuredClone(await entry.work); }
    finally { if (this.snapshots.get(id) === entry) this.snapshots.delete(id); }
  }
  async readSnapshot(id) {
    await this.init();
    await this.ensureTaskIdentities(id);
    const snapshotVersion=this.version;
    const file = this.file(id, "project");
    const project = this.public(await this.read(file), file);
    const organisation = await this.getOrganisation(project.organisation);
    const [tasks, boards, documents] = await Promise.all([
      this.children(id, "tasks"),
      this.children(id, "boards"),
      this.children(id, "documents"),
    ]);
    const warnings = [...tasks.warnings, ...boards.warnings, ...documents.warnings];
    for (const task of tasks.items) {
      const person = (organisation.people || []).find(p => p.id === task.assignee_id);
      if (person) task.assignee = person.name;
    }
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
    // Keep board references useful after deletion without returning deleted
    // tasks as active project tasks or guessing that an unreadable file is gone.
    const taskAvailability = Object.create(null);
    const missing = [...new Set(boards.items.flatMap((b) => b.nodes
      .filter((n) => n.type === "task" && !byId.has(n.task)).map((n) => n.task)))];
    if (missing.length) {
      const trash = (await this.trash()).filter((t) => t.kind === "task" && t.project === id);
      for (const taskId of missing) {
        taskAvailability[taskId] = { status: "unavailable" };
        if (!idPattern.test(taskId)) continue;
        let absent = false;
        try { await fs.stat(this.file(id, "tasks", taskId)); }
        catch (error) { absent = error.code === "ENOENT"; }
        const deleted = absent && trash.find((t) => t.id === taskId);
        if (deleted) taskAvailability[taskId] = {
          status: "deleted", title: deleted.title, key: deleted.task_key,
        };
      }
    }
    return {
      version:snapshotVersion,
      project,
      tasks: tasks.items,
      taskAvailability,
      boards: boards.items,
      documents: documents.items,
      warnings,
      progress: progress(tasks.items, schema(project.schema)),
    };
  }
  // `personal` (only from personalSpace) makes the account's documents-only space.
  async createProject(input, { personal } = {}) {
    const organisation = await this.getOrganisation(
      input.organisation ?? DEFAULT_ORGANISATION,
    );
    if (isPersonalOrganisation(organisation.id) !== !!personal)
      throw new Problem(400, "Projects can't be created in a personal space.");
    const id = `p-${randomUUID().slice(0, 8)}`;
    const project = await this.write(
      this.file(id, "project"),
      {
        id,
        kind: "project",
        key: await this.projectKey(input.key, input.title),
        organisation: organisation.id,
        teams: projectTeams(input.teams, organisation),
        title: title(input.title),
        color: color(input.color || "#587563"),
        created: now(),
        updated: now(),
        default_view: personal ? "documents" : "list",
        schema: schema(input.schema),
        views: [],
        templates: [],
        ...(personal ? { personal } : {}),
      },
      body(input.body ?? ""),
    );
    if (!personal) await this.createBoard(id, { title: "Project canvas" });
    return project;
  }
  // The account's personal space (an organisation from personalOrganisation and one
  // documents-only project in it), made on first use.
  async personalSpace(username) {
    const id = personalOrganisation(username), file = this.organisationFile(id);
    if (!(await fs.stat(file).catch(() => null)))
      await this.write(file, { id, kind: "organisation", personal: username, ...directory([], []), title: "Personal", color: "#66856f", created: now(), updated: now() }, "");
    const existing = (await this.list(id)).projects.find((p) => p.personal === username);
    return { project: existing || (await this.createProject({ organisation: id, title: "Personal" }, { personal: username })) };
  }
  async updateProject(id, input) {
    const file = this.file(id, "project"),
      current = await this.read(file);
    this.checkRevision(current, input.revision);
    const data = { ...current.data, updated: now() };
    if ("title" in input) data.title = title(input.title);
    if ("key" in input) {
      data.key = await this.projectKey(input.key, data.title, id);
      if (data.key !== current.data.key)
        data.previous_keys = [
          ...new Set(
            [...(data.previous_keys || []), current.data.key].filter(Boolean),
          ),
        ];
    }
    if ("color" in input) data.color = color(input.color);
    if ("document_folders" in input) {
      data.document_folders = documentFolders(input.document_folders);
      const { items, warnings } = await this.children(id, "documents");
      if (warnings.length) throw new Problem(409, "Repair unreadable documents before changing folders.");
      for (const document of items) documentFolder(document.folder, data.document_folders);
    }
    if ("default_view" in input)
      data.default_view = choice(
        input.default_view,
        [
          "overview",
          "documents",
          "list",
          "tree",
          "table",
          "kanban",
          "board",
          "drawing",
          "calendar",
          "timeline",
          "capacity",
        ],
        "view",
      );
    if ("organisation" in input) {
      data.organisation = (await this.getOrganisation(input.organisation)).id;
      if (data.organisation !== current.data.organisation && (current.data.personal || isPersonalOrganisation(data.organisation)))
        throw new Problem(400, "Projects can't move into or out of a personal space.");
    }
    if ("teams" in input || data.organisation !== current.data.organisation) {
      const organisation = await this.getOrganisation(data.organisation);
      data.teams = projectTeams(input.teams ?? (data.organisation === current.data.organisation ? data.teams : []), organisation);
    }
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
      for (const task of items) {
        this.validateTask(task, data.schema);
        const error = hierarchyError(data.schema, task, items.find(t => t.id === task.parent));
        if (error) throw new Problem(400, `${error} Move existing tasks before enforcing these rules.`);
      }
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
    const saved = await this.write(
      file,
      data,
      "body" in input ? body(input.body) : current.body,
      current,
    );
    if (data.key !== current.data.key) await this.ensureTaskIdentities(id);
    return saved;
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
    const teamDirectory = await this.getOrganisation(project.organisation);
    for (const input of entries)
      tasks.push(await this.createTask(project.id, {...input, ...((teamDirectory.teams || []).length ? {assignee: ""} : {})}));
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

Object.assign(Store.prototype, documentsMethods, tasksMethods, boardsMethods);

installRecovery(Store);
installWorkspace(Store);
installCanvas(Store);

installIdentity(Store);
