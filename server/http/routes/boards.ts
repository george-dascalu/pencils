import { Problem } from "../../problem.js";
import { input, displayName } from "../helpers.js";
import type { RequestContext } from "../contracts.js";

export async function boardsRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    auth,
    rooms,
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
  if (kind === "boards" && id && parts.length === 6) {
    const action = parts[5],
      actor = !auth.enabled ? displayName(req) : user.name || user.username;
    if (action === "presence") {
      await store.read(store.file(project, "boards", id));
      for (const [key, room] of rooms) {
        for (const [client, member] of room)
          if (Date.now() - member.seen > 15000) room.delete(client);
        if (!room.size) rooms.delete(key);
      }
      const roomKey = `${project}/${id}`;
      if (!rooms.has(roomKey)) rooms.set(roomKey, new Map());
      const room = rooms.get(roomKey)!,
        now = Date.now();
      for (const [key, member] of room)
        if (now - member.seen > 15000) room.delete(key);
      if (method === "POST") {
        const data = await input(req);
        if (
          typeof data.client !== "string" ||
          !/^[-\w]{1,100}$/.test(data.client)
        )
          throw new Problem(400, "Invalid participant.");
        if (room.size >= 100 && !room.has(data.client))
          throw new Problem(429, "This board has 100 active participants.");
        if (data.leave) room.delete(data.client);
        else
          room.set(data.client, {
            client: data.client,
            name: String(
              user.username === "shared"
                ? data.name || "Guest"
                : user.name || user.username,
            ).slice(0, 60),
            x: Number.isFinite(data.x) ? data.x : 0,
            y: Number.isFinite(data.y) ? data.y : 0,
            selection: Array.isArray(data.selection)
              ? data.selection
                  .filter((v) => typeof v === "string")
                  .slice(0, 100)
              : [],
            camera:
              data.camera &&
              ["x", "y", "z"].every((k) => Number.isFinite(data.camera[k])) &&
              data.camera.z >= 0.001 &&
              data.camera.z <= 3
                ? {
                    x: data.camera.x,
                    y: data.camera.y,
                    z: data.camera.z,
                  }
                : null,
            presenting: data.presenting === true,
            invite:
              Number.isFinite(data.invite) &&
              data.invite <= now &&
              now - data.invite < 15000
                ? data.invite
                : 0,
            seen: now,
          });
      }
      return json(200, {
        members: [...room.values()],
        version: store.version,
      });
    }
    if (action === "operations" && method === "GET")
      return json(200, {
        operations:
          (await store.read(store.file(project, "boards", id))).data
            .operations?.map(({ changes, ...operation }: { changes: unknown; [key: string]: unknown }) => operation) || [],
      });
    if (action === "undo" && method === "POST") {
      const data = await input(req);
      return json(
        200,
        await mutate(() => store.undoBoard(project, id, data, actor)),
      );
    }
    if (action === "dependency" && method === "POST") {
      const data = await input(req);
      return json(
        200,
        await mutate(() => store.boardDependency(project, id, data)),
      );
    }
  }

  throw new Problem(404, "Endpoint not found.");
}
