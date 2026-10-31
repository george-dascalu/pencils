import { Problem } from "./problem.js";
import { PersonalLists } from "./bookmarks.js";

// The personal Home (owner request T22, 31 October 2026): each person's panels on a 12-column grid,
// kept per person like the bottom bar's buttons. The app draws the panels; the server keeps the
// layout and each panel's settings, trimmed to the keys its type knows.
export const PANEL_TYPES = ["projects", "bookmarks", "commands", "recent", "visited", "web", "tasks", "stat", "breakdown", "note", "document"];
const FILTER = ["project", "title", "status", "assignee", "type", "due"];
const SETTINGS = {
  projects: [],
  bookmarks: ["layout", "limit"],
  commands: ["ids"],
  recent: ["kinds", "limit"],
  visited: ["kinds", "limit", "days"],
  web: ["url", "title", "embeddable"],
  tasks: [...FILTER, "limit"],
  stat: [...FILTER, "threshold"],
  breakdown: ["project", "title", "by"],
  note: ["title", "text"],
  document: ["project", "document", "heading", "title"],
};
const COLUMNS = 12, ROWS = 400, LIMIT = 24, TEXT = 20000, VALUE = 2000;

export function defaultPanels() {
  return [
    { id: "projects", type: "projects", x: 0, y: 0, w: 12, h: 4, settings: {} },
    { id: "bookmarks", type: "bookmarks", x: 0, y: 4, w: 4, h: 6, settings: {} },
    { id: "recent", type: "recent", x: 4, y: 4, w: 4, h: 6, settings: {} },
    { id: "stat", type: "stat", x: 8, y: 4, w: 4, h: 3, settings: { title: "Assigned to me", assignee: "me" } },
    { id: "tasks", type: "tasks", x: 0, y: 10, w: 12, h: 6, settings: { title: "Due this week", due: "next7" } },
  ];
}
const whole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
function setting(key, value) {
  if (["limit", "threshold", "days"].includes(key)) return whole(value, 0, 1000) ? value : undefined;
  if (key === "embeddable") return typeof value === "boolean" ? value : undefined;
  if (key === "by") return ["status", "priority", "assignee"].includes(value) ? value : undefined;
  if (["ids", "kinds"].includes(key)) return Array.isArray(value) && value.length <= 50 && value.every((v) => typeof v === "string" && v.length <= 80) ? value : undefined;
  if (typeof value !== "string" || value.length > (key === "text" ? TEXT : VALUE)) return undefined;
  if (key === "url" && !/^https?:\/\//i.test(value)) throw new Problem(400, "A web page needs a full http or https address.");
  return value;
}
export function normalizePanels(input) {
  if (!Array.isArray(input)) throw new Problem(400, "Send the panels as a list.");
  if (input.length > LIMIT) throw new Problem(400, `Home holds ${LIMIT} panels; remove one first.`);
  const ids = new Set(), panels = [];
  for (const p of input) {
    if (!p || typeof p !== "object" || !PANEL_TYPES.includes(p.type) || typeof p.id !== "string" || !/^[\w-]{1,40}$/.test(p.id) || ids.has(p.id))
      throw new Problem(400, "Each panel needs a known type and its own id.");
    if (!whole(p.x, 0, COLUMNS - 1) || !whole(p.w, 1, COLUMNS) || p.x + p.w > COLUMNS || !whole(p.y, 0, ROWS) || !whole(p.h, 1, ROWS) || p.y + p.h > ROWS)
      throw new Problem(400, "Each panel sits inside the grid's 12 columns.");
    ids.add(p.id);
    const settings = {};
    for (const key of SETTINGS[p.type]) {
      const value = setting(key, p.settings?.[key]);
      if (value !== undefined) settings[key] = value;
    }
    panels.push({ id: p.id, type: p.type, x: p.x, y: p.y, w: p.w, h: p.h, settings });
  }
  return panels;
}
export class Home extends PersonalLists {
  constructor(store) {
    super(store, "home.json");
  }
  async list(user) {
    const panels = (await this.all())[user.username];
    return { panels: Array.isArray(panels) ? panels : defaultPanels() };
  }
  async replace(user, input) {
    const panels = normalizePanels(input?.panels);
    return this.serial(async () => {
      await this.save({ ...(await this.all()), [user.username]: panels });
      return { ok: true };
    });
  }
}
