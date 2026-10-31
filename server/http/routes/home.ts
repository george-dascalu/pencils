import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import { checkEmbed } from "../../embed-check.js";
import type { RequestContext } from "../contracts.js";

// Home's layout (server/home.js), the visits behind its Recent and Most visited panels
// (server/visits.js) and the framing check behind its Web page panel (server/embed-check.js); all
// per signed-in person.
export async function homeRoutes(ctx: RequestContext): Promise<unknown> {
  const { home, visits, embed, req, method, user, json, parts, url } = ctx;
  if (!user) throw new Problem(401, "Please sign in to continue.");
  if (parts[1] === "visits") {
    if (method === "GET") {
      const kinds = (url.searchParams.get("kinds") || "").split(",").filter(Boolean);
      return json(200, await visits.list(user, { days: Number(url.searchParams.get("days")) || 30, ...(kinds.length ? { kinds } : {}) }));
    }
    if (method === "POST") return json(200, await visits.record(user, await input(req)));
  } else if (parts[2] === "embed") {
    if (method === "GET") return json(200, await checkEmbed(url.searchParams.get("url"), { ...embed, self: req.headers.host || url.host }));
  } else {
    if (method === "GET") return json(200, await home.list(user));
    if (method === "PATCH") return json(200, await home.replace(user, await input(req)));
  }
  throw new Problem(405, "Method not allowed.");
}
