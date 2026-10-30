import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

// Bookmarks (server/bookmarks.js): the signed-in person's own list, added to and removed from here.
// They aren't vault records, so changes skip the vault's write queue (and its refresh on failure).
export async function bookmarksRoutes(ctx: RequestContext): Promise<unknown> {
  const { bookmarks, req, method, user, json } = ctx;
  if (!user) throw new Problem(401, "Please sign in to continue.");
  if (method === "GET") return json(200, { bookmarks: await bookmarks.list(user) });
  const data = await input(req);
  if (method === "POST") return json(200, await bookmarks.add(user, data));
  if (method === "DELETE") return json(200, await bookmarks.remove(user, data));
  throw new Problem(405, "Method not allowed.");
}
