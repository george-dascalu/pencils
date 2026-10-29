import { input, mime } from "../helpers.js";
import { Problem } from "../../problem.js";
import type { RequestContext } from "../contracts.js";

export async function featureRequestsRoutes(ctx: RequestContext): Promise<unknown> {
  const { requests, auth, user, parts, method, req, json, bytes } = ctx;
  if (parts[1] === "feature-request-worker") {
    await requests.authorizeWorker(req.headers["x-pencils-worker"]);
    if (method !== "POST") throw new Problem(405, "Use POST.");
    return json(200, await requests.work(await input(req)));
  }
  auth.admin(user);
  if (parts[2] === "settings" && method === "PATCH")
    return json(200, await requests.configure((await input(req)).automatic));
  if (parts.length === 2) {
    if (method === "GET") return json(200, await requests.list());
    if (method === "POST") return json(201, await requests.create(await input(req), user));
  }
  if (parts.length === 3) {
    if (method === "GET") return json(200, requests.public(await requests.read(parts[2])));
    if (method === "PATCH") return json(200, await requests.update(parts[2], await input(req), user));
  }
  if (parts.length === 5 && parts[3] === "attachments" && method === "GET") {
    const file = await requests.attachment(parts[2], parts[4]);
    return bytes(file.bytes, mime[file.ext], { "Content-Disposition": `${[".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(file.ext) ? "inline" : "attachment"}; filename="${parts[4]}"` });
  }
  throw new Problem(404, "Endpoint not found.");
}
