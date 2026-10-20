import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { Problem } from "./problem.js";
import { schema } from "./model.js";
import { sourceAccess } from "./sources.js";
import { convertMiro, miroBoardId, miroId } from "./miro-convert.js";
import { encodeCanvas } from "../public/canvas-format.js";
import { membersForProject } from "./teams.js";
import { initialStatus, statusLabel } from "../public/workflow-model.js";
import { hierarchyError } from "../public/hierarchy-model.js";

const API = "https://api.miro.com";
const endpoints = {
  text: "texts",
  shape: "shapes",
  sticky_note: "sticky_notes",
  frame: "frames",
  card: "cards",
  app_card: "app_cards",
  image: "images",
  document: "documents",
  embed: "embeds",
};
const ownerKey = (project, user) => `${project}:${user.username}`;
const TTL = 30 * 60 * 1000;
const imageExt = (b) =>
  b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? ".png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? ".jpg"
      : /^GIF8[79]a/.test(b.subarray(0, 6).toString())
        ? ".gif"
        : b.subarray(0, 4).toString() === "RIFF" &&
            b.subarray(8, 12).toString() === "WEBP"
          ? ".webp"
          : null;
async function bounded(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > limit)
      throw new Problem(413, "Miro content exceeds the import size limit.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function pool(values, fn) {
  let cursor = 0,
    failed = null;
  await Promise.all(
    Array.from({ length: Math.min(3, values.length) }, async () => {
      while (!failed && cursor < values.length) {
        const i = cursor++;
        try {
          await fn(values[i], i);
        } catch (error) {
          failed ||= error;
        }
      }
    }),
  );
  if (failed) throw failed;
}
export class MiroImport {
  constructor(store, auth, options = {}) {
    this.store = store;
    this.auth = auth;
    this.fetch = options.fetch || fetch;
    this.env = options.env || process.env;
    this.grants = new Map();
    this.states = new Map();
    this.previews = new Map();
    this.busy = new Set();
    this.timer = setInterval(() => this.prune(), 60000);
    this.timer.unref();
  }
  close() {
    clearInterval(this.timer);
    this.grants.clear();
    this.previews.clear();
    this.states.clear();
  }
  prune() {
    for (const map of [this.grants, this.states, this.previews])
      for (const [k, v] of map) if (v.expires < Date.now()) map.delete(k);
  }
  async access(project, user) {
    if (!this.auth.enabled)
      throw new Problem(
        403,
        "Use local automatic sign-in or a signed-in account to import from Miro.",
      );
    const record = await this.store.read(this.store.file(project, "project"));
    this.auth.require(user, record.data.organisation, true);
    if (!sourceAccess(user, record.data))
      throw new Problem(403, "You do not have access to this project.");
    return record.data;
  }
  oauth() {
    const origin = new URL(this.env.APP_ORIGIN || "http://localhost");
    if (
      !this.env.MIRO_CLIENT_ID ||
      !this.env.MIRO_CLIENT_SECRET ||
      !this.env.APP_ORIGIN
    )
      throw new Problem(
        400,
        "Configure MIRO_CLIENT_ID, MIRO_CLIENT_SECRET and APP_ORIGIN, or use a temporary access token.",
      );
    if (
      origin.protocol !== "https:" &&
      !(
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      )
    )
      throw new Problem(
        400,
        "Miro sign-in requires HTTPS or a localhost callback.",
      );
    return {
      redirect: `${origin.origin}/api/miro-callback`,
      client: this.env.MIRO_CLIENT_ID,
      secret: this.env.MIRO_CLIENT_SECRET,
    };
  }
  status(project, user) {
    this.prune();
    return {
      connected: this.grants.has(ownerKey(project, user)),
      oauth: !!(
        this.env.MIRO_CLIENT_ID &&
        this.env.MIRO_CLIENT_SECRET &&
        this.env.APP_ORIGIN
      ),
      authenticated: this.auth.enabled,
    };
  }
  async authorize(project, user) {
    await this.access(project, user);
    this.prune();
    if (this.states.size >= 50)
      throw new Problem(
        429,
        "Too many Miro sign-in attempts. Try again shortly.",
      );
    const oauth = this.oauth(),
      state = randomBytes(32).toString("base64url");
    this.states.set(state, {
      project,
      user: user.username,
      expires: Date.now() + 600000,
    });
    return {
      url: `https://miro.com/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: oauth.client, redirect_uri: oauth.redirect, scope: "boards:read", state })}`,
    };
  }
  async callback(query) {
    const pending = this.states.get(query.state);
    this.states.delete(query.state);
    if (!pending || pending.expires < Date.now() || !query.code || query.error)
      throw new Problem(
        400,
        "Miro sign-in expired or was cancelled. Reconnect from Import from Miro.",
      );
    const user = (await this.auth.accounts()).find(
      (u) => u.username === pending.user,
    );
    if (!user) throw new Problem(403, "This account no longer has access.");
    await this.access(pending.project, user);
    const oauth = this.oauth();
    const token = await this.request(`${API}/v1/oauth/token`, "", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: oauth.client,
        client_secret: oauth.secret,
        redirect_uri: oauth.redirect,
        code: query.code,
      }).toString(),
    });
    if (
      !token.access_token ||
      (token.scope &&
        !String(token.scope).split(/[ ,]/).includes("boards:read"))
    )
      throw new Problem(
        403,
        "The Miro app needs boards:read permission. Update its permissions and reconnect.",
      );
    this.grants.set(ownerKey(pending.project, user), {
      token: token.access_token,
      expires:
        Date.now() + Math.min(TTL, (Number(token.expires_in) || 3600) * 1000),
    });
  }
  async connect(project, user, token) {
    await this.access(project, user);
    if (
      typeof token !== "string" ||
      token.length < 8 ||
      token.length > 4096 ||
      /\s/.test(token)
    )
      throw new Problem(
        400,
        "Enter a valid Miro access token with boards:read permission.",
      );
    await this.request(`${API}/v2/boards?limit=1`, token);
    this.grants.set(ownerKey(project, user), {
      token,
      expires: Date.now() + TTL,
    });
    return this.status(project, user);
  }
  disconnect(project, user) {
    const owner = ownerKey(project, user);
    this.grants.delete(owner);
    for (const [id, p] of this.previews)
      if (p.owner === owner && !p.result) this.previews.delete(id);
    for (const [id, p] of this.states)
      if (p.project === project && p.user === user.username)
        this.states.delete(id);
    return { connected: false };
  }
  token(project, user) {
    this.prune();
    const grant = this.grants.get(ownerKey(project, user));
    if (!grant)
      throw new Problem(
        401,
        "Miro connection expired. Connect again to read the board.",
      );
    return grant.token;
  }
  async response(url, token, options = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(25000),
        ...options,
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Problem(
        502,
        "Could not reach Miro. Check the connection and try again.",
      );
    }
    if (response.status === 429)
      throw new Problem(
        429,
        `Miro's rate limit was reached. Retry in ${Math.min(3600, Math.max(1, Number(response.headers.get("retry-after")) || 60))} seconds.`,
      );
    if (response.status === 401 || response.status === 403)
      throw new Problem(
        403,
        "Miro access was denied. Check boards:read permission and access to this board, then reconnect.",
      );
    if (response.status === 404)
      throw new Problem(
        404,
        "The Miro board or item is unavailable. Check its link and your access.",
      );
    if (!response.ok && response.status !== 307 && response.status !== 302)
      throw new Problem(
        502,
        "Miro could not complete the request. Please try again.",
      );
    return response;
  }
  async request(url, token, options) {
    const response = await this.response(url, token, options);
    if (!response.ok)
      throw new Problem(502, "Miro returned an unexpected redirect.");
    try {
      return JSON.parse((await bounded(response, 12000000)).toString());
    } catch (e) {
      if (e.status) throw e;
      throw new Problem(502, "Miro returned an invalid response.");
    }
  }
  async pages(url, token, max = 10000, offset = false) {
    const all = [],
      seen = new Set();
    let cursor = "",
      count = 0;
    do {
      const u = new URL(url);
      u.searchParams.set("limit", "50");
      if (cursor) u.searchParams.set(offset ? "offset" : "cursor", cursor);
      const page = await this.request(u.href, token);
      if (!Array.isArray(page.data))
        throw new Problem(502, "Miro returned an invalid list.");
      all.push(...page.data);
      count++;
      if (all.length > max || count > 600)
        throw new Problem(
          413,
          "This Miro board exceeds the import limit. Split it into smaller boards.",
        );
      cursor = offset
        ? all.length < page.total
          ? String(all.length)
          : ""
        : page.cursor || "";
      if (cursor && (!page.data.length || seen.has(cursor)))
        throw new Problem(502, "Miro pagination did not advance. Try again.");
      seen.add(cursor);
    } while (cursor);
    return all;
  }
  async boards(project, user) {
    await this.access(project, user);
    const data = await this.request(
      `${API}/v2/boards?limit=50`,
      this.token(project, user),
    );
    return {
      boards: (data.data || []).map((b) => ({ id: b.id, name: b.name })),
      more: !!data.cursor,
    };
  }
  async media(item, board, token) {
    const raw = item.data?.imageUrl || item.data?.documentUrl;
    let url;
    try {
      url = new URL(raw);
    } catch {
      throw new Problem(400, "No downloadable media URL was provided.");
    }
    const prefix = `/v2/boards/${board}/resources/`;
    if (
      url.origin !== API ||
      !decodeURIComponent(url.pathname).startsWith(prefix)
    )
      throw new Problem(400, "Media URL is not a Miro board resource.");
    url.searchParams.set("redirect", "false");
    if (item.type === "image") url.searchParams.set("format", "original");
    for (let redirects = 0; redirects < 5; redirects++) {
      const apiResource =
        url.origin === API &&
        decodeURIComponent(url.pathname).startsWith(prefix);
      const trusted = [
        "miro.com",
        "mirostatic.com",
        "mirostatic.net",
        "realtimeboard.com",
        "amazonaws.com",
        "cloudfront.net",
      ].some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`));
      if (
        url.protocol !== "https:" ||
        (url.port && url.port !== "443") ||
        url.username ||
        url.password ||
        !trusted ||
        (url.origin === API && !apiResource)
      )
        throw new Problem(
          400,
          "Media download host is not supported. A source link will be kept.",
        );
      const response = await this.response(url.href, apiResource ? token : "");
      if ([302, 307].includes(response.status)) {
        url = new URL(response.headers.get("location"), url);
        await response.body?.cancel();
        continue;
      }
      if (
        apiResource &&
        response.headers.get("content-type")?.includes("json")
      ) {
        const data = JSON.parse((await bounded(response, 100000)).toString());
        url = new URL(data.url);
        continue;
      }
      const bytes = await bounded(response, 10000000);
      let ext = imageExt(bytes);
      if (item.type === "document" && !ext) {
        if (bytes.subarray(0, 5).toString() === "%PDF-") ext = ".pdf";
        else if (
          /\.(txt|md|csv)$/i.test(item.data?.title || "") &&
          !bytes.includes(0)
        )
          ext = path.extname(item.data.title).toLowerCase();
      }
      if (!ext)
        throw new Problem(
          400,
          "Media format is unsupported; the original remains available through its Miro link.",
        );
      return { path: `attachments/a-${randomUUID()}${ext}`, bytes };
    }
    throw new Problem(
      400,
      "Too many media redirects. A source link will be kept.",
    );
  }
  async load(project, user, input) {
    const token = this.token(project, user),
      id = miroBoardId(input.board);
    const base = `${API}/v2/boards/${encodeURIComponent(id)}`;
    const board = await this.request(base, token);
    board.id = id;
    const items = await this.pages(`${base}/items`, token, 9500);
    const connectors = await this.pages(`${base}/connectors`, token, 19000);
    const issues = [],
      assets = {};
    let members = [];
    await pool(items, async (item, i) => {
      const endpoint = endpoints[item.type];
      if (!endpoint) return;
      try {
        items[i] = {
          ...item,
          ...(await this.request(
            `${base}/${endpoint}/${encodeURIComponent(item.id)}`,
            token,
          )),
        };
      } catch (e) {
        if ([403, 429, 502].includes(e.status)) throw e;
        issues.push({
          id: String(item.id),
          kind: "converted",
          message:
            "Object details were unavailable; available text and position are retained.",
        });
      }
    });
    if (items.some((i) => i.data?.assigneeId)) {
      try {
        members = await this.pages(`${base}/members`, token, 10000, true);
      } catch (e) {
        if (e.status === 429) throw e;
        issues.push({
          kind: "converted",
          message:
            "Miro member names were unavailable. Match assignees manually.",
        });
      }
    }
    let bytes = 0;
    await pool(
      items.filter((i) => ["image", "document"].includes(i.type)),
      async (item) => {
        try {
          const asset = await this.media(item, id, token);
          bytes += asset.bytes.length;
          if (bytes > 50000000)
            throw new Problem(
              413,
              "Imported media exceeds 50 MB. Split this Miro board into smaller boards.",
            );
          assets[item.id] = asset;
        } catch (e) {
          if ([429, 413].includes(e.status)) throw e;
          item.mediaError = e.message;
        }
      },
    );
    return { project, board, items, connectors, members, issues, assets };
  }
  async preview(project, user, input) {
    const projectData = await this.access(project, user),
      owner = ownerKey(project, user);
    this.prune();
    if (this.busy.has(owner))
      throw new Problem(409, "A Miro read is already in progress.");
    this.busy.add(owner);
    try {
      let p = input.preview ? this.previews.get(input.preview) : null;
      if (input.preview && (!p || p.owner !== owner || p.result))
        throw new Problem(
          410,
          "This preview expired. Load the Miro board again.",
        );
      if (!p) {
        if (this.previews.size >= 8)
          throw new Problem(
            429,
            "Too many import previews. Disconnect to clear your pending previews, or try again later.",
          );
        p = {
          id: randomUUID(),
          owner,
          snapshot: await this.load(project, user, input),
          expires: Date.now() + TTL,
        };
      }
      const org = await this.store.getOrganisation(projectData.organisation);
      const people = membersForProject(projectData, org).filter(
        (person) => !person.archived,
      );
      const config = schema(projectData.schema);
      const opts = {
        frames: input.frames ?? null,
        cards: input.cards || "draft",
        status: input.status,
        type: input.type,
        assignees: input.assignees || {},
        destination: input.destination || "",
        title: String(
          input.title || p.snapshot.board.name || "Imported Miro board",
        )
          .trim()
          .slice(0, 300),
      };
      if (
        !["draft", "tasks"].includes(opts.cards) ||
        (!Array.isArray(opts.frames) && opts.frames !== null) ||
        typeof opts.assignees !== "object" ||
        Array.isArray(opts.assignees)
      )
        throw new Problem(400, "Invalid Miro import options.");
      for (const person of Object.values(opts.assignees))
        if (person && !people.some((p) => p.id === person))
          throw new Problem(
            400,
            "Choose an assignee from this project's teams.",
          );
      const converted = convertMiro(p.snapshot, opts, config, people);
      let target = null,
        targetRevision = null;
      if (opts.destination) {
        const record = await this.store.read(
          this.store.file(project, "boards", opts.destination),
        );
        target = record.data;
        targetRevision = record.revision;
        if (target.archived)
          throw new Problem(400, "Choose an active destination canvas.");
        const existing = new Map(target.nodes.map((n) => [n.id, n]));
        const sourceNodes = new Map(converted.nodes.map((n) => [n.id, n]));
        const skipped = converted.nodes.filter((n) => existing.has(n.id));
        converted.nodes = converted.nodes.filter((n) => !existing.has(n.id));
        const edgeIds = new Set(target.edges.map((e) => e.id));
        converted.edges = converted.edges.filter((e) => !edgeIds.has(e.id));
        if (skipped.length)
          converted.issues.push({
            kind: "skipped",
            message: `${skipped.length} previously imported objects will be kept as they are.`,
          });
        const dx = target.nodes.length
          ? Math.max(...target.nodes.map((n) => n.x + n.w)) + 100
          : 0;
        for (const n of converted.nodes) {
          // New descendants of a previously imported frame follow its local
          // position. Separate new content is placed beside the current board.
          let ancestor = sourceNodes.get(n.frame),
            offset = { x: dx, y: 0 };
          while (ancestor) {
            const local = existing.get(ancestor.id);
            if (local) {
              offset = { x: local.x - ancestor.x, y: local.y - ancestor.y };
              if (ancestor.id === n.frame && local.type !== "frame")
                delete n.frame;
              break;
            }
            ancestor = sourceNodes.get(ancestor.frame);
          }
          n.x += offset.x;
          n.y += offset.y;
        }
      }
      const combined = {
        title: opts.title,
        ...(target || {}),
        nodes: [...(target?.nodes || []), ...converted.nodes],
        edges: [...(target?.edges || []), ...converted.edges],
      };
      this.store.validateBoard(combined);
      if (opts.cards === "tasks")
        for (const n of converted.nodes.filter((n) => n.type === "draft")) {
          const error = hierarchyError(config, n.draft);
          if (error)
            throw new Problem(
              400,
              `${error} Choose a task type allowed without a parent, or import draft cards.`,
            );
        }
      p.converted = converted;
      p.options = opts;
      p.targetRevision = targetRevision;
      p.expires = Date.now() + TTL;
      p.version = randomUUID();
      this.previews.set(p.id, p);
      return {
        preview: p.id,
        version: p.version,
        title: opts.title,
        cards: opts.cards,
        frames: p.snapshot.items
          .filter((i) => i.type === "frame")
          .map((i) => ({
            id: String(i.id),
            title: String(i.data?.title || "Untitled frame"),
          })),
        people: people.map((p) => ({ id: p.id, name: p.name })),
        assignees: [
          ...new Set(
            p.snapshot.items
              .map((i) => i.data?.assigneeId)
              .filter(Boolean)
              .map(String),
          ),
        ].map((id) => ({
          id,
          name: p.snapshot.members.find((m) => String(m.id) === id)?.name || id,
        })),
        statuses: config.statuses.map((id) => ({
          id,
          name: statusLabel(config, id),
        })),
        types: config.types,
        status: opts.status || initialStatus(config),
        type:
          opts.type ||
          (config.types.includes("task") ? "task" : config.types[0]),
        nodes: converted.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          text: n.draft?.title || n.name || n.text,
          color: n.color,
        })),
        edges: converted.edges.map((e) => ({ from: e.from, to: e.to })),
        counts: {
          objects: converted.nodes.length,
          connectors: converted.edges.length,
          tasks:
            opts.cards === "tasks"
              ? converted.nodes.filter((n) => n.type === "draft").length
              : 0,
        },
        issues: converted.issues,
        limitations:
          "Miro does not expose comments, editable pen strokes or native tables through this API. Some unsupported objects may not be returned at all. Fonts and line routing can differ. Cards use your selected task status and Medium priority.",
      };
    } finally {
      this.busy.delete(owner);
    }
  }
  // Called inside the existing write journal: tasks, media and canvas commit together.
  async commit(project, user, input) {
    await this.access(project, user);
    this.prune();
    const p = this.previews.get(input.preview);
    if (!p || p.owner !== ownerKey(project, user))
      throw new Problem(
        410,
        "This preview expired. Load the Miro board again.",
      );
    if (p.result) return p.result;
    if (p.version !== input.version)
      throw new Problem(
        409,
        "The preview changed. Review it again before importing.",
      );
    const { destination, cards, title } = p.options;
    const current = destination
      ? await this.store.read(this.store.file(project, "boards", destination))
      : null;
    if (current && current.revision !== p.targetRevision)
      throw new Problem(
        409,
        "The destination canvas changed. Update the preview before importing.",
      );
    const { nodes, edges } = structuredClone(p.converted);
    if (!nodes.length && !edges.length)
      throw new Problem(400, "There are no new objects to import.");
    const used = new Set(
      nodes
        .flatMap((n) => [
          n.src,
          n.type === "file" ? n.file.replace(`Projects/${project}/`, "") : null,
        ])
        .filter(Boolean),
    );
    for (const asset of Object.values(p.snapshot.assets))
      if (used.has(asset.path)) {
        const file = path.join(this.store.projectDir(project), asset.path);
        await this.store.safe(file);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await this.store.journal.stage(file, asset.bytes);
        await fs.writeFile(file, asset.bytes, { flag: "wx" });
      }
    let tasks = 0;
    if (cards === "tasks")
      for (const n of nodes.filter((n) => n.type === "draft")) {
        const t = await this.store.createTask(project, {
          ...n.draft,
          body: n.text,
          creation_request: miroId(p.snapshot.board.id, n.miro.item),
        });
        n.type = "task";
        n.task = t.id;
        delete n.draft;
        delete n.text;
        tasks++;
      }
    let board;
    if (current)
      board = await this.store.updateBoard(
        project,
        destination,
        {
          revision: current.revision,
          nodes: [...current.data.nodes, ...nodes],
          edges: [...current.data.edges, ...edges],
        },
        user.username,
      );
    else
      board = await this.store.createBoard(project, {
        title,
        canvas: encodeCanvas({
          project,
          title,
          nodes,
          edges,
          miroImport: {
            board: p.snapshot.board.id,
            imported: new Date().toISOString(),
            issues: p.converted.issues,
          },
        }),
      });
    return {
      board: board.id,
      objects: nodes.length,
      connectors: edges.length,
      tasks,
      issues: p.converted.issues,
    };
  }
  completed(project, user, input, result) {
    const p = this.previews.get(input.preview);
    if (p) {
      p.result = result;
      delete p.snapshot;
      delete p.converted;
    }
    this.grants.delete(ownerKey(project, user));
  }
}
