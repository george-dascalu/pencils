import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

// Search's own order and removed items (server/search-items.js): the signed-in person's, replaced
// as a whole. Like bookmarks, they aren't vault records.
export async function searchItemsRoutes(ctx: RequestContext): Promise<unknown> {
  const { searchItems, req, method, user, json } = ctx;
  if (!user) throw new Problem(401, "Please sign in to continue.");
  if (method === "GET") return json(200, await searchItems.get(user));
  if (method === "PATCH") return json(200, await searchItems.replace(user, await input(req)));
  throw new Problem(405, "Method not allowed.");
}
