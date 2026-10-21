import { Problem } from "../problem.js";
import { sourceAccess } from "../sources.js";
import type { RequestContext } from "./contracts.js";
export async function authorizeWrite(ctx: RequestContext): Promise<void> {
  const { store, auth, req, parts, resource, project, kind } = ctx;
  const active = await auth.user(req),
    data = req.pencilsInput || {};
  if (!active) throw new Problem(401, "Please sign in to continue.");
  if (
    ["accounts", "backups", "trash"].includes(resource) ||
    (resource === "organisations" && !project)
  )
    auth.admin(active);
  if (resource === "organisations" && project)
    auth.require(active, project, true);
  if (resource === "projects" && kind === "sources") auth.admin(active);
  if (resource === "projects" && project) {
    const current = await store.read(store.file(project, "project"));
    auth.require(active, current.data.organisation, true);
    if (!sourceAccess(active, current.data))
      throw new Problem(403, "This project contains private source data.");
  }
  if ((resource === "projects" && !project) || resource === "demo")
    auth.require(active, data.organisation || "o-default", true);
  if (
    resource === "projects" &&
    project &&
    parts.length === 3 &&
    data.organisation
  )
    auth.require(active, data.organisation, true);
  if (resource === "history") {
    const current = await store.read(store.resolveFile(data.file));
    const organisation =
      current.data.kind === "organisation"
        ? current.data.id
        : current.data.kind === "project"
          ? current.data.organisation
          : (await store.read(store.file(current.data.project, "project"))).data
              .organisation;
    auth.require(active, organisation, true);
    if (current.data.kind === "project") {
      const previous = (await store.history(data.file)).find(
        (v: { revision: string }) => v.revision === data.version,
      );
      if (previous) auth.require(active, previous.data.organisation, true);
    }
  }
}
