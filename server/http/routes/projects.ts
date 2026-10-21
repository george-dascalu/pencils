import { Problem } from "../../problem.js";
import { sourceAccess } from "../../sources.js";
import { input } from "../helpers.js";
import type { RequestContext, Input } from "../contracts.js";

export async function projectsRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    auth,
    req,
    url,
    method,
    parts,
    resource,
    project,
    user,
    json,
    mutate,
  } = ctx;
  if (resource === "projects" && parts.length === 2) {
    if (method === "GET") {
      if (url.searchParams.has("organisation"))
        auth.require(user, url.searchParams.get("organisation"));
      const data = await store.list(url.searchParams.get("organisation"));
      return json(200, {
        projects: data.projects.filter(
          (p: Input) =>
            auth.allow(user, p.organisation) && sourceAccess(user, p),
        ),
        warnings: user.admin ? data.warnings : [],
      });
    }
    if (method === "POST") {
      const data = await input(req);
      auth.require(user, data.organisation || "o-default", true);
      return json(201, await mutate(() => store.createProject(data)));
    }
  }
  if (resource === "demo" && method === "POST") {
    const data = await input(req);
    auth.require(user, data.organisation || "o-default", true);
    return json(201, await mutate(() => store.demo(data)));
  }
  if (parts.length === 3) {
    if (method === "GET") return json(200, await store.snapshot(project));
    const data = await input(req);
    if (method === "PATCH") {
      if (data.organisation) auth.require(user, data.organisation, true);
      return json(200, await mutate(() => store.updateProject(project, data)));
    }
    if (method === "DELETE")
      return json(
        200,
        await mutate(() =>
          store.removeRecord(project, "project", null, data.revision),
        ),
      );
  }

  throw new Problem(404, "Endpoint not found.");
}
