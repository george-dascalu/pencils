import { Problem } from "./problem.js";
import { PersonalLists, VIEWS, own } from "./bookmarks.js";

// The bottom bar's own buttons (owner request, 30 Oct 2026): each person's commands and bookmarked
// cards, documents, boards and views, in their order, the same on every device. The app knows the
// commands; the server keeps their ids.
const KINDS = ["card", "doc", "board", "view"];
const LIMIT = 12;
const key = (b) => (b.type === "command" ? `command:${b.id}` : `${b.kind}:${b.project}:${b.id}`);

export class Bar extends PersonalLists {
  constructor(store, bookmarks) {
    super(store, "bar.json");
    this.bookmarks = bookmarks;
  }
  // Commands as they are; items with their current names, or left out if gone or out of reach.
  async resolve(user, button) {
    if (button.type === "command") return button;
    const item = await this.bookmarks.resolve(user, button);
    return item && { type: "item", ...item };
  }
  async list(user) {
    return (await Promise.all(own(await this.all(), user.username).map((b) => this.resolve(user, b)))).filter(Boolean);
  }
  async replace(user, input) {
    if (!Array.isArray(input?.items)) throw new Problem(400, "Send the bar's buttons as a list.");
    const items = [], seen = new Set();
    for (const b of input.items) {
      const button = b?.type === "command" ? { type: "command", id: b.id } : { type: "item", kind: b?.kind, project: b?.project, id: b?.id };
      if (typeof button.id !== "string" || (b?.type === "command" ? !/^[a-z][a-z0-9-]{0,39}$/.test(button.id) : b?.type !== "item" || !KINDS.includes(button.kind) || typeof button.project !== "string" || (button.kind === "view" && !VIEWS.includes(button.id))))
        throw new Problem(400, "Choose commands, cards, documents, boards or views for the bar.");
      if (seen.has(key(button))) continue;
      seen.add(key(button));
      items.push(button);
    }
    if (items.length > LIMIT) throw new Problem(400, `The bar holds ${LIMIT} buttons; remove one first.`);
    for (const button of items) if (!(await this.resolve(user, button))) throw new Problem(404, "Not found.");
    return this.serial(async () => {
      await this.save({ ...(await this.all()), [user.username]: items });
      return { ok: true };
    });
  }
}
