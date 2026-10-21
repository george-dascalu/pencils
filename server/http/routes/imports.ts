import { Problem } from "../../problem.js";
import { input } from "../helpers.js";
import type { RequestContext, Input } from "../contracts.js";

export async function importsRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    auth,
    sources,
    miro,
    automations,
    index,
    req,
    url,
    method,
    write,
    parts,
    project,
    kind,
    id,
    user,
    json,
    mutate,
    authorizeWrite,
  } = ctx;
  if (kind === "miro") {
    if (method === "GET" && !id) return json(200, miro.status(project, user));
    if (method === "GET" && id === "boards")
      return json(200, await miro.boards(project, user));
    if (method === "POST") {
      const data = await input(req);
      if (id === "authorize")
        return json(200, await miro.authorize(project, user));
      if (id === "connect")
        return json(200, await miro.connect(project, user, data.token));
      if (id === "disconnect") return json(200, miro.disconnect(project, user));
      if (id === "preview")
        return json(200, await miro.preview(project, user, data));
      if (id === "import") {
        const result = await mutate(() => miro.commit(project, user, data));
        miro.completed(project, user, data, result);
        return json(201, result);
      }
    }
    throw new Problem(404, "Miro import action not found.");
  }
  if (kind === "automations") {
    if (method === "GET") return json(200, await automations.list(project));
    if (method === "POST") {
      const data = await input(req);
      return json(
        200,
        await mutate(() =>
          id
            ? automations.run(project, id, data)
            : automations.configure(project, data.rules, user),
        ),
      );
    }
  }
  if (kind === "delta" && method === "GET")
    return json(
      200,
      await store.delta(project, Number(url.searchParams.get("since"))),
    );
  if (kind === "query" && method === "POST") {
    const data = await input(req);
    return json(200, await index.query(project, data, user));
  }
  if (kind === "sources") {
    auth.admin(user);
    return sources.run(project, async () => {
      if (method !== "GET") await authorizeWrite();
      if (method === "GET" && !id)
        return json(200, await sources.list(project));
      if (method === "POST" && !id) {
        await input(req);
        return json(
          201,
          await mutate(() =>
            sources.configure(project, user, req.pencilsInput),
          ),
        );
      }
      if (method === "PATCH" && id) {
        await input(req);
        return json(
          200,
          await mutate(() =>
            sources.configure(project, user, req.pencilsInput, id),
          ),
        );
      }
      if (method === "POST" && id) {
        const data = await input(req),
          action = parts[5];
        if (action === "authorize")
          return json(200, await sources.authorize(project, id, user));
        if (action === "resources")
          return json(200, await sources.resources(project, id));
        if (action === "preview") {
          const result: Input = await sources.preview(project, id);
          delete result.records;
          return json(200, result);
        }
        if (action === "sync")
          return json(200, await sources.sync(project, id, mutate));
        if (action === "resolve")
          return json(
            200,
            await mutate(() => sources.resolve(project, id, data)),
          );
        if (action === "disconnect")
          return json(200, await sources.disconnect(project, id));
        if (action === "write")
          return json(200, await sources.writeback(project, id, data));
      }
      throw new Problem(404, "Source action not found.");
    });
  }
  if (kind === "import" && method === "POST") {
    const data = await input(req);
    return json(201, await mutate(() => store.importNotes(project, data)));
  }

  throw new Problem(404, "Endpoint not found.");
}
