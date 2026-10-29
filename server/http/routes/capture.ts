import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

// Phone quick capture (server/capture.js): /api/capture takes a capture token instead of a
// session; /api/capture-tokens lists, makes and revokes the signed-in person's tokens.
export async function captureRoutes(ctx: RequestContext): Promise<unknown> {
  const { capture, req, method, resource, project: id, user, json, mutate } = ctx;
  if (resource === "capture" && method === "POST")
    return json(201, await capture.capture(req.headers.authorization, await input(req), req.socket.remoteAddress));
  if (resource !== "capture-tokens") throw new Problem(404, "Not found.");
  if (!user) throw new Problem(401, "Please sign in to continue.");
  if (method === "GET" && !id) return json(200, { tokens: await capture.list(user) });
  if (method === "POST" && !id) {
    const data = await input(req);
    return json(200, await mutate(() => capture.create(user, data.project)));
  }
  if (method === "DELETE" && id) return json(200, await mutate(() => capture.revoke(user, id)));
  throw new Problem(405, "Method not allowed.");
}
