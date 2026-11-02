import { Problem } from "../../problem.js";
import { sourceAccess } from "../../sources.js";
import { input } from "../helpers.js";
import { moveTree } from "../../folder-tree-moves.js";
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
  // Deleted cards, documents and boards, restored within 30 days (owner request T92).
  if (parts.length === 4 && parts[3] === "trash") {
    if (method === "GET") return json(200, { items: await store.projectTrash(project) });
    if (method === "POST") {
      const data = await input(req);
      await mutate(() => store.restoreProjectTrash(project, data.key));
      return json(200, { ok: true });
    }
  }
  // Every change to the project's cards, documents and boards over 365 days (owner request T93).
  if (parts.length === 4 && parts[3] === "audit" && method === "GET") {
    const before = Number(url.searchParams.get("before")) || Infinity;
    return json(200, { entries: await ctx.audit.list(project, { before }) });
  }
  if (parts.length === 3) {
    if (method === "GET") return json(200, await store.snapshot(project, { summaries: url.searchParams.get("boards") === "summary", board: url.searchParams.get("board") }));
    const data = await input(req);
    if (method === "PATCH") {
      if ("tree_move" in data) return json(200, await mutate(() => moveTree(store, project, data)));
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
