import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

// The bottom bar's buttons (server/bar.js): the signed-in person's own list, replaced as a whole so
// its order is kept. Like bookmarks, they aren't vault records.
export async function barRoutes(ctx: RequestContext): Promise<unknown> {
  const { bar, req, method, user, json } = ctx;
  if (!user) throw new Problem(401, "Please sign in to continue.");
  if (method === "GET") return json(200, { items: await bar.list(user) });
  if (method === "PATCH") return json(200, await bar.replace(user, await input(req)));
  throw new Problem(405, "Method not allowed.");
}
