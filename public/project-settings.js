import { randomUUID } from "./uuid.js";
import { workflowEditor } from "./workflow-editor.js";
import { projectTeamControls, projectPeople } from "./teams.js";

export const settingsPages = [
  [
    "general",
    "General",
    "settings",
    "Project",
    "Name, task IDs and the default view for this project.",
  ],
  [
    "teams",
    "Organisation & teams",
    "people",
    "Project",
    "Choose the organisation and teams whose members can be assigned tasks.",
  ],
  [
    "workflow",
    "Statuses & workflow",
    "status",
    "Task structure",
    "Name and order statuses, choose defaults and define allowed transitions.",
  ],
  [
    "hierarchy",
    "Types & hierarchy",
    "tree",
    "Task structure",
    "Choose your card types and the parent–child relationships they allow.",
  ],
  [
    "fields",
    "Custom fields",
    "table",
    "Task structure",
    "Add project-specific information to tasks.",
  ],
  [
    "sources",
    "Data sources & sync",
    "link",
    "Connections",
    "Bring Obsidian, Jira Cloud and SharePoint Excel tasks into this project.",
  ],
  [
    "import",
    "Import notes",
    "upload",
    "Connections",
    "Create local tasks from Markdown files. This is a one-time import.",
  ],
  [
    "automation",
    "Automation",
    "repeat",
    "Maintenance",
    "Preview and manage rules that update project tasks.",
  ],
  [
    "diagnostics",
    "Diagnostics",
    "activity",
    "Maintenance",
    "Check server health and troubleshoot search. These metrics cover the whole workspace.",
  ],
  [
    "advanced",
    "Archive & recovery",
    "archive",
    "Maintenance",
    "Review project history, archive this project or move it to Trash.",
  ],
];
export const settingsPage = (id) =>
  settingsPages.find((p) => p[0] === id) || settingsPages[0];


// Task types are edited as chips over a hidden comma-separated field, so the
// save flow and dirty tracking stay unchanged.
const escapeType = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const closeIcon = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
function typeChipsHTML(types) {
  return `<ul class="type-chips" data-type-chips aria-labelledby="type-list-label">${types.map((t) => `<li class="type-chip"><span>${escapeType(t)}</span><button type="button" class="icon-button" data-type-remove="${escapeType(t)}" aria-label="Remove ${escapeType(t)}" title="Remove">${closeIcon}</button></li>`).join("")}</ul>`;
}
function typeList(field) {
  return field.value.split(",").map((t) => t.trim()).filter(Boolean);
}
function updateTypes(field, types) {
  field.value = types.join(", ");
  field.closest(".type-list-field").querySelector("[data-type-chips]").outerHTML = typeChipsHTML(types);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}
function addType(host) {
  const input = host.querySelector("[data-type-input]"), field = host.querySelector('input[name="types"]');
  const value = input.value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!value) return input.focus();
  const types = typeList(field);
  if (!types.includes(value)) updateTypes(field, [...types, value]);
  input.value = "";
  input.focus();
}
if (typeof document !== "undefined") document.addEventListener("click", (event) => {
  const host = event.target.closest(".type-list-field");
  if (!host) return;
  if (event.target.closest("[data-type-add]")) addType(host);
  const remove = event.target.closest("[data-type-remove]");
  if (remove) {
    const field = host.querySelector('input[name="types"]');
    updateTypes(field, typeList(field).filter((t) => t !== remove.dataset.typeRemove));
    host.querySelector("[data-type-input]")?.focus();
  }
});
if (typeof document !== "undefined") document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-type-input]")) {
    event.preventDefault();
    addType(event.target.closest(".type-list-field"));
  }
});

