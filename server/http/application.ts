import { APP_VERSION } from "../../public/app-version.js";
import { BOARD_LIMITS } from "../../public/board-limits.js";
import Fastify, {
  type FastifyInstance,
  type FastifyRequest,
  type FastifyReply,
  type HTTPMethods,
} from "fastify";
import http from "node:http";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import { fileURLToPath } from "node:url";
import { Auth } from "../auth.js";
import { Sources, sourceAccess } from "../sources.js";
import { MiroImport } from "../miro-import.js";
import { Automations } from "../automations.js";
import { RecordIndex } from "../record-index.js";
import { Diagnostics } from "../diagnostics.js";
import { Problem } from "../problem.js";
import { staticAssets } from "../static-assets.js";
import { BACKUP_BYTES } from "../../public/backup-limits.js";
import { authorizeWrite } from "./access.js";
import { mime } from "./helpers.js";
import type {
  Handler,
  LegacyService,
  RequestContext,
  Services,
} from "./contracts.js";
import { authenticationRoutes } from "./routes/authentication.js";
import { workspaceRoutes } from "./routes/workspace.js";
import { projectsRoutes } from "./routes/projects.js";
import { importsRoutes } from "./routes/imports.js";
import { documentsRoutes } from "./routes/documents.js";
import { boardsRoutes } from "./routes/boards.js";
import { attachmentsRoutes } from "./routes/attachments.js";
import { recordsRoutes } from "./routes/records.js";

interface ServerOptions {
  auth?: LegacyService;
  sources?: Record<string, unknown>;
  miro?: Record<string, unknown>;
  tls?: https.ServerOptions;
  productionAssets?: boolean;
}
const methods: HTTPMethods[] = ["GET", "POST", "PATCH", "DELETE"];
const objectBody = { type: "object", additionalProperties: true };
const documentBody = {
  ...objectBody,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 300 },
    body: { type: "string", maxLength: 200_000 },
    revision: { type: "string" },
    folder: { type: ["string", "null"] },
  },
};
const taskBody = {
  ...documentBody,
  properties: {
    ...documentBody.properties,
    priority: { enum: ["none", "low", "medium", "high", "urgent", null] },
  },
};

