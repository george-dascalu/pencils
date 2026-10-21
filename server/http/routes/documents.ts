import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

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
    if (method === "POST" && !id)
      return json(201, await mutate(() => store.createDocument(project, data)));
    if (method === "PATCH" && id)
      return json(
        200,
        await mutate(() => store.updateDocument(project, id, data)),
      );
    if (method === "DELETE" && id)
      return json(
        200,
        await mutate(async () => {
          await store.getDocument(project, id);
          return store.removeRecord(project, "documents", id, data.revision);
        }),
      );
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
          : { files: await store.canvasNotes(project) },
      );
    if (method === "PATCH") {
      const data = await input(req);
      return json(200, await mutate(() => store.editCanvasNote(project, data)));
    }
  }

  throw new Problem(404, "Endpoint not found.");
}
