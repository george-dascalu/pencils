import { Problem } from "../../problem.js";
import { sourceAccess } from "../../sources.js";
import { input } from "../helpers.js";
import { moveTree } from "../../folder-tree-moves.js";
import { editTag } from "../../project-tags.js";
import { keyTaken, KEY_FORMAT, validProjectKey } from "../../identity.js";
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
  // A taken key names its project only to someone who can open it (F0.22-93).
  const visible = (owner: Input) => auth.allow(user, owner.organisation) && sourceAccess(user, owner);
  const named = async (fn: () => Promise<unknown>) => {
    try {
      return await fn();
    } catch (error) {
      const { key, owner } = error as { key?: string; owner?: Input };
      if (key && owner) throw new Problem(409, keyTaken(key, owner, visible(owner)));
      throw error;
    }
  };
  // Checked as a key is typed in the New project dialog and Settings.
  if (resource === "project-key" && method === "GET") {
    const key = String(url.searchParams.get("key") || "").trim().toUpperCase();
    if (!validProjectKey(key)) return json(200, { key, available: false, error: KEY_FORMAT });
    const owner = (await store.keyOwners()).get(key);
    if (!owner || (owner.id === url.searchParams.get("project") && visible(owner))) return json(200, { key, available: true });
    return json(200, { key, available: false, error: keyTaken(key, owner, visible(owner)) });
  }
  if (resource === "projects" && parts.length === 2) {
    if (method === "GET") {
      if (url.searchParams.has("organisation"))
        auth.require(user, url.searchParams.get("organisation"));
      // Read first: the list is at least this new, so a page without a project knows which changes
      // it hasn't seen (F0.22-41).
      const version = store.version;
      const data = await store.list(url.searchParams.get("organisation"));
      return json(200, {
        version,
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
      return json(201, await named(() => mutate(() => store.createProject(data))));
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
      if ("tag_edit" in data) return json(200, await mutate(() => editTag(store, project, data)));
      if (data.organisation) auth.require(user, data.organisation, true);
      return json(200, await named(() => mutate(() => store.updateProject(project, data))));
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