export function createServer(
  store: LegacyService,
  options: ServerOptions = {},
) {
  const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
  const vendor = Object.fromEntries(
    Object.entries({
      "/vendor/turndown.js": "turndown/lib/turndown.browser.es.js",
      "/vendor/turndown-gfm.js":
        "turndown-plugin-gfm/lib/turndown-plugin-gfm.browser.es.js",
      "/vendor/marked.js": "marked/lib/marked.esm.js",
      "/vendor/purify.js": "dompurify/dist/purify.es.mjs",
    }).map(([key, file]) => [
      key,
      new URL(`../../node_modules/${file}`, import.meta.url),
    ]),
  );
  const serveAsset = staticAssets({
    publicDir: publicDir.replace(/\/$/, ""),
    builtDir: fileURLToPath(new URL("../../dist/public", import.meta.url)),
    vendor,
    mime,
    production:
      options.productionAssets ?? process.env.NODE_ENV === "production",
  });
  const auth = options.auth || new Auth(store);
  const services: Services = {
    store,
    auth,
    sources: new Sources(store, auth, options.sources),
    miro: new MiroImport(store, auth, options.miro),
    automations: new Automations(store, auth),
    index: new RecordIndex(store),
    diagnostics: new Diagnostics(),
    rooms: new Map(),
  };
  store.watch();
  services.sources.start();
  store.automations = services.automations;
  // Keep the Node server interface used by tools/tests. Requests wait for Fastify
  // registration even when callers use server.listen() directly.
  let ready: Promise<unknown>;
  const app = Fastify({
    bodyLimit: 2_000_000,
    exposeHeadRoutes: false,
    ajv: {
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
      },
    },
    serverFactory(handler) {
      const dispatch: http.RequestListener = (req, res) => {
        ready.then(
          () => handler(req, res),
          () => {
            res.writeHead(503);
            res.end("The server is starting.");
          },
        );
      };
      return options.tls
        ? https.createServer(options.tls, dispatch)
        : http.createServer(dispatch);
    },
  });
  // Preserve empty JSON writes used by restore/logout, with Fastify's body limits
  // and prototype-poisoning checks. ZIP imports stay streamed and explicitly bounded.
  const parseJSON = app.getDefaultJsonParser("error", "error");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      parseJSON(req, String(body || "{}"), done);
    },
  );
  app.addContentTypeParser("application/zip", (_req, stream, done) =>
    done(null, stream),
  );
  app.addHook("onRequest", async (request, reply) => {
    const req = request.raw;
    const headers = securityHeaders(req);
    reply.headers(headers);
    const started = performance.now();
    reply.raw.once("finish", () => {
      if (request.url.startsWith("/api/"))
        services.diagnostics.request(
          request.url.split("?")[0],
          performance.now() - started,
          reply.raw.statusCode,
        );
    });
    if (!request.url.startsWith("/api/")) return;
    if (!methods.includes(request.method as HTTPMethods))
      throw new Problem(405, "Method not allowed.");
    if (request.method !== "GET") {
      const type = req.headers["content-type"] || "";
      if (
        !type.startsWith("application/json") &&
        !(
          request.url.split("?")[0] === "/api/backups/upload" &&
          request.method === "POST" &&
          type === "application/zip"
        )
      )
        throw new Problem(415, "Use application/json.");
      if (req.headers.origin) {
        let host: string;
        try {
          host = new URL(req.headers.origin).host;
        } catch {
          throw new Problem(403, "Cross-origin writes are not allowed.");
        }
        if (host !== req.headers.host)
          throw new Problem(403, "Cross-origin writes are not allowed.");
      }
    }
  });
  app.setErrorHandler((error: any, _request, reply) => {
    const status = error.status || error.statusCode || 500;
    if (status >= 500) console.error(error);
    reply
      .code(status)
      .header("Cache-Control", "no-store")
      .send({
        error:
          status >= 500
            ? "The server could not complete this request. Check the server logs and vault permissions."
            : error.validation
              ? "Invalid request: " + error.message
              : error.message,
      });
  });
  const wrap =
    (handler: Handler, publicRoute = false) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const req = request.raw as RequestContext["req"];
      req.pencilsInput = request.body as RequestContext["req"]["pencilsInput"];
      const url = new URL(request.url, "http://localhost");
      const parts = url.pathname.split("/").filter(Boolean);
      const [, resource, project, kind, id] = parts;
      const user = await auth.user(req);
      if (!publicRoute && !user)
        throw new Problem(401, "Please sign in to continue.");
      const ctx: RequestContext = {
        ...services,
        request,
        reply,
        req,
        res: reply.raw,
        url,
        parts,
        resource,
        project,
        kind,
        id,
        user,
        method: request.method,
        write: request.method !== "GET",
        headers: securityHeaders(req),
        json: (status, data) =>
          reply.code(status).header("Cache-Control", "no-store").send(data),
        bytes: (data, type, extra = {}) =>
          reply
            .code(200)
            .header("Cache-Control", "no-store")
            .headers(extra)
            .type(type)
            .send(data),
        authorizeWrite: () => authorizeWrite(ctx),
        mutate: (fn) =>
          store.mutate(async () => {
            await authorizeWrite(ctx);
            return fn();
          }),
      };
      if (resource === "projects" && project) {
        const record = await store.read(store.file(project, "project"));
        auth.require(
          user,
          record.data.organisation,
          ctx.write && parts[5] !== "presence" && kind !== "query",
        );
        if (!sourceAccess(user, record.data))
          throw new Problem(403, "This project contains private source data.");
      }
      await handler(ctx);
      // SSE and streamed redirects deliberately use the raw response.
      if (reply.raw.headersSent && !reply.sent) reply.hijack();
      return reply;
    };
  function route(
    urls: string[],
    handler: Handler,
    publicRoute = false,
    bodyLimit = 2_000_000,
    body = objectBody,
  ) {
    for (const url of urls)
      for (const method of methods)
        app.route({
          method,
          url,
          bodyLimit,
          schema:
            method === "GET" || url === "/api/backups/upload"
              ? undefined
              : { body },
          handler: wrap(handler, publicRoute),
        });
  }
  app.get("/api/health", async (_req, reply) => reply.header("Cache-Control", "no-store").send({ ok: true, version: APP_VERSION }));
  route(
    ["/api/session", "/api/miro-callback", "/api/source-callback/:provider"],
    authenticationRoutes,
    true,
  );
  route(
    [
      "/api/accounts",
      "/api/diagnostics",
      "/api/search",
      "/api/changes",
      "/api/events",
      "/api/overview",
      "/api/personal",
      "/api/history",
      "/api/trash",
      "/api/organisations",
      "/api/organisations/:organisation",
      "/api/backups",
      "/api/backups/:backup",
      "/api/backups/:backup/:action",
    ],
    workspaceRoutes,
  );
  route(["/api/backups/upload"], workspaceRoutes, false, BACKUP_BYTES);
  route(
    ["/api/projects", "/api/projects/:project", "/api/demo"],
    projectsRoutes,
  );
  route(
    [
      "/api/projects/:project/documents",
      "/api/projects/:project/documents/:id",
    ],
    documentsRoutes,
    false,
    2_000_000,
    documentBody,
  );
  route(["/api/projects/:project/notes"], documentsRoutes);
  route(
    [
      "/api/projects/:project/tasks",
      "/api/projects/:project/tasks/:id",
      "/api/projects/:project/tasks/:id/restore",
    ],
    recordsRoutes,
    false,
    2_000_000,
    taskBody,
  );
  route(
    ["/api/projects/:project/boards", "/api/projects/:project/boards/:id"],
    recordsRoutes,
    false,
    BOARD_LIMITS.requestBytes,
  );
  route(
    ["/api/projects/:project/boards/:id/:action"],
    boardsRoutes,
    false,
    BOARD_LIMITS.requestBytes,
  );
  route(
    [
      "/api/projects/:project/attachments",
      "/api/projects/:project/attachments/:id",
    ],
    attachmentsRoutes,
    false,
    16_000_000,
  );
  for (const kind of [
    "miro",
    "sources",
    "automations",
    "delta",
    "query",
    "import",
  ])
    route(
      [
        `/api/projects/:project/${kind}`,
        `/api/projects/:project/${kind}/:id`,
        `/api/projects/:project/${kind}/:id/:action`,
      ],
      importsRoutes,
      false,
      kind === "import" ? 16_000_000 : 2_000_000,
    );
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/"))
      throw new Problem(404, "Endpoint not found.");
    if (!["GET", "HEAD"].includes(request.method))
      throw new Problem(405, "Method not allowed.");
    if (
      !(await serveAsset(
        request.raw,
        reply.raw,
        new URL(request.url, "http://localhost").pathname,
        securityHeaders(request.raw),
      ))
    )
      throw new Problem(404, "Not found.");
    reply.hijack();
  });
  ready = Promise.resolve(app.ready());
  ready.catch((error) => app.server.emit("error", error));
  app.server.on("close", () => {
    services.miro.close();
    services.sources.close();
    services.automations.close();
    store.automations = null;
    services.index.close();
    store.close();
  });
  return app.server;
}

function securityHeaders(req: http.IncomingMessage): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    ...((req.socket as TLSSocket).encrypted
      ? { "Strict-Transport-Security": "max-age=31536000" }
      : {}),
  };
}
