import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

export async function authenticationRoutes(
  ctx: RequestContext,
): Promise<unknown> {
  const {
    store,
    auth,
    sources,
    miro,
    req,
    res,
    url,
    method,
    parts,
    resource,
    project,
    user,
    headers,
    json,
    bytes,
  } = ctx;
  if (resource === "session" && parts.length === 2) {
    if (method === "GET")
      return json(200, {
        required: auth.enabled,
        automatic: !!user?.automatic,
        user,
      });
    if (method === "POST") {
      const result = await auth.login(
        await input(req),
        req.socket.remoteAddress,
      );
      res.setHeader(
        "Set-Cookie",
        `pencils_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.socket.encrypted || process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
      );
      return json(200, { user: result.user });
    }
    if (method === "DELETE") {
      auth.sessions.delete(auth.token(req));
      res.setHeader(
        "Set-Cookie",
        "pencils_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
      );
      return json(200, { ok: true });
    }
  }
  if (resource === "miro-callback" && method === "GET") {
    await miro.callback(Object.fromEntries(url.searchParams));
    return bytes(
      '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Miro connected</title><body><h1>Miro connected</h1><p>Return to Import from Miro in Pencils. You can close this window.</p></body></html>',
      "text/html; charset=utf-8",
    );
  }
  if (resource === "source-callback" && method === "GET") {
    const projectId = await sources.callback(
      project,
      Object.fromEntries(url.searchParams),
    );
    res.writeHead(303, {
      ...headers,
      "Cache-Control": "no-store",
      Location: `/#project/${encodeURIComponent(projectId)}/settings`,
    });
    res.end();
    return;
  }

  throw new Problem(404, "Endpoint not found.");
}
