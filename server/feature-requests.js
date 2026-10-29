import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import YAML from "yaml";
import { Problem } from "./problem.js";
import { REQUEST_STATUSES, REQUEST_PRIORITIES, REQUEST_ACCEPT, REQUEST_FILES, REQUEST_FILE_BYTES, REQUEST_TOTAL_BYTES } from "../public/feature-request-model.js";

const idPattern = /^fr-[a-f0-9-]{36}$/;
const filePattern = /^a-[a-f0-9-]{36}\.(png|jpe?g|gif|webp|pdf|txt|md|csv|zip)$/;
const now = () => new Date().toISOString();
const digest = value => createHash("sha256").update(value).digest("hex");
const ownerRevision = record => digest(JSON.stringify([record.title, record.body, record.priority, record.activity.filter(a => a.author !== "Worker")]));
const text = (value, max, label, required = false) => {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()))
    throw new Problem(400, `${label} must ${required ? "be filled in and " : ""}contain at most ${max.toLocaleString()} characters.`);
  return value.trim();
};
const md = value => String(value).replace(/[\r\n]/g, " ").replace(/[\\`*_[\]<>|]/g, "\\$&");

// One server-owned writer; the worker uses the API, never edits request files.
export class FeatureRequests {
  constructor(store) {
    this.store = store;
    this.root = path.join(store.root, "feature-requests");
    this.keyFile = path.join(store.root, ".pencils", "feature-worker-key");
    this.queue = Promise.resolve();
    this.worker = { state: "offline", message: "Automatic worker is not connected.", seen: null };
  }
  async init() {
    if (!this.initialising) this.initialising = (async () => {
      await this.store.safe(this.root);
      await this.store.safe(this.keyFile);
      await fs.mkdir(this.root, { recursive: true });
      await fs.mkdir(path.dirname(this.keyFile), { recursive: true });
      try { await fs.writeFile(this.keyFile, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 }); }
      catch (e) { if (e.code !== "EEXIST") throw e; }
      this.workerKey = (await fs.readFile(this.keyFile, "utf8")).trim();
      await this.store.safe(path.join(this.root, "settings.json"));
      try { this.settings = JSON.parse(await fs.readFile(path.join(this.root, "settings.json"), "utf8")); }
      catch (e) { if (e.code !== "ENOENT") throw e; this.settings = { automatic: true }; }
    })().catch(e => { this.initialising = null; throw e; });
    return this.initialising;
  }
  change(fn) {
    const next = this.queue.then(async () => { await this.init(); return fn(); });
    this.queue = next.catch(() => {});
    return next;
  }
  location(id, file = "request.md") {
    if (!idPattern.test(id)) throw new Problem(400, "Invalid feature request.");
    return path.join(this.root, id, file);
  }
  async atomic(file, value) {
    await this.store.safe(file);
    const temp = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, value, { flag: "wx", mode: 0o600 }); await fs.rename(temp, file); }
    finally { await fs.rm(temp, { force: true }); }
  }
  encode(record) {
    const { body, revision, ...data } = record;
    return `---\n${YAML.stringify(data)}---\n\n${body}\n`;
  }
  async read(id) {
    const file = this.location(id);
    await this.store.safe(file);
    let source;
    try { source = await fs.readFile(file, "utf8"); }
    catch (e) { if (e.code === "ENOENT") throw new Problem(404, "Feature request not found."); throw e; }
    const match = source.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
    if (!match) throw new Problem(409, "The request file cannot be read. Restore its Markdown frontmatter.");
    const data = YAML.parse(match[1]);
    if (data.id !== id || !Object.hasOwn(REQUEST_STATUSES, data.status)) throw new Problem(409, "Invalid request metadata.");
    const { lease, ...versioned } = data;
    return { ...data, body: match[2].trimEnd(), revision: digest(JSON.stringify(versioned) + match[2]) };
  }
  public(record) {
    const { lease, ...value } = record;
    return { ...value, folder: `feature-requests/${record.id}`, attachments: (record.attachments || []).map(a => ({ ...a, url: `/api/feature-requests/${record.id}/attachments/${a.id}` })) };
  }
  async all() {
    await this.init();
    const dirs = await fs.readdir(this.root, { withFileTypes: true });
    const records = await Promise.all(dirs.filter(d => d.isDirectory() && idPattern.test(d.name)).map(d => this.read(d.name)));
    return records.sort((a, b) => a.created.localeCompare(b.created) || a.id.localeCompare(b.id));
  }
  async index() {
    const records = await this.all();
    const rows = records.map(r => `| [${md(r.key)}](${r.id}/request.md) | ${md(r.title)} | ${REQUEST_STATUSES[r.status]} | ${REQUEST_PRIORITIES[r.priority]} | ${r.updated.slice(0, 10)} |`);
    await this.atomic(path.join(this.root, "index.md"), `# Feature requests\n\nRequests and attachments are stored in the neighbouring folders. Manage status and progress in Pencils → Help → Feature requests.\n\n| Request | Title | Status | Priority | Updated |\n| --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  }
  async list() {
    await this.queue;
    const records = await this.all();
    const worker = Date.now() - Date.parse(this.worker.seen || 0) < 90000 ? this.worker : { state: "offline", message: "Automatic worker is not connected.", seen: this.worker.seen };
    return { requests: records.map(r => this.public(r)), automatic: this.settings.automatic, worker };
  }
  async create(input, user) {
    return this.change(async () => {
      const id = input.id;
      this.location(id);
      try { const existing = await this.read(id); await this.index(); return this.public(existing); } catch (e) { if (e.status !== 404) throw e; }
      const title = text(input.title, 180, "Title", true), body = text(input.body, 30000, "Description", true);
      if (!Object.hasOwn(REQUEST_PRIORITIES, input.priority || "normal")) throw new Problem(400, "Choose a valid priority.");
      if (!Array.isArray(input.attachments) || input.attachments.length > REQUEST_FILES) throw new Problem(400, "Attach up to five files.");
      let total = 0;
      const uploads = input.attachments.map(a => {
        const name = text(a.name, 200, "File name", true), ext = path.extname(name).toLowerCase();
        if (!REQUEST_ACCEPT.split(",").includes(ext) || typeof a.data !== "string" || a.data.length > 14_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)) throw new Problem(400, "Use images, PDF, text, Markdown, CSV or ZIP files up to 10 MB each.");
        const bytes = Buffer.from(a.data, "base64");
        total += bytes.length;
        if (bytes.length > REQUEST_FILE_BYTES || total > REQUEST_TOTAL_BYTES) throw new Problem(400, "Attachments can total up to 20 MB, with 10 MB per file.");
        return { id: `a-${randomUUID()}${ext}`, name, size: bytes.length, bytes };
      });
      const created = now(), record = { id, key: `FR-${id.slice(3, 11).toUpperCase()}`, title, body, priority: input.priority || "normal", status: "queued", created, updated: created, author: user.name || user.username, context: text(input.context || "", 500, "Context"), app_version: text(input.app_version || "", 40, "App version"), attachments: uploads.map(({ bytes, ...a }) => a), activity: [{ at: created, author: user.name || user.username, text: "Request submitted.", status: "queued" }] };
      const temp = path.join(this.root, `.upload-${randomUUID()}`);
      await fs.mkdir(path.join(temp, "attachments"), { recursive: true });
      try {
        for (const a of uploads) await fs.writeFile(path.join(temp, "attachments", a.id), a.bytes, { flag: "wx", mode: 0o600 });
        await fs.writeFile(path.join(temp, "request.md"), this.encode(record), { flag: "wx", mode: 0o600 });
        await this.store.safe(this.location(id));
        await fs.rename(temp, path.dirname(this.location(id)));
      } finally { await fs.rm(temp, { recursive: true, force: true }); }
      await this.index();
      return this.public(await this.read(id));
    });
  }
  async save(record, note, author, status = record.status) {
    const at = now();
    record.updated = at;
    record.status = status;
    record.activity.push({ at, author, text: note, status });
    await this.atomic(this.location(record.id), this.encode(record));
    await this.index();
    return this.public(await this.read(record.id));
  }
  async update(id, input, user) {
    return this.change(async () => {
      const record = await this.read(id);
      if (input.revision !== record.revision) throw new Problem(409, "This request changed. Refresh it before saving.");
      const status = input.status || record.status;
      if (!Object.hasOwn(REQUEST_STATUSES, status) || (status === "in-progress" && record.status !== status)) throw new Problem(400, "The worker starts requests automatically.");
      if (record.status === "in-progress" && status !== record.status) throw new Problem(409, "The worker is handling this request. Pause the queue to prevent further requests starting.");
      const note = text(input.note || "", 10000, "Update");
      if (input.priority) {
        if (!Object.hasOwn(REQUEST_PRIORITIES, input.priority)) throw new Problem(400, "Invalid priority.");
        record.priority = input.priority;
      }
      if (status !== "in-progress") delete record.lease;
      return this.save(record, note || `Status: ${REQUEST_STATUSES[status]}.`, user.name || user.username, status);
    });
  }
  async attachment(id, name) {
    if (!filePattern.test(name)) throw new Problem(400, "Invalid attachment.");
    const record = await this.read(id), attachment = record.attachments.find(a => a.id === name);
    if (!attachment) throw new Problem(404, "Attachment not found.");
    const file = this.location(id, `attachments/${name}`);
    await this.store.safe(file);
    return { bytes: await fs.readFile(file), ext: path.extname(name) };
  }
  async configure(automatic) {
    return this.change(async () => {
      if (typeof automatic !== "boolean") throw new Problem(400, "Choose whether automatic processing is enabled.");
      this.settings = { automatic };
      await this.atomic(path.join(this.root, "settings.json"), JSON.stringify(this.settings));
      return this.settings;
    });
  }
  async authorizeWorker(key) {
    await this.init();
    if (typeof key !== "string" || key.length !== this.workerKey.length || !timingSafeEqual(Buffer.from(key), Buffer.from(this.workerKey))) throw new Problem(403, "Worker authentication failed.");
  }
  async work(input) {
    return this.change(async () => {
      const workerId = text(input.worker, 100, "Worker", true);
      if (input.action === "heartbeat") {
        this.worker = { state: text(input.state || "idle", 40, "Worker state"), message: text(input.message || "", 500, "Worker message"), seen: now() };
        if (input.id) {
          const r = await this.read(input.id);
          if (r.lease?.token !== input.lease || r.lease?.worker !== workerId || r.status !== "in-progress") throw new Problem(409, "Worker lease expired.");
          r.lease.expires = Date.now() + 180000;
          await this.atomic(this.location(r.id), this.encode(r));
          return { ok: true, ownerRevision: ownerRevision(r) };
        }
        return { ok: true };
      }
      if (input.action === "claim") {
        if (!this.settings.automatic) return { request: null };
        const records = await this.all();
        for (const r of records.filter(r => r.status === "in-progress")) {
          if (r.lease?.expires > Date.now()) return { request: null };
          delete r.lease;
          await this.save(r, "The worker stopped before reporting completion. Check the saved work before queuing this request again.", "Worker", "needs-input");
        }
        const priority = { high: 0, normal: 1, low: 2 };
        const r = records.filter(r => r.status === "queued").sort((a, b) => priority[a.priority] - priority[b.priority] || a.created.localeCompare(b.created))[0];
        if (!r) return { request: null };
        r.lease = { token: randomUUID(), worker: workerId, expires: Date.now() + 180000 };
        await this.save(r, "Worker started. Preparing an isolated copy of Pencils.", "Worker", "in-progress");
        return { request: this.public(await this.read(r.id)), lease: r.lease.token, ownerRevision: ownerRevision(r) };
      }
      const r = await this.read(input.id);
      if (r.status !== "in-progress" || r.lease?.token !== input.lease || r.lease.worker !== workerId) throw new Problem(409, "Worker lease expired.");
      const note = text(input.note, 20000, "Progress update", true);
      if (input.action === "progress") return this.save(r, note, "Worker");
      if (input.action !== "complete" || !["ready", "done", "needs-input"].includes(input.status)) throw new Problem(400, "Invalid worker result.");
      delete r.lease;
      return this.save(r, note, "Worker", input.status);
    });
  }
}
