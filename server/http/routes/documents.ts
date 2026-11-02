import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext, Input } from "../contracts.js";
import { readDocumentTable } from "../../document-sheets.js";

export async function documentsRoutes(ctx: RequestContext): Promise<unknown> {
  const { store, req, url, method, parts, project, kind, id, json, mutate } =
    ctx;
  if (kind === 'documents' && parts[5] === 'table' && parts.length === 6 && method === 'GET') {
    const document = await store.getDocument(project, id, { table: false });
    return json(200, await readDocumentTable(store, document, url.searchParams.get('version') || undefined));
  }
  if (kind === "documents" && parts.length <= 5) {
    if (method === "GET")
      return json(
        200,
        id
          ? await store.getDocument(project, id, { table: url.searchParams.get("table") !== "0" })
          : await store.children(project, "documents"),
      );
    const data = await input(req);
    if (method === "POST" && !id) {
      const created: Input = await mutate(() => store.createDocument(project, data));
      return json(201, created);
    }
    if (method === "PATCH" && id) {
      const after: Input = await mutate(() => store.updateDocument(project, id, data));
      return json(200, after);
    }
    if (method === "DELETE" && id) {
      const result = await mutate(() => store.removeRecord(project, "documents", id, data.revision));
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
