import fs from "node:fs/promises";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { Problem } from "./problem.js";
import { schema } from "./model.js";
import {
  mapSource,
  mergeSource,
  sourceFields,
  sourceCapabilities,
} from "../public/source-model.js";
import {
  readObsidian,
  readWorkbook,
  jiraRecord,
  writeObsidian,
} from "./source-readers.js";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const now = () => new Date().toISOString();
const errText = (e) =>
  e.status === 401 || e.status === 403
    ? "Authorisation required. Reconnect this source."
    : e.status === 429
      ? "Provider rate limit reached. Retry after the displayed delay."
      : e.status
        ? `Source request failed (${e.status}). No provider error body is included in diagnostics.`
        : e.message;
const safeId = (id) => {
  if (!/^[\w-]{1,100}$/.test(id))
    throw new Problem(400, "Invalid source identifier.");
  return id;
};
export function sourceAccess(user, project) {
  return (
    !!user &&
    (!project.source_owner ||
      user.admin ||
      project.source_owner === user.username)
  );
}
export class Sources {
  constructor(store, auth, options = {}) {
    this.store = store;
    this.auth = auth;
    this.fetch = options.fetch || fetch;
    this.env = options.env || process.env;
    this.states = new Map();
    this.running = new Set();
    this.timer = null;
  }
  file(project) {
    return path.join(
      this.store.root,
      ".pencils",
      "sources",
      `${safeId(project)}.json`,
    );
  }
  async load(project) {
    const file = this.file(project);
    await this.store.safe(file);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return { sources: [] };
      throw e;
    }
  }
  async save(project, data) {
    const file = this.file(project);
    await this.store.safe(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${randomUUID()}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temp, file);
  }
  async secretKey() {
    const file = path.join(this.store.root, ".pencils", "source-key");
    await this.store.safe(file);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try {
      return await fs.readFile(file);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      const key = randomBytes(32);
      try {
        await fs.writeFile(file, key, { mode: 0o600, flag: "wx" });
        return key;
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        return fs.readFile(file);
      }
    }
  }
  async encrypt(value) {
    const key = await this.secretKey(),
      iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  async decrypt(value) {
    const bytes = Buffer.from(value, "base64"),
      decipher = createDecipheriv(
        "aes-256-gcm",
        await this.secretKey(),
        bytes.subarray(0, 12),
      );
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  }
  public(s) {
    return {
      id: s.id,
      name: s.name,
      provider: s.provider,
      owner: s.owner,
      scope: s.scope,
      mapping: s.mapping,
      enabled: s.enabled,
      connected: !!s.credentials || s.provider === "obsidian",
      capabilities: s.capabilities,
      status: s.status,
      last_success: s.last_success,
      last_error: s.last_error,
      retry_at: s.retry_at,
      record_count: Object.keys(s.records || {}).length,
      conflicts: s.conflicts || [],
      jobs: (s.jobs || []).map(({ id, action, state, created, error }) => ({
        id,
        action,
        state,
        created,
        error,
      })),
    };
  }
  setup() {
    return {
      jira: !!(
        this.env.JIRA_CLIENT_ID &&
        this.env.JIRA_CLIENT_SECRET &&
        this.env.APP_ORIGIN
      ),
      excel: !!(
        this.env.MS_CLIENT_ID &&
        this.env.MS_CLIENT_SECRET &&
        this.env.MS_TENANT &&
        this.env.APP_ORIGIN
      ),
      obsidian: !!this.env.OBSIDIAN_ROOT,
      authenticated: this.auth.enabled,
    };
  }
  async list(project) {
    return {
      sources: (await this.load(project)).sources.map((s) => this.public(s)),
      setup: this.setup(),
    };
  }
  async configure(project, user, input, id) {
    if (!this.auth.enabled)
      throw new Problem(
        400,
        "Use local automatic sign-in or required authentication before connecting data sources.",
      );
    this.auth.admin(user);
    const data = await this.load(project),
      old = data.sources.find((s) => s.id === id);
    if (id && !old) throw new Problem(404, "Source not found.");
    const provider = old?.provider || input.provider;
    if (!sourceCapabilities[provider])
      throw new Problem(
        400,
        "Choose Obsidian, Jira Cloud or SharePoint Excel.",
      );
    const s = {
      ...old,
      id: old?.id || `s-${randomUUID()}`,
      owner: old?.owner || user.username,
      provider,
      name: String(input.name || old?.name || provider).slice(0, 100),
      scope: input.scope || old?.scope || {},
      mapping: input.mapping || old?.mapping || {},
      enabled: input.enabled ?? old?.enabled ?? false,
      records: old?.records || {},
      status: old?.status || "Not synced",
      jobs: old?.jobs || [],
      capabilities: { read: true, ...old?.capabilities, ...input.capabilities },
    };
    if (
      !s.scope ||
      Array.isArray(s.scope) ||
      typeof s.scope !== "object" ||
      !s.mapping ||
      Array.isArray(s.mapping) ||
      typeof s.mapping !== "object" ||
      JSON.stringify([s.scope, s.mapping]).length > 20000
    )
      throw new Problem(400, "Invalid source scope or mapping.");
    for (const [key, on] of Object.entries(s.capabilities))
      if (typeof on !== "boolean" || (on && !sourceCapabilities[provider][key]))
        throw new Problem(400, `This source does not support ${key}.`);
    if (!old && provider !== "excel")
      for (const key of Object.keys(s.capabilities))
        if (key !== "read" && input.capabilities?.[key] !== true)
          s.capabilities[key] = false;
    if (
      old &&
      JSON.stringify(old.scope) !== JSON.stringify(s.scope) &&
      Object.keys(old.records || {}).length
    )
      throw new Problem(
        409,
        "Pause and disconnect this source before changing its identity/scope. Add a new source for a different scope.",
      );
    const file = this.store.file(project, "project"),
      record = await this.store.read(file);
    if (
      record.data.source_owner &&
      record.data.source_owner !== user.username &&
      !old
    )
      throw new Problem(
        403,
        "Only the source project's owner may add sources.",
      );
    if (!record.data.source_owner)
      await this.store.write(
        file,
        { ...record.data, source_owner: user.username },
        record.body,
        record,
      );
    data.sources = [...data.sources.filter((x) => x.id !== s.id), s];
    await this.save(project, data);
    return this.public(s);
  }
  async request(url, options = {}) {
    const response = await this.fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(25000),
      ...options,
    });
    if (!response.ok) {
      const e = new Problem(response.status, "Provider request failed.");
      e.retry = Number(response.headers.get("retry-after")) || 60;
      throw e;
    }
    if (response.status === 204) return {};
    const reader = response.body?.getReader();
    if (!reader) return response.json();
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 20_000_000) {
        await reader.cancel();
        throw new Problem(413, "Provider response exceeds 20 MB.");
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    return options.binary ? bytes : JSON.parse(bytes.toString());
  }
  oauth(provider) {
    const origin = new URL(this.env.APP_ORIGIN || "http://localhost");
    if (
      origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    )
      throw new Problem(
        400,
        "Cloud integrations require HTTPS or a localhost callback.",
      );
    const redirect = `${origin.origin}/api/source-callback/${provider}`;
    if (provider === "jira")
      return {
        authorize: "https://auth.atlassian.com/authorize",
        token: "https://auth.atlassian.com/oauth/token",
        client: this.env.JIRA_CLIENT_ID,
        secret: this.env.JIRA_CLIENT_SECRET,
        scope: "read:jira-work read:jira-user offline_access",
        redirect,
      };
    if (!/^[\w.-]+$/.test(this.env.MS_TENANT || ""))
      throw new Problem(400, "Configure a Microsoft tenant ID.");
    const base = `https://login.microsoftonline.com/${this.env.MS_TENANT}/oauth2/v2.0`;
    return {
      authorize: `${base}/authorize`,
      token: `${base}/token`,
      client: this.env.MS_CLIENT_ID,
      secret: this.env.MS_CLIENT_SECRET,
      scope: "offline_access Files.Read.All",
      redirect,
    };
  }
  async authorize(project, id, user) {
    this.auth.admin(user);
    if (!this.auth.enabled)
      throw new Problem(400, "Use local automatic sign-in or required authentication.");
    const s = (await this.load(project)).sources.find((s) => s.id === id);
    if (!s || s.provider === "obsidian")
      throw new Problem(400, "Choose a cloud source.");
    const oauth = this.oauth(s.provider);
    if (!oauth.client || !oauth.secret)
      throw new Problem(
        400,
        "Configure the provider client ID and secret on the server first.",
      );
    const state = randomBytes(32).toString("base64url"),
      verifier = randomBytes(32).toString("base64url");
    for (const [key, v] of this.states)
      if (v.expires < Date.now()) this.states.delete(key);
    if (this.states.size >= 100)
      throw new Problem(429, "Too many sign-in attempts.");
    this.states.set(state, {
      project,
      id,
      provider: s.provider,
      user: user.username,
      verifier,
      expires: Date.now() + 600000,
    });
    const params = new URLSearchParams({
      client_id: oauth.client,
      redirect_uri: oauth.redirect,
      response_type: "code",
      scope:
        oauth.scope +
        (s.provider === "jira" &&
        Object.entries(s.capabilities).some(([k, v]) => k !== "read" && v)
          ? " write:jira-work"
          : ""),
      state,
    });
    if (s.provider === "jira") {
      params.set("audience", "api.atlassian.com");
      params.set("prompt", "consent");
    } else {
      params.set(
        "code_challenge",
        createHash("sha256").update(verifier).digest("base64url"),
      );
      params.set("code_challenge_method", "S256");
    }
    return { url: `${oauth.authorize}?${params}` };
  }
  async callback(provider, query) {
    const pending = this.states.get(query.state);
    this.states.delete(query.state);
    if (
      !pending ||
      pending.provider !== provider ||
      pending.expires < Date.now() ||
      !query.code
    )
      throw new Problem(
        400,
        "Sign-in expired or was cancelled. Reconnect from Project settings.",
      );
    const account = (await this.auth.accounts()).find(
      (u) => u.username === pending.user,
    );
    if (!account?.admin)
      throw new Problem(403, "Source owner access was revoked.");
    const oauth = this.oauth(provider),
      body = {
        grant_type: "authorization_code",
        client_id: oauth.client,
        client_secret: oauth.secret,
        redirect_uri: oauth.redirect,
        code: query.code,
        ...(provider === "excel" ? { code_verifier: pending.verifier } : {}),
      };
    const token = await this.request(oauth.token, {
      method: "POST",
      headers: {
        "Content-Type":
          provider === "jira"
            ? "application/json"
            : "application/x-www-form-urlencoded",
      },
      body:
        provider === "jira"
          ? JSON.stringify(body)
          : new URLSearchParams(body).toString(),
    });
    const data = await this.load(pending.project),
      s = data.sources.find((s) => s.id === pending.id);
    if (!s) throw new Problem(404, "Source was disconnected during sign-in.");
    s.credentials = await this.encrypt({
      ...token,
      expires: Date.now() + (token.expires_in || 3600) * 1000,
    });
    s.status = "Connected; review scope and preview";
    s.last_error = null;
    await this.save(pending.project, data);
    return pending.project;
  }
  async token(s) {
    if (!s.credentials) throw new Problem(401, "Connect this source first.");
    let token = await this.decrypt(s.credentials);
    if (token.expires < Date.now() + 60000) {
      if (!token.refresh_token)
        throw new Problem(401, "Reconnect this source.");
      const oauth = this.oauth(s.provider),
        body = {
          grant_type: "refresh_token",
          refresh_token: token.refresh_token,
          client_id: oauth.client,
          client_secret: oauth.secret,
        };
      const result = await this.request(oauth.token, {
        method: "POST",
        headers: {
          "Content-Type":
            s.provider === "jira"
              ? "application/json"
              : "application/x-www-form-urlencoded",
        },
        body:
          s.provider === "jira"
            ? JSON.stringify(body)
            : new URLSearchParams(body).toString(),
      });
      token = {
        ...token,
        ...result,
        expires: Date.now() + (result.expires_in || 3600) * 1000,
      };
      s.credentials = await this.encrypt(token);
    }
    return token.access_token;
  }
  async resources(project, id) {
    const data = await this.load(project),
      s = data.sources.find((s) => s.id === id);
    if (!s || s.provider !== "jira")
      throw new Problem(400, "Choose a Jira source.");
    const result = await this.request(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      { headers: { Authorization: `Bearer ${await this.token(s)}` } },
    );
    await this.save(project, data);
    return result.map(({ id, name, url }) => ({ id, name, url }));
  }
  async read(s) {
    if (s.provider === "obsidian") {
      if (!this.env.OBSIDIAN_ROOT)
        throw new Problem(400, "Set OBSIDIAN_ROOT on the server.");
      const root = await fs.realpath(this.env.OBSIDIAN_ROOT);
      return readObsidian(root, s.scope.folder, {
        checklists: !!s.scope.checklists,
        idField: s.scope.idField || "id",
        vault: s.scope.vault || path.basename(root),
      });
    }
    const token = await this.token(s),
      headers = { Authorization: `Bearer ${token}` };
    if (s.provider === "jira") {
      const sites = await this.request(
        "https://api.atlassian.com/oauth/token/accessible-resources",
        { headers },
      );
      const site = sites.find((r) => r.id === s.scope.cloudId);
      if (!site)
        throw new Problem(403, "The selected Jira site is not accessible.");
      const siteURL = new URL(site.url);
      if (siteURL.protocol !== "https:")
        throw new Problem(400, "Invalid Jira site URL.");
      const records = [];
      let nextPageToken;
      const seen = new Set();
      if (!s.scope.jql || s.scope.jql.length > 2000)
        throw new Problem(400, "Specify a project-scoped JQL query.");
      do {
        const page = await this.request(
          `https://api.atlassian.com/ex/jira/${encodeURIComponent(site.id)}/rest/api/3/search/jql`,
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              jql: s.scope.jql,
              maxResults: 100,
              fields: [
                "summary",
                "description",
                "status",
                "issuetype",
                "priority",
                "assignee",
                "duedate",
                "updated",
              ],
              ...(nextPageToken ? { nextPageToken } : {}),
            }),
          },
        );
        for (const issue of page.issues || [])
          records.push(jiraRecord(issue, siteURL.origin));
        nextPageToken = page.isLast ? null : page.nextPageToken;
        if (
          records.length > 10000 ||
          (nextPageToken && seen.has(nextPageToken))
        )
          throw new Problem(
            413,
            "Narrow the Jira query to at most 10,000 issues.",
          );
        seen.add(nextPageToken);
      } while (nextPageToken);
      return records;
    }
    for (const key of ["driveId", "itemId", "table", "idColumn"])
      if (!s.scope[key] || String(s.scope[key]).length > 300)
        throw new Problem(400, `Specify Excel ${key}.`);
    const item = await this.request(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(s.scope.driveId)}/items/${encodeURIComponent(s.scope.itemId)}`,
      { headers },
    );
    if (!item.name?.endsWith(".xlsx") || item.size > 20_000_000)
      throw new Problem(400, "Choose an .xlsx workbook up to 20 MB.");
    const download = new URL(item["@microsoft.graph.downloadUrl"]);
    if (
      download.protocol !== "https:" ||
      !/(^|\.)(sharepoint\.com|1drv\.com|storage\.live\.com)$/.test(
        download.hostname,
      )
    )
      throw new Problem(400, "Unsupported workbook download host.");
    const bytes = await this.request(download.href, { binary: true }); // Pre-authorised URL; never forward the Graph bearer token.
    return readWorkbook(bytes, s.scope.table, s.scope.idColumn).map((r) => ({
      ...r,
      url: item.webUrl,
      version: `${item.eTag}:${r.version}`,
    }));
  }
  async preview(project, id) {
    const data = await this.load(project),
      s = data.sources.find((s) => s.id === id);
    if (!s) throw new Problem(404, "Source not found.");
    try {
      const records = await this.read(s),
        config = schema(
          (await this.store.read(this.store.file(project, "project"))).data
            .schema,
        ),
        ids = new Set();
      const mapped = records.map((r) => {
        if (!r.id || ids.has(r.id))
          throw new Problem(400, "Duplicate or missing source IDs.");
        ids.add(r.id);
        return { ...r, values: mapSource(r, s.mapping, config) };
      });
      s.last_error = null;
      await this.save(project, data);
      return {
        count: mapped.length,
        sample: mapped
          .slice(0, 25)
          .map(({ id, key, values }) => ({ id, key, ...values })),
        fields: [
          ...new Set(records.flatMap((r) => Object.keys(r.fields || {}))),
        ],
        records: mapped,
      };
    } catch (e) {
      s.last_error = errText(e);
      s.status =
        e.status === 401 || e.status === 403
          ? "Reconnect required"
          : "Sync error";
      s.retry_at =
        e.status === 429 ? Date.now() + (e.retry || 60) * 1000 : null;
      await this.save(project, data);
      throw new Problem(e.status || 400, s.last_error);
    }
  }
  async sync(project, id) {
    const key = `${project}/${id}`;
    if (this.running.has(key))
      throw new Problem(409, "This source is already syncing.");
    this.running.add(key);
    try {
      const preview = await this.preview(project, id),
        data = await this.load(project),
        s = data.sources.find((s) => s.id === id);
      if (!s) throw new Problem(404, "Source not found.");
      const existing = (await this.store.children(project, "tasks")).items,
        byId = new Map(existing.map((t) => [t.id, t]));
      s.conflicts = [];
      for (const remote of preview.records) {
        const id = `t-${hash(`${s.id}:${remote.id}`).slice(0, 24)}`,
          old = byId.get(id),
          previous = s.records[remote.id],
          local = old || remote.values,
          merged = mergeSource(
            previous?.base || remote.values,
            local,
            remote.values,
          );
        if (merged.conflicts.length)
          s.conflicts.push({
            task: id,
            key: remote.key,
            fields: merged.conflicts,
          });
        const source = {
          id: s.id,
          provider: s.provider,
          external_id: remote.id,
          key: remote.key,
          url: remote.url || "",
          description: remote.description || "",
          synced: now(),
          availability: "available",
        };
        if (old) {
          const file = this.store.file(project, "tasks", id),
            record = await this.store.read(file);
          await this.store.write(
            file,
            { ...record.data, ...merged.values, source, updated: now() },
            record.body,
            record,
          );
        } else {
          const config = schema(
            (await this.store.read(this.store.file(project, "project"))).data
              .schema,
          );
          const identity = await this.store.ensureTaskIdentities(project, id);
          const value = {
            ...identity,
            ...remote.values,
            id,
            kind: "task",
            project,
            source,
            parent: null,
            dependencies: [],
            tags: [],
            comments: [],
            fields: {},
            aliases: [remote.key],
            created: now(),
            updated: now(),
          };
          this.store.validateTask(value, config);
          await this.store.write(
            this.store.file(project, "tasks", id),
            value,
            "",
          );
        }
        s.records[remote.id] = {
          task: id,
          base: remote.values,
          version: remote.version,
          raw: remote.raw,
        };
      }
      const returned = new Set(preview.records.map((r) => r.id));
      for (const task of existing.filter(
        (t) => t.source?.id === s.id && !returned.has(t.source.external_id),
      )) {
        const file = this.store.file(project, "tasks", task.id),
          record = await this.store.read(file);
        await this.store.write(
          file,
          {
            ...record.data,
            source: {
              ...record.data.source,
              availability: "not-returned",
              synced: now(),
            },
          },
          record.body,
          record,
        );
      }
      s.status = s.conflicts.length ? "Conflicts need review" : "Up to date";
      s.last_success = now();
      s.last_error = null;
      s.retry_at = null;
      await this.save(project, data);
      return this.public(s);
    } finally {
      this.running.delete(key);
    }
  }
  async resolve(project, id, input) {
    const data = await this.load(project),
      s = data.sources.find((s) => s.id === id),
      conflict = s?.conflicts?.find((c) => c.task === input.task);
    if (!conflict || !["local", "remote"].includes(input.choice))
      throw new Problem(
        400,
        "Choose a current conflict and local or remote values.",
      );
    const file = this.store.file(project, "tasks", input.task),
      record = await this.store.read(file);
    this.store.checkRevision(record, input.revision);
    const updated = { ...record.data };
    for (const field of conflict.fields)
      updated[field.field] = field[input.choice];
    await this.store.write(file, updated, record.body, record);
    s.conflicts = s.conflicts.filter((c) => c !== conflict);
    await this.save(project, data);
    return this.public(s);
  }
  async disconnect(project, id) {
    const data = await this.load(project),
      s = data.sources.find((s) => s.id === id);
    if (!s) throw new Problem(404, "Source not found.");
    s.credentials = null;
    s.enabled = false;
    s.status = "Disconnected — cached records retained privately";
    await this.save(project, data);
    return this.public(s);
  }
  async writeback(project, id, input) {
    const data = await this.load(project),
      s = data.sources.find((s) => s.id === id);
    if (!s || !s.capabilities[input.action] || input.action === "read")
      throw new Problem(
        403,
        "Enable this write capability for the source first.",
      );
    if (s.provider === "excel")
      throw new Problem(
        400,
        "Excel is read-only; edit the workbook in SharePoint.",
      );
    const job = {
      id: randomUUID(),
      action: input.action,
      state: "Pending",
      created: now(),
      input,
    };
    s.jobs = [job, ...s.jobs].slice(0, 100);
    await this.save(project, data);
    try {
      if (s.provider === "obsidian") {
        const record = s.records[input.external_id];
        if (!record) throw new Problem(404, "Synced note not found.");
        const plan = await writeObsidian(
          await fs.realpath(this.env.OBSIDIAN_ROOT),
          record,
          s.mapping,
          input,
        );
        const backup = path.join(
          this.store.root,
          ".pencils",
          "source-history",
          `${hash(plan.original)}.md`,
        );
        await this.store.safe(backup);
        await fs.mkdir(path.dirname(backup), { recursive: true });
        await fs.writeFile(backup, plan.original, { mode: 0o600 });
        const temp = `${plan.file}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temp, plan.text, {
            mode: (await fs.stat(plan.file)).mode,
          });
          if (hash(await fs.readFile(plan.file)) !== plan.version)
            throw new Problem(
              409,
              "The note changed during publication. No changes were made.",
            );
          await fs.rename(temp, plan.file);
        } finally {
          await fs.rm(temp, { force: true });
        }
        job.state = "Published";
        await this.save(project, data);
        return { job: job.id, state: job.state };
      }
      const token = await this.token(s),
        headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        base = `https://api.atlassian.com/ex/jira/${encodeURIComponent(s.scope.cloudId)}/rest/api/3`,
        remote = input.external_id && s.records[input.external_id];
      if (input.action !== "create" && !remote)
        throw new Problem(404, "Synced source record not found.");
      if (remote) {
        const current = await this.request(
          `${base}/issue/${encodeURIComponent(input.external_id)}?fields=updated`,
          { headers },
        );
        if (current.fields.updated !== remote.version)
          throw new Problem(
            409,
            "Remote task changed; sync and review before publishing.",
          );
      }
      const issue = `${base}/issue/${encodeURIComponent(input.external_id || "")}`;
      let url,
        method = "POST",
        body;
      const text = (value) => ({
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: String(value) }],
          },
        ],
      });
      if (input.action === "edit") {
        url = issue;
        method = "PUT";
        body = { fields: { summary: String(input.title || "").trim() } };
        if (!body.fields.summary || body.fields.summary.length > 300)
          throw new Problem(400, "Enter a title up to 300 characters.");
      }
      if (input.action === "assign") {
        url = `${issue}/assignee`;
        method = "PUT";
        body = { accountId: input.accountId || null };
      }
      if (input.action === "transition") {
        url = `${issue}/transitions`;
        const choices = await this.request(url, { headers });
        if (!choices.transitions.some((t) => t.id === input.transitionId))
          throw new Problem(400, "That transition is not currently available.");
        body = { transition: { id: input.transitionId } };
      }
      if (input.action === "comment") {
        if (!input.text || input.text.length > 20000)
          throw new Problem(400, "Enter a comment up to 20,000 characters.");
        url = `${issue}/comment`;
        body = { body: text(input.text) };
      }
      if (input.action === "create") {
        if (!input.projectKey || !input.issueTypeId || !input.title)
          throw new Problem(
            400,
            "Project key, issue type ID and title are required; Jira may require additional fields.",
          );
        url = `${base}/issue`;
        body = {
          fields: {
            project: { key: input.projectKey },
            issuetype: { id: input.issueTypeId },
            summary: String(input.title).slice(0, 300),
          },
        };
      }
      job.state = "Sending";
      await this.save(project, data);
      const result = await this.request(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });
      job.state = "Published";
      job.result = result.id || result.key || null;
      await this.save(project, data);
      return { job: job.id, state: job.state };
    } catch (e) {
      job.state =
        e.status === 409
          ? "Conflict"
          : e.status
            ? "Rejected"
            : "Outcome unknown — check Jira before retrying";
      job.error = errText(e);
      s.last_error = job.error;
      await this.save(project, data);
      throw new Problem(e.status || 502, job.error);
    }
  }
  start() {
    this.timer = setInterval(() => {
      this.poll().catch(() => {});
    }, 300000);
    this.timer.unref();
  }
  async poll() {
    const projects = (await this.store.list()).projects;
    const accounts = await this.auth.accounts();
    for (const project of projects) {
      if (!project.source_owner) continue;
      const owner = accounts.find((u) => u.username === project.source_owner);
      if (!owner || !this.auth.allow(owner, project.organisation, true))
        continue;
      for (const s of (await this.load(project.id)).sources) {
        if (
          !s.enabled ||
          (s.retry_at && s.retry_at > Date.now()) ||
          s.status === "Reconnect required"
        )
          continue;
        await this.store
          .mutate(() => this.sync(project.id, s.id))
          .catch(() => {});
      }
    }
  }
  close() {
    clearInterval(this.timer);
    this.states.clear();
  }
}
