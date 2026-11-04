import { PersonalLists, own } from "./bookmarks.js";
import { Problem } from "./problem.js";

// Search's own order and removed items (owner request, 3 Nov 2026): each person drags Bookmarks and
// Commands into their own order and removes items from Search, which Settings → You lists to bring
// back; the same on every device. Items are keys the app makes ("command:<id>" or
// "<kind>:<project>:<id>"). Items that are no longer bookmarks drop out as the lists are saved, so
// they never fill up; a command that has gone simply matches nothing.
const LISTS = ["bookmarks", "commands", "hidden"];
const KEY = /^(command:[a-z][a-z0-9-]{0,39}|(card|doc|board|view):[^:]+:.+)$/;
const LIMIT = 500;

export class SearchItems extends PersonalLists {
  constructor(store, bookmarks) {
    super(store, "search.json");
    this.bookmarks = bookmarks;
  }
  async get(user) {
    const mine = own(await this.all(), user.username);
    return Object.fromEntries(LISTS.map((list) => [list, Array.isArray(mine[list]) ? mine[list] : []]));
  }
  async replace(user, input) {
    const next = {};
    for (const list of LISTS) {
      const keys = input?.[list];
      if (!Array.isArray(keys) || keys.length > LIMIT || !keys.every((key) => typeof key === "string" && key.length <= 300 && KEY.test(key)))
        throw new Problem(400, "Send Search's order and removed items as lists of commands and bookmarks.");
      next[list] = [...new Set(keys)];
    }
    const marked = new Set(own(await this.bookmarks.all(), user.username).map((b) => `${b.kind}:${b.project}:${b.id}`));
    const command = (key) => key.startsWith("command:");
    next.commands = next.commands.filter(command);
    next.bookmarks = next.bookmarks.filter((key) => marked.has(key));
    next.hidden = next.hidden.filter((key) => command(key) || marked.has(key));
    return this.serial(async () => {
      await this.save({ ...(await this.all()), [user.username]: next });
      return { ok: true };
    });
  }
}
