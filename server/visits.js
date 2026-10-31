import { Problem } from "./problem.js";
import { PersonalLists, VIEWS, own } from "./bookmarks.js";

// What each person opened (cards, documents, boards and views), for Home's Recent and Most
// visited panels. The newest 500 visits are kept per person; items that are gone or out of reach
// are left out when listed, as bookmarks are.
const KINDS = ["card", "doc", "board", "view"];
const KEEP = 500, SHOWN = 50;
const key = (v) => `${v.kind}:${v.project}:${v.id}`;

export class Visits extends PersonalLists {
  constructor(store, bookmarks) {
    super(store, "visits.json");
    this.bookmarks = bookmarks;
  }
  async record(user, item, at = new Date().toISOString()) {
    const name = (value, limit) => typeof value === "string" && /^[\w.-]+$/.test(value) && value.length <= limit;
    if (!KINDS.includes(item?.kind) || !name(item.project, 80) || !name(item.id, 200) || (item.kind === "view" && !VIEWS.includes(item.id)))
      throw new Problem(400, "A visit names a card, document, board or view.");
    const visit = { kind: item.kind, project: item.project, id: item.id, at };
    return this.serial(async () => {
      const all = await this.all(), list = [...own(all, user.username), visit];
      await this.save({ ...all, [user.username]: list.slice(-KEEP) });
      return { ok: true };
    });
  }
  async list(user, { days = 30, kinds = KINDS } = {}) {
    const visits = own(await this.all(), user.username).filter((v) => kinds.includes(v.kind));
    const since = Date.now() - Math.max(1, Math.min(365, days)) * 864e5;
    const seen = new Map();
    for (const v of visits) {
      const k = key(v), entry = seen.get(k) || { ...v, count: 0, at: v.at };
      if (Date.parse(v.at) >= since) entry.count++;
      if (v.at > entry.at) entry.at = v.at;
      seen.set(k, entry);
    }
    const resolve = async (entries) => (await Promise.all(entries.map(async (v) => {
      const item = await this.bookmarks.resolve(user, { kind: v.kind, project: v.project, id: v.id });
      return item && { ...item, at: v.at, count: v.count };
    }))).filter(Boolean);
    const byTime = [...seen.values()].sort((a, b) => b.at.localeCompare(a.at));
    const byCount = byTime.filter((v) => v.count).sort((a, b) => b.count - a.count || b.at.localeCompare(a.at));
    return { recent: await resolve(byTime.slice(0, SHOWN)), visited: await resolve(byCount.slice(0, SHOWN)) };
  }
}
