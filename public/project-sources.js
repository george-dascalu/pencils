import { sourceFields, sourceLabel } from "./source-model.js";
export function projectSources(ctx) {
  const {
    state,
    api,
    route,
    esc,
    icon,
    showDialog: modal,
    dialogHead,
    toast,
    refresh,
  } = ctx;
  const showDialog = (html, kind) =>
    ctx.settingsCurrent?.() && ["sources", "source-config"].includes(kind)
      ? ctx.presentSettings(html, kind)
      : modal(html, kind);
  const field = (name, title, value = "", extra = "") =>
    `<label class="field">${esc(title)}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
  const action = (key, title, id = "") =>
    `<button type="button" class="button small" data-source-action="${key}" data-source-id="${esc(id)}">${title}</button>`;
  let sources = [],
    setup = {},
    project = null;
  async function open(detail = "", valid = () => true) {
    project = state.project.id;
    const data = await api(route("sources"));
    if (!valid()) return;
    sources = data.sources;
    setup = data.setup;
    if (detail) {
      if (detail !== "new" && !sources.some((s) => s.id === detail))
        throw new Error(
          "This source no longer exists. Return to Data sources & sync.",
        );
      configure(detail === "new" ? undefined : detail);
      return;
    }
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Project data sources")}<div class="dialog-body"><p>Combine local tasks with Obsidian, Jira Cloud and a SharePoint Excel table. Source projects are private to their owner and workspace administrators. Cached records remain private in the app when disconnected. Imported data is also stored in vault files and backups; anyone with filesystem access can read it.</p><p class="field-hint">${setup.authenticated ? "Cloud credentials stay encrypted on the server. Automatic reads run every five minutes when enabled." : "Use local automatic sign-in, or sign in as an administrator in required mode, before connecting sources."}</p>${sources.map((s) => `<section class="source-card"><h3>${esc(s.name)} <small>${esc(s.provider)}</small></h3><p>${esc(s.status)} · ${s.record_count} records${s.last_success ? ` · Last success ${esc(new Date(s.last_success).toLocaleString())}` : ""}</p>${s.last_error ? `<p class="form-error">${esc(s.last_error)}</p>` : ""}<div class="source-actions">${action("edit", "Configure", s.id)}${s.provider !== "obsidian" ? action("authorize", s.connected ? "Reconnect" : "Connect", s.id) : ""}${s.provider === "jira" && s.connected ? action("resources", "Show Jira sites", s.id) : ""}${action("preview", "Preview mapping", s.id)}${action("sync", "Sync now", s.id)}${action("toggle", s.enabled ? "Pause" : "Enable polling", s.id)}${action("disconnect", "Disconnect", s.id)}</div>${s.conflicts.length ? `<details><summary>${s.conflicts.length} conflicts</summary>${s.conflicts.map((c) => `<article><h4>${esc(c.key)}</h4>${c.fields.map((f) => `<p>${esc(f.field)} — Local: ${esc(f.local)} · Source: ${esc(f.remote)}</p>`).join("")}${action("local", "Keep local", `${s.id}|${c.task}`)}${action("remote", "Use source", `${s.id}|${c.task}`)}</article>`).join("")}</details>` : ""}${s.jobs.length ? `<details><summary>Publish log</summary>${s.jobs.map((j) => `<p>${esc(j.action)} · ${esc(j.state)} · ${esc(j.created)} ${esc(j.error || "")}</p>`).join("")}</details>` : ""}</section>`).join("") || "<p>No external sources yet. Existing project tasks remain local Markdown files.</p>"}${action("new", "+ Add source")}${action("diagnostics", "Export sync diagnostics")}</div></dialog>`,
      "sources",
    );
  }
  function configure(id) {
    const s = sources.find((s) => s.id === id) || {
      provider: "obsidian",
      scope: {},
      mapping: {},
      capabilities: { read: true },
    };
    showDialog(
      `<dialog class="dialog"><form id="source-config" data-id="${esc(id || "")}">${dialogHead(id ? "Configure source" : "Add project source")}<div class="dialog-body"><p>Start with read access. Preview the mapping before syncing. Imported fields stay owned by the source; descriptions in the task editor are your local annotations.</p><label class="field">Provider<select name="provider" ${id ? "disabled" : ""}>${[
        ["obsidian", "Obsidian folder"],
        ["jira", "Jira Cloud"],
        ["excel", "SharePoint Excel"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${s.provider === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label>${field("name", "Source name", s.name || "", "required maxlength=100")}<div data-source-scope></div><details><summary>Field mappings</summary><p>Enter source property or column names. Blank uses the same name. Dates must be YYYY-MM-DD; use a text column for Excel dates.</p>${sourceFields.map((k) => field(`map:${k}`, k, s.mapping[k] || "")).join("")}<label class="field">Status/type/priority value mapping (JSON)<textarea name="values" rows="3">${esc(JSON.stringify(s.mapping.values || {}, null, 2))}</textarea></label></details><fieldset><legend>Capabilities</legend><p>Read is always enabled. Remote actions are individually reviewed and sent using the connected account's permissions.</p>${["edit", "create", "assign", "transition", "comment"].map((k) => `<label class="source-capability"><input type="checkbox" name="cap:${k}" ${s.capabilities[k] ? "checked" : ""}> ${esc(k)}</label>`).join("")}</fieldset><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="submit" class="button primary">Save source</button></div></form></dialog>`,
      "source-config",
    );
    const form = document.querySelector("#source-config");
    function fields() {
      const provider = form.elements.provider.value,
        host = form.querySelector("[data-source-scope]");
      host.innerHTML =
        provider === "obsidian"
          ? `<p class="field-hint">${setup.obsidian ? "Server root configured." : "Set OBSIDIAN_ROOT on the server to the vault root."} Only notes with a stable ID are imported. Checklists also require a stable block ID (^example).</p>${field("folder", "Folder relative to configured root", s.scope.folder || ".")}${field("idField", "Stable note ID property", s.scope.idField || "id")}${field("vault", "Obsidian vault name (for Open in source)", s.scope.vault || "")}<label><input name="checklists" type="checkbox" ${s.scope.checklists ? "checked" : ""}> Include opted-in checklists</label>`
          : provider === "jira"
            ? `<p class="field-hint">${setup.jira ? "OAuth app configured." : "Set JIRA_CLIENT_ID, JIRA_CLIENT_SECRET and APP_ORIGIN on the server."} Connect after saving; Show Jira sites gives the Cloud ID.</p>${field("cloudId", "Jira Cloud ID", s.scope.cloudId || "")}${field("jql", "Project/JQL scope", s.scope.jql || "project = DEMO ORDER BY key ASC")}`
            : `<p class="field-hint">${setup.excel ? "Microsoft OAuth app configured." : "Set MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT and APP_ORIGIN on the server."} Read-only download of a selected .xlsx named table. Stable ID values must be unique; formulas cannot be IDs. Delegated Files.Read.All consent may require an administrator.</p>${["driveId", "itemId", "table", "idColumn"].map((k) => field(k, { driveId: "SharePoint drive ID", itemId: "Workbook item ID", table: "Named table", idColumn: "Stable ID column" }[k], s.scope[k] || "")).join("")}`;
      for (const checkbox of form.querySelectorAll('[name^="cap:"]')) {
        const cap = checkbox.name.slice(4);
        checkbox.disabled =
          provider === "excel" ||
          (provider === "obsidian" &&
            !["edit", "assign", "transition"].includes(cap));
        if (checkbox.disabled) checkbox.checked = false;
      }
    }
    fields();
    form.elements.provider.addEventListener("change", fields);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      state.settingsSaving = !!ctx.settingsCurrent?.();
      try {
        const d = new FormData(form),
          provider = form.elements.provider.value,
          scope = Object.fromEntries(
            (provider === "obsidian"
              ? ["folder", "idField", "vault"]
              : provider === "jira"
                ? ["cloudId", "jql"]
                : ["driveId", "itemId", "table", "idColumn"]
            ).map((k) => [k, d.get(k)]),
          );
        if (provider === "obsidian") scope.checklists = d.has("checklists");
        const mapping = Object.fromEntries(
          sourceFields.map((k) => [k, d.get(`map:${k}`) || k]),
        );
        mapping.values = JSON.parse(d.get("values") || "{}");
        const capabilities = Object.fromEntries(
          ["edit", "create", "assign", "transition", "comment"].map((k) => [
            k,
            d.has(`cap:${k}`),
          ]),
        );
        await api(route("sources", id || ""), {
          method: id ? "PATCH" : "POST",
          body: { provider, name: d.get("name"), scope, mapping, capabilities },
        });
        await refresh(false);
        ctx.settingsSaved?.();
        if (ctx.settingsCurrent?.()) ctx.openSettings("", { force: true });
        else await open();
      } catch (error) {
        form.querySelector(".form-error").textContent = error.message;
      } finally {
        state.settingsSaving = false;
        submit.disabled = false;
      }
    });
  }
  function decorateTask(form, t) {
    if (!t.source) return;
    const source = t.source;
    const url = (() => {
      try {
        const u = new URL(source.url);
        return u.protocol === "https:" ||
          (source.provider === "obsidian" &&
            u.protocol === "obsidian:" &&
            u.hostname === "open")
          ? u.href
          : null;
      } catch {
        return null;
      }
    })();
    form
      .querySelector(".dialog-body")
      .insertAdjacentHTML(
        "afterbegin",
        `<section class="source-task"><strong>${esc(sourceLabel(t))}</strong> · ${esc(source.availability)}<p>Source fields are read-only here. Local notes, comments and dependencies stay in Pencils.</p>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open in source ↗</a>` : ""} ${action("publish", "Publish to source", source.id)}${source.description ? `<details><summary>Source description</summary><pre class="source-description">${esc(source.description)}</pre></details>` : ""}<small>Last synced ${esc(source.synced)}</small></section>`,
      );
    for (const key of sourceFields) {
      for (const input of form.querySelectorAll(`[name="${key}"]`)) {
        if (input.tagName === "SELECT") {
          const copy = document.createElement("input");
          copy.type = "hidden";
          copy.name = key;
          copy.value = input.value;
          input.after(copy);
          input.disabled = true;
        } else input.readOnly = true;
        input
          .closest(".task-picker")
          ?.querySelectorAll("button")
          .forEach((b) => (b.disabled = true));
      }
    }
  }
  async function publish(id) {
    const t = state.dialogTask;
    if (!t?.source) return;
    const data = await api(route("sources")),
      s = data.sources.find((s) => s.id === id);
    if (!s) throw Error("Source not found.");
    const actions = Object.entries(s.capabilities)
      .filter(([k, v]) => k !== "read" && v)
      .map(([k]) => k);
    if (!actions.length)
      throw Error(
        "Enable a write capability in Project settings → Data sources first.",
      );
    showDialog(
      `<dialog class="dialog"><form id="source-publish">${dialogHead("Publish to source")}<div class="dialog-body"><p>Review this remote change to ${esc(sourceLabel(t))}. Provider permissions and required fields apply. Local annotations are not published.</p><label class="field">Action<select name="action">${actions.map((a) => `<option>${a}</option>`).join("")}</select></label>${field("title", "Title", t.title)}${field("accountId", "Jira account ID (assign)")}${field("transitionId", "Jira transition ID / Obsidian status")}${field("projectKey", "Jira project key (create)")}${field("issueTypeId", "Jira issue type ID (create)")}<label class="field">Comment<textarea name="text"></textarea></label><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button class="button primary" type="submit">Publish change</button></div></form></dialog>`,
      "source-publish",
    );
    const form = document.querySelector("#source-publish");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      state.settingsSaving = !!ctx.settingsCurrent?.();
      try {
        await api(route("sources", id) + "/write", {
          method: "POST",
          body: {
            ...Object.fromEntries(new FormData(form)),
            external_id: t.source.external_id,
          },
        });
        toast("Published. Syncing the source…");
        await api(route("sources", id) + "/sync", { method: "POST", body: {} });
        await refresh(false);
        await open();
      } catch (error) {
        form.querySelector(".form-error").textContent = error.message;
      } finally {
        state.settingsSaving = false;
        button.disabled = false;
      }
    });
  }
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-source-action]");
    if (!button) return;
    e.preventDefault();
    const a = button.dataset.sourceAction,
      id = button.dataset.sourceId;
    try {
      if (a === "health") {
        if (ctx.openDiagnostics) return ctx.openDiagnostics();
        const data = await api("/diagnostics");
        showDialog(
          `<dialog class="dialog wide-dialog">${dialogHead("Workspace diagnostics")}<div class="dialog-body"><p>Aggregated request timings and HTTP error categories; no request bodies, OAuth tokens or task content.</p><pre class="source-description">${esc(JSON.stringify(data, null, 2))}</pre>${action("rebuild-index", "Rebuild search index")}<p class="field-hint">Markdown and canvas files remain authoritative. Journal conflicts preserve both the external file and the staged backup under .pencils/journal.</p></div></dialog>`,
          "diagnostics",
        );
        return;
      }
      if (a === "rebuild-index") {
        await api("/diagnostics", { method: "POST", body: {} });
        toast("Search index rebuilt.");
        return;
      }
      if (a === "open")
        return ctx.openSettings ? ctx.openSettings() : await open();
      if (a === "new" || a === "edit")
        return ctx.openSettings ? ctx.openSettings(id || "new") : configure(id);
      if (a === "publish") return await publish(id);
      if (a === "diagnostics") {
        const safe = sources.map(
          ({
            id,
            provider,
            status,
            last_success,
            last_error,
            record_count,
            jobs,
          }) => ({
            id,
            provider,
            status,
            last_success,
            last_error,
            record_count,
            jobs,
          }),
        );
        const url = URL.createObjectURL(
            new Blob(
              [
                JSON.stringify(
                  { generated: new Date().toISOString(), sources: safe },
                  null,
                  2,
                ),
              ],
              { type: "application/json" },
            ),
          ),
          link = document.createElement("a");
        link.href = url;
        link.download = "pencils-sync-diagnostics.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return;
      }
      button.disabled = true;
      state.settingsSaving = !!ctx.settingsCurrent?.();
      if (a === "toggle")
        await api(`/projects/${project}/sources/${id}`, {
          method: "PATCH",
          body: { enabled: !sources.find((s) => s.id === id).enabled },
        });
      else if (a === "local" || a === "remote") {
        const [source, taskId] = id.split("|"),
          task = state.tasks.find((t) => t.id === taskId);
        await api(`/projects/${project}/sources/${source}/resolve`, {
          method: "POST",
          body: { task: taskId, choice: a, revision: task?.revision },
        });
      } else {
        const result = await api(`/projects/${project}/sources/${id}/${a}`, {
          method: "POST",
          body: {},
        });
        if (a === "authorize") {
          location.assign(result.url);
          return;
        }
        if (a === "resources") {
          showDialog(
            `<dialog class="dialog">${dialogHead("Accessible Jira sites")}<div class="dialog-body">${result.map((r) => `<p>${esc(r.name)}<br><code>${esc(r.id)}</code><br>${esc(r.url)}</p>`).join("")}</div></dialog>`,
            "sources-resources",
          );
          return;
        }
        if (a === "preview") {
          showDialog(
            `<dialog class="dialog wide-dialog">${dialogHead("Source mapping preview")}<div class="dialog-body"><p>${result.count} records. First ${result.sample.length} shown. No tasks have been changed.</p><table><thead><tr><th>ID</th>${sourceFields.map((k) => `<th>${esc(k)}</th>`).join("")}</tr></thead><tbody>${result.sample.map((r) => `<tr><td>${esc(r.key || r.id)}</td>${sourceFields.map((k) => `<td>${esc(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div></dialog>`,
            "sources-preview",
          );
          return;
        }
      }
      await refresh(false);
      await open();
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.settingsSaving = false;
      button.disabled = false;
    }
  });
  return { open, renderPage: open, decorateTask };
}
