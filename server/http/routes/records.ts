import { Problem } from "../../problem.js";
import { input, displayName } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

export async function recordsRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    auth,
    req,
    method,
    parts,
    project,
    kind,
    id,
    user,
    json,
    mutate,
  } = ctx;
  if (
    kind === "tasks" &&
    id &&
    parts.length === 6 &&
    parts[5] === "restore" &&
    method === "POST"
  ) {
    return json(200, await mutate(() => store.restoreTask(project, id)));
  }
  if (
    parts.length === 4 &&
    method === "POST" &&
    ["tasks", "boards"].includes(kind)
  ) {
    const data = await input(req);
    return json(
      201,
      await mutate(() =>
        kind === "tasks"
          ? store.createTask(project, data)
          : store.createBoard(project, data),
      ),
    );
  }
  if (parts.length === 5 && ["tasks", "boards"].includes(kind)) {
    if (method === "GET") {
      const file = store.file(project, kind, id);
      return json(200, store.public(await store.read(file), file));
    }
    const data = await input(req);
    if (method === "PATCH")
      return json(
        200,
        await mutate(() =>
          kind === "tasks"
            ? store.updateTask(project, id, data)
            : store.updateBoard(
                project,
                id,
                data,
                !auth.enabled ? displayName(req) : user.name || user.username,
              ),
        ),
      );
    if (method === "DELETE")
      return json(
        200,
        await mutate(() =>
          kind === "tasks"
            ? store.deleteTask(project, id, data.revision)
            : store.removeRecord(project, kind, id, data.revision),
        ),
      );
  }
  throw new Problem(404, "Endpoint not found.");
}
