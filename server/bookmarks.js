import fs from "node:fs/promises";
import path from "node:path";
import { Problem } from "./problem.js";
import { sourceAccess } from "./sources.js";

// Bookmarks (owner request, 30 Oct 2026): each person's starred cards, documents, boards and
// project views, kept on the server so search lists the same ones first on every device.
const KINDS = { card: "tasks", doc: "documents", board: "boards" };
export const VIEWS = ["list", "tree", "table", "kanban", "calendar", "timeline", "capacity"];
const LIMIT = 200;
const same = (a, b) => a.kind === b.kind && a.project === b.project && a.id === b.id;
// A username such as "constructor" must not find Object's own members.
export const own = (all, username) => (Object.hasOwn(all, username) ? all[username] : []);

// A file of per-person lists ({ username: [...] }) outside the vault records, such as bookmarks and
// the bottom bar's buttons (server/bar.js).
export class PersonalLists {
  constructor(store, name) {
    this.store = store;
    this.file = path.join(store.root, ".pencils", name);
    this.queue = Promise.resolve();
  }
  async all() {
    await this.store.safe(this.file);
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (error) {
      // A missing or unreadable list starts empty rather than failing every request.
      if (error.code === "ENOENT" || error instanceof SyntaxError) return {};
      throw error;
    }
  }
  async save(all) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`, handle = await fs.open(temporary, "w", 0o600);
    try {
      await handle.writeFile(JSON.stringify(all, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, this.file);
  }
  // One change at a time, outside the vault's write queue: these aren't vault records.
  serial(fn) {
    const next = this.queue.then(fn);
    this.queue = next.catch(() => {});
    return next;
  }
}

export class Bookmarks extends PersonalLists {
  constructor(store, auth) {
    super(store, "bookmarks.json");
    this.auth = auth;
  }
  // The bookmarked item with its current name, or null if it's gone or this person can't open it.
  async resolve(user, { kind, project: id, id: item }) {
    try {
      const project = (await this.store.read(this.store.file(id, "project"))).data;
      if (!this.auth.allow(user, project.organisation) || !sourceAccess(user, project)) return null;
      if (kind === "view") return project.personal ? null : { kind, project: id, id: item, project_title: project.title, organisation: project.organisation };
      const { title, key } = (await this.store.read(this.store.file(id, KINDS[kind], item))).data;
      return { kind, project: id, id: item, title, key, project_title: project.title, organisation: project.organisation };
    } catch {
      return null;
    }
  }
  async list(user) {
    return (await Promise.all(own(await this.all(), user.username).map((b) => this.resolve(user, b)))).filter(Boolean);
  }
  async add(user, input) {
    const bookmark = { kind: input?.kind, project: input?.project, id: input?.id };
    if (typeof bookmark.kind !== "string" || !(Object.hasOwn(KINDS, bookmark.kind) || bookmark.kind === "view") || typeof bookmark.project !== "string" || typeof bookmark.id !== "string")
      throw new Problem(400, "Choose a card, document, board or view to bookmark.");
    if (bookmark.kind === "view" && !VIEWS.includes(bookmark.id)) throw new Problem(400, "That view can't be bookmarked.");
    if (!(await this.resolve(user, bookmark))) throw new Problem(404, "Not found.");
    return this.serial(async () => {
      const all = await this.all();
      // Deleted items and ones out of reach drop out here, so they never count against the limit.
      const mine = (await Promise.all(own(all, user.username).map(async (b) => (await this.resolve(user, b)) && b))).filter(Boolean);
      if (mine.some((b) => same(b, bookmark))) return { ok: true };
      if (mine.length >= LIMIT) throw new Problem(400, `Remove a bookmark before adding another; you can keep ${LIMIT}.`);
      await this.save({ ...all, [user.username]: [{ ...bookmark, added: new Date().toISOString() }, ...mine] });
      return { ok: true };
    });
  }
  remove(user, input) {
    return this.serial(async () => {
      const all = await this.all();
      await this.save({ ...all, [user.username]: own(all, user.username).filter((b) => !same(b, input || {})) });
      return { ok: true };
    });
  }
}
