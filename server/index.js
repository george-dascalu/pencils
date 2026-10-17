import {Automations} from "./automations.js";
import {RecordIndex} from "./record-index.js";
import {Diagnostics} from "./diagnostics.js";
import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store, Problem } from "./store.js";
import { Auth } from "./auth.js";
import { Sources, sourceAccess } from "./sources.js";
import { randomUUID } from "node:crypto";
import { BACKUP_BYTES } from "../public/backup-limits.js";

const displayName = (req) => {
  try {
    return decodeURIComponent(
      req.headers["x-pencils-name"] || "Shared workspace",
    ).slice(0, 100);
  } catch {
    return "Shared workspace";
  }
};
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const vendor = {
  "/vendor/turndown.js": new URL(
    "../node_modules/turndown/lib/turndown.browser.es.js",
    import.meta.url,
  ),
  "/vendor/turndown-gfm.js": new URL(
    "../node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.browser.es.js",
    import.meta.url,
  ),
  "/vendor/marked.js": new URL(
    "../node_modules/marked/lib/marked.esm.js",
    import.meta.url,
  ),
  "/vendor/purify.js": new URL(
    "../node_modules/dompurify/dist/purify.es.mjs",
    import.meta.url,
  ),
};
const mime = {
  ".ttf": "font/ttf",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
async function input(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (
      size >
      (req.url.includes("/attachments") ||
      req.url.includes("/boards") ||
      req.url.endsWith("/import")
        ? 16_000_000
        : 2_000_000)
    )
      throw new Problem(413, "The request is too large.");
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    req.pencilsInput = parsed;
    return parsed;
  } catch {
    throw new Problem(400, "Expected a JSON object.");
  }
}
export function createServer(store, options = {}) {
  const auth = options.auth || new Auth(store);
  store.watch();
  const sources = new Sources(store, auth, options.sources),index=new RecordIndex(store),diagnostics=new Diagnostics();
  sources.start();
  const automations=new Automations(store,auth);store.automations=automations;
  const rooms = new Map();
  const handler = async (req, res) => {
    const started=performance.now();res.once('finish',()=>{if(req.url.startsWith('/api/'))diagnostics.request(req.url.split('?')[0],performance.now()-started,res.statusCode);});
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      ...(req.socket.encrypted
        ? { "Strict-Transport-Security": "max-age=31536000" }
        : {}),
    };
    const json = (status, data) => {
      res.writeHead(status, {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    const bytes = (content, type, extra = {}) => {
      res.writeHead(200, {
        ...headers,
        "Content-Type": type,
        "Cache-Control": "no-store",
        ...extra,
      });
      res.end(content);
    };
    try {
      const url = new URL(req.url, "http://localhost"),
        method = req.method,
        write = method !== "GET";
      if (url.pathname === "/api/health" && method === "GET")
        return json(200, { ok: true });
      if (url.pathname.startsWith("/api/")) {
        if (!["GET", "POST", "PATCH", "DELETE"].includes(method))
          throw new Problem(405, "Method not allowed.");
        if (write) {
          if (
            !(req.headers["content-type"] || "").startsWith(
              "application/json",
            ) &&
            !(
              url.pathname === "/api/backups/upload" &&
              method === "POST" &&
              req.headers["content-type"] === "application/zip"
            )
          )
            throw new Problem(415, "Use application/json.");
          if (
            req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host
          )
            throw new Problem(403, "Cross-origin writes are not allowed.");
        }
        const parts = url.pathname.split("/").filter(Boolean),
          [, resource, project, kind, id] = parts;
        const user = await auth.user(req);
        if (resource === "session" && parts.length === 2) {
          if (method === "GET")
            return json(200, { required: auth.enabled, user });
          if (method === "POST") {
            const result = await auth.login(
              await input(req),
              req.socket.remoteAddress,
            );
            res.setHeader(
              "Set-Cookie",
              `pencils_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.socket.encrypted || process.env.COOKIE_SECURE === "true" ? "; Secure" : ""}`,
            );
            return json(200, { user: result.user });
          }
          if (method === "DELETE") {
            auth.sessions.delete(auth.token(req));
            res.setHeader(
              "Set-Cookie",
              "pencils_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
            );
            return json(200, { ok: true });
          }
        }
        if(resource === "source-callback" && method === "GET") {
          const projectId=await store.mutate(()=>sources.callback(project,Object.fromEntries(url.searchParams)));
          res.writeHead(303,{...headers,"Cache-Control":"no-store",Location:`/#project/${encodeURIComponent(projectId)}/settings`});res.end();return;
        }
        if (!user) throw new Problem(401, "Please sign in to continue.");
        const mutate = (fn) =>
          store.mutate(async () => {
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
            if(resource === "projects" && kind === "sources") auth.admin(active);
            if (resource === "projects" && project) {
              const current = await store.read(store.file(project, "project"));
              auth.require(active, current.data.organisation, true);
              if(!sourceAccess(active,current.data)) throw new Problem(403,"This project contains private source data.");
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
                    : (
                        await store.read(
                          store.file(current.data.project, "project"),
                        )
                      ).data.organisation;
              auth.require(active, organisation, true);
              if (current.data.kind === "project") {
                const previous = (await store.history(data.file)).find(
                  (v) => v.revision === data.version,
                );
                if (previous)
                  auth.require(active, previous.data.organisation, true);
              }
            }
            return fn();
          });
        if (resource === "accounts") {
          auth.admin(user);
          if (method === "GET")
            return json(200, {
              accounts: (await auth.accounts()).map((u) => auth.public(u)),
            });
          if (method === "POST") {
            const data = await input(req);
            return json(200, await mutate(() => auth.save(data)));
          }
        }
        if(resource === "diagnostics"){auth.admin(user);if(method === "GET")return json(200,{...diagnostics.report(),index:index.lastRebuild,journal_conflicts:await store.journal.issues(),limits:{backup_archive_mb:220,backup_expanded_mb:200,source_records:10000}});if(method === "POST"){await input(req);return json(200,await mutate(()=>index.rebuild()));}}
        if(resource === "search" && method === "GET"){
          const projects=(await store.list()).projects.filter(p=>auth.allow(user,p.organisation)&&sourceAccess(user,p)),tasks=[];
          for(const p of projects){for(const t of await index.search(p.id,url.searchParams.get('q'),Math.max(1,60-tasks.length)))tasks.push({...t,project_title:p.title,organisation:p.organisation});if(tasks.length>=60)break;}
          return json(200,{tasks,limit:60});
        }
        if (resource === "changes" && method === "GET")
          return json(200, { version: store.version });
        if (resource === "events" && method === "GET") {
          const subscription=url.searchParams.get('project');if(subscription){const p=(await store.read(store.file(subscription,'project'))).data;auth.require(user,p.organisation);if(!sourceAccess(user,p))throw new Problem(403,"Private source project.");}
          res.writeHead(200, {
            ...headers,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          });
          const changed = (version,change={}) => {
            if(subscription && change.project && change.project!==subscription)return;
            res.write(`data: ${JSON.stringify({ version,project:change.project || null })}\n\n`);
          };
          changed(store.version);
          store.events.on("change", changed);
          const heartbeat = setInterval(
            async () => {const active=await auth.user(req);if(!active){res.end();return;}if(subscription){try{const p=(await store.read(store.file(subscription,'project'))).data;if(!auth.allow(active,p.organisation)||!sourceAccess(active,p)){res.end();return;}}catch{res.end();return;}}res.write(": heartbeat\n\n");},
            25000,
          );
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
            await store.overview((p) => auth.allow(user, p.organisation) && sourceAccess(user,p)),
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
                : (await store.read(store.file(record.data.project, "project")))
                    .data.organisation;
          auth.require(user, organisation, write);
          if(record.data.kind !== "organisation") {
            const accessProject=record.data.kind === "project"?record.data:(await store.read(store.file(record.data.project,"project"))).data;
            if(!sourceAccess(user,accessProject)) throw new Problem(403,"This project contains private source data.");
          }
          if (method === "GET")
            return json(200, { versions: await store.history(data.file) });
          if (method === "POST") {
            if (record.data.kind === "project") {
              const previous = (await store.history(data.file)).find(
                (version) => version.revision === data.version,
              );
              if (previous)
                auth.require(user, previous.data.organisation, true);
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
              return json(
                201,
                await mutate(() => store.importBackupBytes(data)),
              );
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
          if (method === "GET")
            return json(200, { backups: await store.backups() });
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
          if (method === "GET")
            return json(200, { items: await store.trash() });
          if (method === "POST") {
            const data = await input(req);
            return json(200, await mutate(() => store.restoreTrash(data.key)));
          }
        }
        if (resource === "organisations" && parts.length === 2) {
          if (method === "GET") {
            const data = await store.listOrganisations();
            return json(200, {
              organisations: data.organisations.filter((o) =>
                auth.allow(user, o.id),
              ),
              warnings: user.admin ? data.warnings : [],
            });
          }
          if (method === "POST") {
            auth.admin(user);
            const data = await input(req);
            return json(
              201,
              await mutate(() => store.createOrganisation(data)),
            );
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
        if (resource === "projects" && parts.length === 2) {
          if (method === "GET") {
            if (url.searchParams.has("organisation"))
              auth.require(user, url.searchParams.get("organisation"));
            const data = await store.list(url.searchParams.get("organisation"));
            return json(200, {
              projects: data.projects.filter((p) =>
                auth.allow(user, p.organisation) && sourceAccess(user,p),
              ),
              warnings: user.admin ? data.warnings : [],
            });
          }
          if (method === "POST") {
            const data = await input(req);
            auth.require(user, data.organisation || "o-default", true);
            return json(201, await mutate(() => store.createProject(data)));
          }
        }
        if (resource === "demo" && method === "POST") {
          const data = await input(req);
          auth.require(user, data.organisation || "o-default", true);
          return json(201, await mutate(() => store.demo(data)));
        }
        if (resource === "projects" && project) {
          const record = await store.read(store.file(project, "project"));
          auth.require(
            user,
            record.data.organisation,
            write && parts[5] !== "presence" && kind !== "query",
          );
          if(!sourceAccess(user,record.data)) throw new Problem(403,"This project contains private source data.");
          if(kind === "automations"){
            if(method === "GET")return json(200,await automations.list(project));
            if(method === "POST"){const data=await input(req);return json(200,await mutate(()=>id?automations.run(project,id,data):automations.configure(project,data.rules,user)));}
          }
          if(kind === "delta" && method === "GET")return json(200,await store.delta(project,Number(url.searchParams.get('since'))));
          if(kind === "query" && method === "POST"){const data=await input(req);return json(200,await index.query(project,data,user));}
          if(kind === "sources") {
            auth.admin(user);
            if(method === "GET" && !id)return json(200,await sources.list(project));
            if(method === "POST" && !id){await input(req);return json(201,await mutate(()=>sources.configure(project,user,req.pencilsInput)));}
            if(method === "PATCH" && id){await input(req);return json(200,await mutate(()=>sources.configure(project,user,req.pencilsInput,id)));}
            if(method === "POST" && id){const data=await input(req),action=parts[5];
              if(action === "authorize") return json(200,await mutate(()=>sources.authorize(project,id,user)));
              if(action === "resources") return json(200,await mutate(()=>sources.resources(project,id)));
              if(action === "preview"){const result=await mutate(()=>sources.preview(project,id));delete result.records;return json(200,result);}
              if(action === "sync") return json(200,await mutate(()=>sources.sync(project,id)));
              if(action === "resolve") return json(200,await mutate(()=>sources.resolve(project,id,data)));
              if(action === "disconnect") return json(200,await mutate(()=>sources.disconnect(project,id)));
              if(action === "write") return json(200,await mutate(()=>sources.writeback(project,id,data)));
            }
            throw new Problem(404,"Source action not found.");
          }
          if (parts.length === 3) {
            if (method === "GET")
              return json(200, await store.snapshot(project));
            const data = await input(req);
            if (method === "PATCH") {
              if (data.organisation)
                auth.require(user, data.organisation, true);
              return json(
                200,
                await mutate(() => store.updateProject(project, data)),
              );
            }
            if (method === "DELETE")
              return json(
                200,
                await mutate(() =>
                  store.removeRecord(project, "project", null, data.revision),
                ),
              );
          }
          if (
            kind === "tasks" &&
            id &&
            parts.length === 6 &&
            parts[5] === "restore" &&
            method === "POST"
          ) {
            return json(
              200,
              await mutate(() => store.restoreTask(project, id)),
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
                  ? await store.canvasNote(
                      project,
                      url.searchParams.get("file"),
                    )
                  : { files: await store.canvasNotes(project) },
              );
            if (method === "PATCH") {
              const data = await input(req);
              return json(
                200,
                await mutate(() => store.editCanvasNote(project, data)),
              );
            }
          }
          if (kind === "boards" && id && parts.length === 6) {
            const action = parts[5],
              actor = !auth.enabled
                ? displayName(req)
                : user.name || user.username;
            if (action === "presence") {
              await store.read(store.file(project, "boards", id));
              for (const [key, room] of rooms) {
                for (const [client, member] of room)
                  if (Date.now() - member.seen > 15000) room.delete(client);
                if (!room.size) rooms.delete(key);
              }
              const roomKey = `${project}/${id}`;
              if (!rooms.has(roomKey)) rooms.set(roomKey, new Map());
              const room = rooms.get(roomKey),
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
                  throw new Problem(
                    429,
                    "This board has 100 active participants.",
                  );
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
                      ["x", "y", "z"].every((k) =>
                        Number.isFinite(data.camera[k]),
                      ) &&
                      data.camera.z >= 0.08 &&
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
                    .operations || [],
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
          if (kind === "import" && method === "POST") {
            const data = await input(req);
            return json(
              201,
              await mutate(() => store.importNotes(project, data)),
            );
          }
          if (kind === "attachments") {
            if (method === "GET" && id) {
              const data = await store.attachment(project, id);
              return bytes(
                data.bytes,
                mime[data.ext],
                [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(data.ext)
                  ? {}
                  : { "Content-Disposition": `attachment; filename="${id}"` },
              );
            }
            if (method === "POST" && !id) {
              const data = await input(req);
              return json(201, await mutate(() => store.attach(project, data)));
            }
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
                        !auth.enabled
                          ? displayName(req)
                          : user.name || user.username,
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
        }
        throw new Problem(404, "Endpoint not found.");
      }
      if (!["GET", "HEAD"].includes(method))
        throw new Problem(405, "Method not allowed.");
      const name =
          url.pathname === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname).slice(1),
        file = path.resolve(publicDir, name);
      if (!file.startsWith(publicDir) || name.includes(".."))
        throw new Problem(404, "Not found.");
      let content;
      try {
        content = await fs.readFile(vendor[url.pathname] || file);
      } catch {
        throw new Problem(404, "Not found.");
      }
      res.writeHead(200, {
        ...headers,
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(method === "HEAD" ? undefined : content);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent)
        json(error.status || 500, {
          error: error.status
            ? error.message
            : "The server could not complete this request. Check the server logs and vault permissions.",
        });
      else res.end();
    }
  };
  const server = options.tls
    ? https.createServer(options.tls, handler)
    : http.createServer(handler);
  server.on("close", () => {sources.close();automations.close();store.automations=null;index.close();store.close();});
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = new Store(process.env.VAULT_PATH || path.resolve("vault"));
  await store.init();
  const tls =
    process.env.TLS_CERT_FILE && process.env.TLS_KEY_FILE
      ? {
          cert: await fs.readFile(process.env.TLS_CERT_FILE),
          key: await fs.readFile(process.env.TLS_KEY_FILE),
        }
      : undefined;
  const server = createServer(store, { tls });
  const port = Number(process.env.PORT || 3000),
    host = process.env.HOST || "0.0.0.0";
  server.listen(port, host, () =>
    console.log(
      `Pencils is ready at ${tls ? "https" : "http"}://localhost:${port}\nVault: ${store.root}\nListening on ${host}`,
    ),
  );
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
