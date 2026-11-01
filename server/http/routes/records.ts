import { Problem } from "../../problem.js";
import { input, displayName, audit, audited } from "../helpers.js";
import { changedFields } from "../../audit.js";
import type { RequestContext, Input } from "../contracts.js";

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
    const result = await mutate(() => store.restoreTask(project, id));
    await audit(ctx, { action: "restored", ...audited(await store.read(store.file(project, kind, id)).catch(() => ({ data: { kind: "task", id } }))) });
    return json(200, result);
  }
  if (
    parts.length === 4 &&
    method === "POST" &&
    ["tasks", "boards"].includes(kind)
  ) {
    const data = await input(req);
    const created: Input = await mutate(() =>
      kind === "tasks"
        ? store.createTask(project, data)
        : store.createBoard(project, data),
    );
    await audit(ctx, { action: "created", ...audited(created) });
    return json(201, created);
  }
  if (parts.length === 5 && ["tasks", "boards"].includes(kind)) {
    if (method === "GET") {
      const file = store.file(project, kind, id);
      return json(200, store.public(await store.read(file), file));
    }
    const data = await input(req);
    const before = await store.read(store.file(project, kind, id)).catch(() => null);
    if (method === "PATCH") {
      const after: Input = await mutate(() =>
        kind === "tasks"
          ? store.updateTask(project, id, data)
          : store.updateBoard(
              project,
              id,
              data,
              !auth.enabled ? displayName(req) : user.name || user.username,
            ),
      );
      // A save that changed nothing adds no entry: a card's fields, or a board's file.
      const fields = changedFields(before, after);
      if (fields.length || (kind === "boards" && after.revision !== before?.revision))
        await audit(ctx, { action: "edited", ...audited(after), fields });
      return json(200, after);
    }
    if (method === "DELETE") {
      const result = await mutate(() =>
        kind === "tasks"
          ? store.deleteTask(project, id, data.revision)
          : store.removeRecord(project, kind, id, data.revision),
      );
      await audit(ctx, { action: "deleted", ...audited(before) });
      return json(200, result);
    }
  }
  throw new Problem(404, "Endpoint not found.");
}