export function projectSettings(ctx, { sources, automations }) {
  const {
    state,
    api,
    esc,
    icon,
    options,
    colorPicker,
    renderApp,
    refresh,
    toast,
  } = ctx;
  let sequence = 0;
  const page = () => settingsPage(state.settingsSection);
  const current = (section) =>
    state.project && state.view === "settings" && page()[0] === section;
  const href = (section, detail = "") =>
    `#project/${state.project.id}/settings/${section}${detail ? `/${detail}` : ""}`;
  const link = (section, title, detail = "") =>
    `<a class="button small" href="${href(section, detail)}" data-settings-section="${section}" data-settings-detail="${esc(detail)}">${title}</a>`;
  function clean() {
    state.settingsDirty = false;
    state.dirty = false;
  }
  function canLeave() {
    if (state.view !== "settings") return true;
    if (state.settingsSaving) {
      toast("Wait for these settings to finish saving.");
      return false;
    }
    if (!state.settingsDirty) return true;
    if (!confirm("Discard unsaved changes to this settings page?"))
      return false;
    clean();
    return true;
  }
  function open(section = "general", detail = "", { force = false } = {}) {
    if (!state.project || (!force && !ctx.canNavigate())) return false;
    if (state.view !== "settings") state.settingsReturn = state.helpArticle
      ? ctx.storage.get(`view:${state.project.id}`, "list") : state.view;
    state.helpArticle = null;
    clean();
    state.view = "settings";
    state.settingsSection = settingsPage(section)[0];
    state.settingsDetail = detail;
    renderApp();
    document
      .querySelector("#settings-page-title")
      ?.focus({ preventScroll: true });
    return true;
  }
  function markDirty(event) {
    if (
      !event.target.closest("form") ||
      event.target.closest("[data-settings-readonly]")
    )
      return;
    state.settingsDirty = state.dirty = true;
    const status = document.querySelector("[data-settings-save-state]");
    if (status) status.textContent = "Unsaved changes";
  }
  function footer(title = "Save changes") {
    return `<div class="dialog-foot settings-save-bar"><span role="status" data-settings-save-state>No unsaved changes</span><button type="button" class="button" data-settings-discard>Discard changes</button><button type="submit" class="button primary">${title}</button></div>`;
  }
  function form(body, id = "project-form") {
    return `<form id="${id}" data-settings-form data-edit="true" data-revision="${esc(state.project.revision)}"><div class="dialog-body"><div class="form-error hidden" role="alert"></div>${body}</div>${footer()}</form>`;
  }
  const field = (name, title, value, extra = "") =>
    `<label class="field">${title}<input name="${name}" value="${esc(value || "")}" ${extra}></label>`;
  function general() {
    const p = state.project;
    return form(
      `${field("title", "Project name", p.title, 'required maxlength="300"')}${field("key", "Project key", p.key, 'required pattern="[A-Za-z][A-Za-z0-9]{1,11}" maxlength="12"')}<p class="field-hint">Task IDs look like <strong data-key-example>${esc(p.key)}-1</strong>. Existing IDs remain available as aliases when the key changes.</p><label class="field">Description<textarea name="body" rows="4" placeholder="What is this project for?">${esc(p.body)}</textarea></label><div class="field-row"><div class="field">Project colour${colorPicker({ label: "Project colour", value: p.color })}</div><label class="field">Default view<select name="default_view">${options(["overview", "documents", "list", "tree", "table", "kanban", "board", "calendar", "timeline", "capacity"], p.default_view === "drawing" ? "board" : p.default_view, { board: "Boards" })}</select></label></div>`,
    );
  }
  function teams() {
    return form(
      `<label class="field">Organisation<select name="organisation" required>${state.organisations.map((o) => `<option value="${esc(o.id)}" ${o.id === state.project.organisation ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label><p class="field-hint">Moving organisations moves this project, its tasks and boards. Select teams from the destination organisation before saving.</p><div class="settings-assignee-summary"><h3>Available assignees</h3><p data-settings-assignees></p></div>`,
    );
  }
  function customField(
    f = {
      id: `field_${randomUUID().replaceAll("-", "")}`,
      name: "",
      type: "text",
      options: [],
    },
  ) {
    const used = state.tasks.filter((t) => t.fields?.[f.id] != null).length;
    return `<section class="settings-field-row" data-field-id="${esc(f.id)}"><div class="field-row"><label class="field">Field name<input data-field-name value="${esc(f.name)}" required maxlength="100"></label><label class="field">Field type<select data-field-type>${options(["text", "number", "date", "select", "checkbox"], f.type)}</select></label></div><label class="field" data-field-options-label ${f.type !== "select" ? "hidden" : ""}>Choices (one per line)<textarea data-field-options rows="3">${esc((f.options || []).join("\n"))}</textarea></label><div class="settings-field-meta"><span class="field-hint">${used ? `Used by ${used} task${used === 1 ? "" : "s"}` : "Not used yet"}</span><button type="button" class="button small" data-settings-remove-field ${used ? 'disabled title="Clear task values before removing this field"' : ""}>Remove field</button></div></section>`;
  }
  function structure(section) {
    if (section === "fields")
      return form(
        `<p class="field-hint" data-fields-empty ${state.config.fields.length ? "hidden" : ""}>No custom fields yet. Add a field when your tasks need information beyond the built-in fields.</p><div data-settings-fields>${state.config.fields.map(customField).join("")}</div><button type="button" class="button" data-settings-add-field>${icon("plus")}Add field</button>`,
        "workflow-form",
      );
    const types =
      section === "hierarchy"
        ? `<div class="field type-list-field"><span id="type-list-label">Task types</span><input type="hidden" name="types" value="${esc(state.config.types.join(", "))}" required>${typeChipsHTML(state.config.types)}<div class="type-add"><input data-type-input aria-label="New type name" placeholder="New type…" maxlength="30"><button type="button" class="button small" data-type-add>${icon("plus")}Add type</button></div><span class="field-hint">Types in use cannot be removed.</span></div>`
        : "";
    return form(types, "workflow-form");
  }
  function importPage() {
    return `<form id="settings-import" data-settings-form><div class="dialog-body"><p>Each selected Markdown file creates one task. Your original files are kept. To keep an Obsidian folder in sync, use ${link("sources", "Data sources & sync")} instead.</p><label class="field">Markdown notes<input type="file" name="notes" accept=".md,text/markdown" multiple required></label><p class="field-hint">Up to 200 files per import. Review the selection before creating tasks.</p><div data-import-preview aria-live="polite"></div><div class="form-error hidden" role="alert"></div></div><div class="dialog-foot"><button type="submit" class="button primary" disabled>Import selected notes</button></div></form>`;
  }
  function advanced() {
    return `<div class="settings-page-body"><section class="settings-action-row"><div><h3>Version history</h3><p>Review saved project settings and restore an earlier version.</p></div><button class="button" data-feature="project-history">Version history</button></section><section class="settings-action-row"><div><h3>${state.project.archived ? "Restore archived project" : "Archive project"}</h3><p>Keep tasks and boards while hiding the project from active planning. Restore it at any time.</p></div><button class="button" data-feature="project-archive">${state.project.archived ? "Unarchive project" : "Archive project"}</button></section><section class="settings-action-row settings-danger"><div><h3>Move project to Trash</h3><p>Moves this project and all its tasks and boards to Trash. Recover it from Personal settings → Recovery &amp; backups.</p></div><button class="button danger" data-feature="project-delete">Move to Trash</button></section></div>`;
  }
  async function diagnostics(host, valid) {
    const data = await api("/diagnostics");
    if (!valid()) return;
    const errors = Object.values(data.errors || {}).reduce((a, b) => a + b, 0);
    host.innerHTML = `<div class="settings-page-body"><div class="settings-health-summary"><section><strong>${Math.floor(data.uptime_seconds / 60)} min</strong><span>Server uptime</span></section><section><strong>${errors}</strong><span>HTTP errors since restart</span></section><section><strong>${data.journal_conflicts?.length || 0}</strong><span>File recovery conflicts</span></section></div><section class="settings-action-row"><div><h3>Search index</h3><p>Rebuild if search results do not match the files in your vault. This does not change your tasks or boards.</p></div><button class="button" data-settings-rebuild>Rebuild search index</button></section><p role="status" data-diagnostics-result></p><details><summary>Technical details</summary><pre class="source-description">${esc(JSON.stringify(data, null, 2))}</pre></details></div>`;
  }
  // The existing source/automation controllers keep their form logic; only their
  // presentation changes from a dialog to the current routed settings page.
  function present(html, kind, section) {
    if (!current(section)) return ctx.showDialog(html, kind);
    if (document.querySelector("#dialogs dialog")) ctx.closeDialog(true);
    const host = document.querySelector("#settings-panel");
    if (!host) return;
    const template = document.createElement("template");
    template.innerHTML = html;
    const dialog = template.content.querySelector("dialog");
    const heading = dialog.querySelector(".dialog-head");
    const title = heading?.querySelector("h2")?.textContent;
    heading?.remove();
    host.replaceChildren(...dialog.childNodes);
    if (title && state.settingsDetail)
      document.querySelector("#settings-page-title").textContent = title;
    for (const error of host.querySelectorAll(".form-error")) {
      if (!error.textContent.trim()) error.classList.add("hidden");
      new MutationObserver(() =>
        error.classList.toggle("hidden", !error.textContent.trim()),
      ).observe(error, { childList: true, subtree: true });
    }
    const form = host.querySelector("form");
    if (form) {
      form.dataset.settingsInline = "";
      form
        .querySelector(".dialog-foot")
        ?.insertAdjacentHTML(
          "afterbegin",
          '<button type="button" class="button" data-settings-parent>Cancel</button>',
        );
    }
  }
  async function render() {
    const serial = ++sequence,
      projectId = state.project.id;
    const [section, title, , , description] = page();
    state.settingsSection = section;
    const detail = state.settingsDetail || "";
    const valid = () =>
      serial === sequence &&
      state.project?.id === projectId &&
      current(section) &&
      (state.settingsDetail || "") === detail;
    let group = "";
    document.querySelector("#view-toolbar").innerHTML = "";
    const content = document.querySelector("#view-content");
    content.className = "content project-settings-page project-settings-layout";
    content.innerHTML = `<aside class="settings-navigation"><h1>Project settings</h1><p>${esc(state.project.title)}</p><nav aria-label="Project settings sections">${settingsPages
      .map(([id, name, glyph, category]) => {
        const label =
          group !== category
            ? `<span class="settings-nav-group">${category}</span>`
            : "";
        group = category;
        return `${label}<a href="${href(id)}" data-settings-section="${id}" ${id === section ? 'aria-current="page"' : ""}>${icon(glyph)}<span>${name}</span></a>`;
      })
      .join(
        "",
      )}</nav><label class="field settings-mobile-nav">Settings section<select id="settings-section-select">${settingsPages.map(([id, name]) => `<option value="${id}" ${id === section ? "selected" : ""}>${name}</option>`).join("")}</select></label><button type="button" class="button settings-return" data-action="settings-close">${icon("arrow-left")}Back to project</button></aside><section class="settings-content"><header class="settings-section-heading">${detail ? `${link(section, "← Back to " + title)}` : ""}<h2 id="settings-page-title" tabindex="-1">${esc(title)}</h2><p>${description}</p></header><div id="settings-panel" aria-live="polite"><p class="settings-loading" role="status">Loading ${esc(title.toLowerCase())}…</p></div></section>`;
    const host = document.querySelector("#settings-panel");
    host.addEventListener("input", markDirty);
    host.addEventListener("change", markDirty);
    try {
      if (section === "sources") {
        await sources.renderPage(detail, valid);
        return;
      }
      if (section === "automation") {
        await automations.renderPage(detail, valid);
        return;
      }
      if (section === "diagnostics") {
        await diagnostics(host, valid);
        return;
      }
      host.innerHTML =
        section === "general"
          ? general()
          : section === "teams"
            ? teams()
            : ["workflow", "hierarchy", "fields"].includes(section)
              ? structure(section)
              : section === "import"
                ? importPage()
                : advanced();
      const f = host.querySelector("form");
      if (!f) return;
      const schema = structuredClone(state.config);
      if (section === "teams") {
        projectTeamControls(f, state, esc);
        const paintPeople = () => {
          const organisation = state.organisations.find(
            (o) => o.id === f.elements.organisation.value,
          );
          const people = projectPeople({
            organisation,
            project: { teams: JSON.parse(f.elements.teams.value) },
          });
          f.querySelector("[data-settings-assignees]").textContent =
            people.map((p) => p.name).join(", ") ||
            "No assignees available. Select a team with members.";
        };
        f.addEventListener("change", paintPeople);
        paintPeople();
      }
      if (["workflow", "hierarchy"].includes(section))
        workflowEditor(f, schema, state.tasks, ctx, { section });
      f.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const submit = f.querySelector('[type="submit"]'),
          error = f.querySelector(".form-error");
        submit.disabled = true;
        state.settingsSaving = true;
        error.classList.add("hidden");
        try {
          const data = new FormData(f);
          let changes;
          if (section === "general") changes = Object.fromEntries(data);
          if (section === "teams")
            changes = {
              organisation: data.get("organisation"),
              teams: JSON.parse(data.get("teams")),
            };
          if (["workflow", "hierarchy"].includes(section))
            changes = { schema: JSON.parse(data.get("workflowSchema")) };
          if (section === "fields")
            changes = {
              schema: {
                ...schema,
                fields: [...f.querySelectorAll("[data-field-id]")].map(
                  (row) => ({
                    id: row.dataset.fieldId,
                    name: row.querySelector("[data-field-name]").value.trim(),
                    type: row.querySelector("[data-field-type]").value,
                    options: row
                      .querySelector("[data-field-options]")
                      .value.split("\n")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  }),
                ),
              },
            };
          if (section === "import") {
            const files = [...f.elements.notes.files];
            if (!files.length || files.length > 200)
              throw new Error("Select between 1 and 200 Markdown notes.");
            const notes = await Promise.all(
              files.map(async (file) => ({
                name: file.name,
                content: await file.text(),
              })),
            );
            const result = await api(`/projects/${projectId}/import`, {
              method: "POST",
              body: { notes },
            });
            clean();
            await refresh(false);
            if (valid()) {
              f.reset();
              f.querySelector("[data-import-preview]").textContent =
                `Imported ${result.tasks.length} ${result.tasks.length === 1 ? "note as a task" : "notes as tasks"}.`;
            }
            toast(
              `Imported ${result.tasks.length} note${result.tasks.length === 1 ? "" : "s"}.`,
            );
          } else {
            await api(`/projects/${projectId}`, {
              method: "PATCH",
              body: { ...changes, revision: f.dataset.revision },
            });
            clean();
            await refresh(false);
            if (valid()) {
              renderApp();
              document.querySelector("[data-settings-save-state]").textContent =
                "Changes saved";
            }
            toast(`${title} saved.`);
          }
        } catch (e) {
          if (f.isConnected) {
            error.textContent = e.message;
            error.classList.remove("hidden");
          }
        } finally {
          state.settingsSaving = false;
          submit.disabled =
            section === "import" && !f.elements.notes.files.length;
        }
      });
    } catch (e) {
      if (valid())
        host.innerHTML = `<div class="settings-page-body"><p class="form-error" role="alert">${esc(e.message)}</p><button class="button" data-settings-retry>Try again</button></div>`;
    }
  }
  document.addEventListener("click", async (event) => {
    const nav = event.target.closest("[data-settings-section]");
    if (nav) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      open(nav.dataset.settingsSection, nav.dataset.settingsDetail || "");
      return;
    }
    const target = event.target.closest("button");
    if (!target?.closest(".project-settings-layout")) return;
    if (target.hasAttribute("data-settings-discard")) {
      clean();
      state.settingsSaving = true;
      try {
        await refresh(false);
        renderApp();
      } catch (e) {
        toast(e.message, true);
      } finally {
        state.settingsSaving = false;
      }
    }
    if (target.hasAttribute("data-settings-parent")) open(page()[0]);
    if (target.hasAttribute("data-settings-retry")) void render();
    if (target.hasAttribute("data-settings-add-field")) {
      document
        .querySelector("[data-settings-fields]")
        .insertAdjacentHTML("beforeend", customField());
      document.querySelector("[data-fields-empty]").hidden = true;
      state.settingsDirty = state.dirty = true;
      document.querySelector("[data-settings-save-state]").textContent =
        "Unsaved changes";
      document
        .querySelector("[data-settings-fields] section:last-child input")
        ?.focus();
    }
    if (target.hasAttribute("data-settings-remove-field")) {
      target.closest("[data-field-id]").remove();
      state.settingsDirty = state.dirty = true;
      document.querySelector("[data-settings-save-state]").textContent =
        "Unsaved changes";
      document.querySelector("[data-fields-empty]").hidden =
        !!document.querySelector("[data-field-id]");
    }
    if (target.hasAttribute("data-settings-rebuild")) {
      target.disabled = true;
      try {
        await api("/diagnostics", { method: "POST", body: {} });
        if (current("diagnostics"))
          document.querySelector("[data-diagnostics-result]").textContent =
            "Search index rebuilt.";
      } catch (e) {
        toast(e.message, true);
      } finally {
        target.disabled = false;
      }
    }
  });
  document.addEventListener("input", (event) => {
    if (!event.target.closest(".project-settings-layout")) return;
    if (event.target.name === "key")
      document.querySelector("[data-key-example]").textContent =
        `${event.target.value.toUpperCase() || "KEY"}-1`;
  });
  document.addEventListener("change", (event) => {
    if (!event.target.closest(".project-settings-layout")) return;
    if (event.target.id === "settings-section-select") {
      if (!open(event.target.value)) event.target.value = page()[0];
      return;
    }
    if (event.target.matches("[data-field-type]"))
      event.target
        .closest("[data-field-id]")
        .querySelector("[data-field-options-label]").hidden =
        event.target.value !== "select";
    if (event.target.name === "notes") {
      const files = [...event.target.files],
        f = event.target.form;
      f.querySelector("[data-import-preview]").innerHTML =
        `<p>${files.length} note${files.length === 1 ? "" : "s"} selected</p><ul>${files.map((file) => `<li>${esc(file.name)} <small>(${Math.ceil(file.size / 1024)} KB)</small></li>`).join("")}</ul>`;
      f.querySelector('[type="submit"]').disabled =
        !files.length || files.length > 200;
    }
  });
  return { render, open, present, canLeave, clean, current };
}
