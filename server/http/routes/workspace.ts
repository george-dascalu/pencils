import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Problem } from "../../problem.js";
import { sourceAccess } from "../../sources.js";
import { BACKUP_BYTES } from "../../../public/backup-limits.js";
import { input } from "../helpers.js";
import type { RequestContext, Input } from "../contracts.js";

export async function workspaceRoutes(ctx: RequestContext): Promise<unknown> {
  const {
    store,
    auth,
    index,
    diagnostics,
    req,
    res,
    url,
    method,
    write,
    parts,
    resource,
    project,
    kind,
    id,
    user,
    headers,
    json,
    bytes,
    mutate,
  } = ctx;
  if (resource === "accounts") {
    auth.admin(user);
    if (method === "GET")
      return json(200, {
        accounts: (await auth.accounts()).map((u: Input) => auth.public(u)),
      });
    if (method === "POST") {
      const data = await input(req);
      return json(200, await mutate(() => auth.save(data)));
    }
  }
  if (resource === "diagnostics") {
    auth.admin(user);
    if (method === "GET")
      return json(200, {
        ...diagnostics.report(),
        index: index.lastRebuild,
        journal_conflicts: await store.journal.issues(),
        limits: {
          backup_archive_mb: 220,
          backup_expanded_mb: 200,
          source_records: 10000,
        },
      });
    if (method === "POST") {
      await input(req);
      return json(200, await mutate(() => index.rebuild()));
    }
  }
  if (resource === "search" && method === "GET") {
    const projects = (await store.list()).projects.filter(
        (p: Input) => auth.allow(user, p.organisation) && sourceAccess(user, p),
      ),
      tasks = [];
    for (const p of projects) {
      for (const t of await index.search(
        p.id,
        url.searchParams.get("q"),
        Math.max(1, 60 - tasks.length),
      ))
        tasks.push({
          ...t,
          project_title: p.title,
          organisation: p.organisation,
        });
      if (tasks.length >= 60) break;
    }
    return json(200, { tasks, limit: 60 });
  }
  if (resource === "changes" && method === "GET")
    return json(200, { version: store.version });
  if (resource === "events" && method === "GET") {
    const subscription = url.searchParams.get("project");
    if (subscription) {
      const p = (await store.read(store.file(subscription, "project"))).data;
      auth.require(user, p.organisation);
      if (!sourceAccess(user, p))
        throw new Problem(403, "Private source project.");
    }
    res.writeHead(200, {
      ...headers,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    const changed = (version: number, change: { project?: string } = {}) => {
      if (subscription && change.project && change.project !== subscription)
        return;
      res.write(
        `data: ${JSON.stringify({ version, project: change.project || null })}\n\n`,
      );
    };
    changed(store.version);
    store.events.on("change", changed);
    const heartbeat = setInterval(async () => {
      const active = await auth.user(req);
      if (!active) {
        res.end();
        return;
      }
      if (subscription) {
        try {
          const p = (await store.read(store.file(subscription, "project")))
            .data;
          if (!auth.allow(active, p.organisation) || !sourceAccess(active, p)) {
            res.end();
            return;
          }
        } catch {
          res.end();
          return;
        }
      }
      res.write(": heartbeat\n\n");
    }, 25000);
    heartbeat.unref();
    req.on("close", () => {
      clearInterval(heartbeat);
      store.events.off("change", changed);
    });
    return;
  }
  if (resource === "overview" && method === "GET")
    return json(
      200,
      await store.overview(
        (p: Input) => auth.allow(user, p.organisation) && sourceAccess(user, p),
      ),
    );
  if (resource === "history") {
    const data = write
        ? await input(req)
        : Object.fromEntries(url.searchParams),
      file = store.resolveFile(data.file),
      record = await store.read(file);
    const organisation =
      record.data.kind === "organisation"
        ? record.data.id
        : record.data.kind === "project"
          ? record.data.organisation
          : (await store.read(store.file(record.data.project, "project"))).data
              .organisation;
    auth.require(user, organisation, write);
    if (record.data.kind !== "organisation") {
      const accessProject =
        record.data.kind === "project"
          ? record.data
          : (await store.read(store.file(record.data.project, "project"))).data;
      if (!sourceAccess(user, accessProject))
        throw new Problem(403, "This project contains private source data.");
    }
    if (method === "GET")
      return json(200, { versions: await store.history(data.file) });
    if (method === "POST") {
      if (record.data.kind === "project") {
        const previous = (await store.history(data.file)).find(
          (version: Input) => version.revision === data.version,
        );
        if (previous) auth.require(user, previous.data.organisation, true);
      }
      return json(
        200,
        await mutate(() =>
          store.restoreVersion(data.file, data.version, data.revision),
        ),
      );
    }
  }
  if (resource === "backups") {
    auth.admin(user);
    if (method === "POST" && project === "upload") {
      const folder = path.join(store.root, ".uploads");
      await store.safe(folder);
      await fs.mkdir(folder, { recursive: true });
      const file = path.join(folder, `${randomUUID()}.zip`);
      const handle = await fs.open(file, "wx", 0o600);
      try {
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > BACKUP_BYTES)
            throw new Problem(413, "Upload a backup ZIP up to 220 MB.");
          await handle.writeFile(chunk);
        }
        await handle.close();
        const data = await fs.readFile(file);
        return json(201, await mutate(() => store.importBackupBytes(data)));
      } finally {
        await handle.close();
        await fs.rm(file, { force: true });
      }
    }
    if (method === "POST" && kind === "verify")
      return json(200, await store.verifyBackup(project));
    if (method === "POST" && project === "import") {
      const data = await input(req);
      return json(201, await mutate(() => store.importBackup(data)));
    }
    if (method === "GET" && project)
      return bytes(await store.backupBytes(project), "application/zip", {
        "Content-Disposition": `attachment; filename="pencils-${project}.zip"`,
      });
    if (method === "GET") return json(200, { backups: await store.backups() });
    if (method === "POST") {
      await input(req);
      return json(
        201,
        await mutate(() =>
          project ? store.restoreBackup(project) : store.createBackup(),
        ),
      );
    }
  }
  if (resource === "trash") {
    auth.admin(user);
    if (method === "GET") return json(200, { items: await store.trash() });
    if (method === "POST") {
      const data = await input(req);
      return json(200, await mutate(() => store.restoreTrash(data.key)));
    }
  }
  if (resource === "organisations" && parts.length === 2) {
    if (method === "GET") {
      const data = await store.listOrganisations();
      return json(200, {
        organisations: data.organisations.filter((o: Input) =>
          auth.allow(user, o.id),
        ),
        warnings: user.admin ? data.warnings : [],
      });
    }
    if (method === "POST") {
      auth.admin(user);
      const data = await input(req);
      return json(201, await mutate(() => store.createOrganisation(data)));
    }
  }
  if (resource === "organisations" && parts.length === 3) {
    auth.require(user, project, write);
    if (method === "GET")
      return json(200, await store.getOrganisation(project));
    if (method === "PATCH") {
      const data = await input(req);
      return json(
        200,
        await mutate(() => store.updateOrganisation(project, data)),
      );
    }
  }

  throw new Problem(404, "Endpoint not found.");
}
