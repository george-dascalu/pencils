import { Problem } from "../../problem.js";
import { input, audit, audited } from "../helpers.js";
import { changedFields } from "../../audit.js";
import type { RequestContext, Input } from "../contracts.js";

export async function documentsRoutes(ctx: RequestContext): Promise<unknown> {
  const { store, req, url, method, parts, project, kind, id, json, mutate } =
    ctx;
  if (kind === "documents" && parts.length <= 5) {
    if (method === "GET")
      return json(
        200,
        id
          ? await store.getDocument(project, id)
          : await store.children(project, "documents"),
      );
    const data = await input(req);
    if (method === "POST" && !id) {
      const created: Input = await mutate(() => store.createDocument(project, data));
      await audit(ctx, { action: "created", ...audited(created) });
      return json(201, created);
    }
    if (method === "PATCH" && id) {
      const before = await store.read(store.file(project, "documents", id)).catch(() => null);
      const after: Input = await mutate(() => store.updateDocument(project, id, data));
      const fields = changedFields(before, after);
      if (fields.length) await audit(ctx, { action: "edited", ...audited(after), fields });
      return json(200, after);
    }
    if (method === "DELETE" && id) {
      let removed: Input | undefined;
      const result = await mutate(async () => {
        removed = await store.getDocument(project, id);
        return store.removeRecord(project, "documents", id, data.revision);
      });
      await audit(ctx, { action: "deleted", ...audited(removed) });
      return json(200, result);
    }
  }
  if (kind === "notes") {
    if (method === "GET" && url.searchParams.has("backlinks"))
      return json(200, {
        links: await store.canvasBacklinks(
          project,
          url.searchParams.get("backlinks"),
        ),
      });
    if (method === "GET")
      return json(
        200,
        url.searchParams.has("file")
          ? await store.canvasNote(project, url.searchParams.get("file"))
          : { files: await store.canvasNoteChoices(project) },
      );
    if (method === "PATCH") {
      const data = await input(req);
      return json(200, await mutate(() => store.editCanvasNote(project, data)));
    }
  }

  throw new Problem(404, "Endpoint not found.");
}
