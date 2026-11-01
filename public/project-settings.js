import { randomUUID } from "./uuid.js";
import { focusOnOpen } from "./open-focus.js";
import { workflowEditor } from "./workflow-editor.js";
import { CARD_FIELDS, VIEW_GROUPS, fieldOn, viewOn } from "./card-fields.js";
import { projectTeamControls, projectPeople } from "./teams.js";
import { priorityOptions, priorityLabel } from "./task-priority.js";
import { taskFieldColor, priorityColors } from "./task-colors.js";
import { projectRecords } from "./project-records.js";

export const settingsPages = [
  [
    "personal",
    "Appearance & workspace",
    "people",
    "You",
    "Theme, font, density and board controls in this browser, plus search, recovery and sign-in.",
  ],
  [
    "general",
    "General",
    "settings",
    "Project",
    "Name, card IDs and the default view for this project.",
  ],
  [
    "teams",
    "Teams",
    "people",
    "Project",
    "Move this project to another organisation, and choose the teams whose members can be assigned cards.",
  ],
  [
    "workflow",
    "Statuses & workflow",
    "status",
    "Card structure",
    "Name and order statuses, choose defaults and define allowed transitions.",
  ],
  [
    "hierarchy",
    "Types & hierarchy",
    "tree",
    "Card structure",
    "Choose your card types and the parent–child relationships they allow.",
  ],
  [
    "fields",
    "Custom fields",
    "table",
    "Card structure",
    "Add project-specific information to cards.",
  ],
  [
    "sources",
    "Data sources & sync",
    "link",
    "Connections",
    "Bring Obsidian, Jira Cloud and SharePoint Excel cards into this project.",
  ],
  [
    "import",
    "Import notes",
    "upload",
    "Connections",
    "Create local cards from Markdown files. This is a one-time import.",
  ],
  [
    "automation",
    "Automation",
    "repeat",
    "Maintenance",
    "Preview and manage rules that update project cards.",
  ],
  [
    "trash",
    "Trash",
    "trash",
    "Maintenance",
    "Deleted cards, documents and boards. Restore them within 30 days; after that they are deleted for good.",
  ],
  [
    "audit",
    "Audit log",
    "clock",
    "Maintenance",
    "Who created, changed, deleted or restored each card, document and board over the last 365 days.",
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
  [
    "organisation",
    "Organisation",
    "folder",
    "Organisation",
    "Name, description, colour, people and teams of this organisation.",
  ],
];
// Without an open project, Settings shows only your own and the organisation's sections.
const workspaceSections = new Set(["personal", "organisation"]);
// A personal space has no project or organisation settings: only yours, and its Trash.
const pagesFor = (project) => (project?.personal ? settingsPages.filter(([id]) => ["personal", "trash"].includes(id)) : project ? settingsPages : settingsPages.filter(([id]) => workspaceSections.has(id)));
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
  const input = host.querySelector("[data-type-input]"), field = host.querySelector('input[name="types"]'), add = host.querySelector("[data-type-add]");
  const value = input.value.trim().toLowerCase().replace(/\s+/g, "-");
  if (!value) return focusOnOpen(input, add);
  const types = typeList(field);
  if (!types.includes(value)) updateTypes(field, [...types, value]);
  input.value = "";
  focusOnOpen(input, add);
}
if (typeof document !== "undefined") document.addEventListener("click", (event) => {
  const host = event.target.closest(".type-list-field");
  if (!host) return;
  if (event.target.closest("[data-type-add]")) addType(host);
  const remove = event.target.closest("[data-type-remove]");
  if (remove) {
    const field = host.querySelector('input[name="types"]');
    updateTypes(field, typeList(field).filter((t) => t !== remove.dataset.typeRemove));
    focusOnOpen(host.querySelector("[data-type-input]"), host.querySelector("[data-type-add]"));
  }
});
if (typeof document !== "undefined") document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-type-input]")) {
    event.preventDefault();
    addType(event.target.closest(".type-list-field"));
  }
});

// Settings save as they change (owner request T72). A field's change saves its form, and so do the
// editors that keep their value in a hidden field (statuses, people, teams). One save runs at a time;
// a change made during it is saved after it (state.settingsEdits). A form that isn't valid waits as
// "Not saved", and says why only on the field just changed, so focus never jumps to another field.
export function autosaveSettings(form, busy, state) {
  form.dataset.autosave = "";
  const save = (event, report) => {
    if (busy()) return;
    if (form.checkValidity()) return void form.requestSubmit();
    settingsSaveState(state, "Not saved");
    if (report && event.target.willValidate && !event.target.checkValidity()) event.target.reportValidity();
  };
  // A name typed for something not yet added (a new status or card type) isn't a setting.
  form.addEventListener("change", (event) => {
    if (event.target.type !== "hidden" && !event.target.closest("[data-settings-readonly], [data-settings-staging]")) save(event, true);
  });
  // An editor's hidden field saves once the editor has finished: it may update another hidden
  // field right after (card types, then the hierarchy), which this one save then includes.
  let queued = false;
  form.addEventListener("input", (event) => {
    if (event.target.type !== "hidden" || queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (form.isConnected) save(event, false);
    });
  });
}
// "Saving…", "Saved" or "Not saved" beside the page title, kept across the redraw after a save.
export function settingsSaveState(state, text) {
  state.settingsSaveState = text;
  const status = document.querySelector("[data-settings-save-state]");
  if (status) status.textContent = text;
}

export function projectSettings(ctx, { sources, automations, personal, organisationEditor }) {
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
  const records = projectRecords(ctx);
  let sequence = 0,
    railScroll = 0,
    pageScroll = 0,
    shown = "",
    panel = null;
  const page = () => settingsPage(state.settingsSection);
  const showing = () => (state.project ? state.view === "settings" : state.directoryPage === "settings");
  const current = (section) => showing() && page()[0] === section;
  const href = (section, detail = "") =>
    state.project
      ? `#project/${state.project.id}/settings/${section}${detail ? `/${detail}` : ""}`
      : `#organisation/${state.organisation?.id}/settings/${section}`;
  const link = (section, title, detail = "") =>
    `<a class="button small" href="${href(section, detail)}" data-settings-section="${section}" data-settings-detail="${esc(detail)}">${title}</a>`;
  function clean() {
    state.settingsDirty = false;
    state.dirty = false;
    state.settingsFailed = false;
  }
  // Settings save as they change: leaving saves a field still being typed in. Only an edit that
  // can't be saved, or one in a form with its own Save (sources, automation, import), asks first.
  function canLeave() {
    if (!showing()) return true;
    if (document.activeElement?.closest("#settings-panel [data-autosave]")) document.activeElement.blur();
    // An edit made during a save is saved after it, which needs the page.
    if (state.settingsSaving && state.settingsEdits !== state.settingsSavingEdits) {
      toast("Wait for these settings to finish saving.");
      return false;
    }
    const forms = [...document.querySelectorAll("#settings-panel form")];
    const stuck = state.settingsFailed || forms.some((form) => form.hasAttribute("data-autosave") && !form.checkValidity());
    const unsaved = state.settingsDirty && forms.some((form) => !form.hasAttribute("data-autosave"));
    if ((stuck || unsaved) && !confirm(stuck ? "Discard the change that can't be saved?" : "Discard unsaved changes to this settings page?"))
      return false;
    clean();
    return true;
  }
  // One Settings page: the project's sections when a project is open, plus You and Organisation.
  function open(section, detail = "", { force = false } = {}) {
    if (!force && !ctx.canNavigate()) return false;
    section ||= state.project && !state.project.personal ? (state.view === "settings" ? state.settingsSection : "general") : "personal";
    if (!state.project) {
      if (!state.organisation) return false;
      clean();
      state.helpArticle = null;
      state.directoryPage = "settings";
      state.settingsSection = workspaceSections.has(section) ? section : "personal";
      state.settingsDetail = "";
      renderApp();
      document.querySelector("#settings-page-title")?.focus({ preventScroll: true });
      return true;
    }
    if (state.view !== "settings") state.settingsReturn = state.helpArticle
      ? ctx.storage.get(`view:${state.project.id}`, "list") : state.view;
    state.helpArticle = null;
    clean();
    state.settingsSaveState = "";
    state.settingsKeep = false;
    state.view = "settings";
    state.settingsSection = state.project.personal && section !== "trash" ? "personal" : settingsPage(section)[0];
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
      event.target.closest("[data-settings-readonly], [data-settings-staging]")
    )
      return;
    state.settingsDirty = state.dirty = true;
    // Typing is counted apart from committed edits (a field's change, or an editor's hidden field,
    // which signals with input and then change), which a save under way saves next.
    const hidden = event.target.type === "hidden";
    if (hidden ? event.type === "input" : event.type === "change") state.settingsEdits = (state.settingsEdits || 0) + 1;
    else if (!hidden) state.settingsTyped = (state.settingsTyped || 0) + 1;
  }
  function form(body, id = "project-form") {
    return `<form id="${id}" data-settings-form data-edit="true" data-revision="${esc(state.project.revision)}"><div class="dialog-body"><div class="form-error hidden" role="alert"></div>${body}</div></form>`;
  }
  const field = (name, title, value, extra = "") =>
    `<label class="field">${title}<input name="${name}" value="${esc(value || "")}" ${extra}></label>`;
  function general() {
    const p = state.project;
    return form(
      `${field("title", "Project name", p.title, 'required maxlength="300"')}${field("key", "Project key", p.key, 'required pattern="[A-Za-z][A-Za-z0-9]{1,11}" maxlength="12"')}<p class="field-hint">Card IDs look like <strong data-key-example>${esc(p.key)}-1</strong>. Existing IDs remain available as aliases when the key changes.</p><label class="field">Description<textarea name="body" rows="4" placeholder="What is this project for?">${esc(p.body)}</textarea></label><div class="field-row"><div class="field">Project colour${colorPicker({ label: "Project colour", value: p.color })}</div><label class="field">Default view<select name="default_view">${options(["overview", "documents", "list", "tree", "table", "kanban", "board", "calendar", "timeline", "capacity"].filter((view) => viewOn({ off: state.config?.off }, view) || view === p.default_view), p.default_view === "drawing" ? "board" : p.default_view, { board: "Boards" })}</select></label></div>${projectViews()}`,
    );
  }
  // T39: the views and components this project offers; a component's box turns all its views on or off.
  function projectViews() {
    const on = (view) => !state.config?.views_off?.includes(view), names = { list: "List", tree: "Tree", table: "Table", kanban: "Kanban", calendar: "Calendar", timeline: "Timeline", capacity: "Capacity" };
    return `<fieldset class="card-fields project-views"><legend>Views</legend><p class="field-hint">Overview is always on. Views you turn off leave the tabs and the New menu; nothing in the project is deleted.</p>${VIEW_GROUPS.map(([id, name, views]) => `<div class="project-view-group"><label><input type="checkbox" data-view-group="${id}" ${views.some(on) ? "checked" : ""} ${views.length === 1 ? `name="project-view" value="${views[0]}"` : ""}> ${name}</label>${views.length > 1 ? `<div class="card-field-list">${views.map((view) => `<label><input type="checkbox" name="project-view" value="${view}" data-group="${id}" ${on(view) ? "checked" : ""}> ${names[view]}</label>`).join("")}</div>` : ""}</div>`).join("")}</fieldset>`;
  }
  function teams() {
    return form(
      `<label class="field">Organisation<select name="organisation" required>${state.organisations.map((o) => `<option value="${esc(o.id)}" ${o.id === state.project.organisation ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></label><p class="field-hint">Moving organisations moves this project, its cards and boards; then choose its teams from the new organisation.</p><div class="settings-assignee-summary"><h3>Available assignees</h3><p data-settings-assignees></p></div>`,
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
    return `<section class="settings-field-row" data-field-id="${esc(f.id)}"><div class="field-row"><label class="field">Field name<input data-field-name value="${esc(f.name)}" required maxlength="100"></label><label class="field">Field type<select data-field-type>${options(["text", "number", "date", "select", "checkbox"], f.type)}</select></label></div><label class="field" data-field-options-label ${f.type !== "select" ? "hidden" : ""}>Choices (one per line)<textarea data-field-options rows="3">${esc((f.options || []).join("\n"))}</textarea></label><div class="settings-field-meta"><span class="field-hint">${used ? `Used by ${used} card${used === 1 ? "" : "s"}` : "Not used yet"}</span><button type="button" class="button small" data-settings-remove-field ${used ? 'disabled title="Clear card values before removing this field"' : ""}>Remove field</button></div></section>`;
  }
  function structure(section) {
    if (section === "fields")
      return form(
        `<p class="field-hint" data-fields-empty ${state.config.fields.length ? "hidden" : ""}>No custom fields yet. Add a field when your cards need information beyond the built-in fields.</p><div data-settings-fields>${state.config.fields.map(customField).join("")}</div><button type="button" class="button" data-settings-add-field>${icon("plus")}Add field</button>`,
        "workflow-form",
      );
    const types =
      section === "hierarchy"
        ? `<div class="field type-list-field"><span id="type-list-label">Card types</span><input type="hidden" name="types" value="${esc(state.config.types.join(", "))}" required>${typeChipsHTML(state.config.types)}<div class="type-add"><input data-type-input data-settings-staging aria-label="New type name" placeholder="New type…" maxlength="30"><button type="button" class="button small" data-type-add>${icon("plus")}Add type</button></div><span class="field-hint">Types in use cannot be removed.</span></div>`
        : "";
    return form(types, "workflow-form");
  }
  function importPage() {
    return `<form id="settings-import" data-settings-form><div class="dialog-body"><p>Each selected Markdown file creates one card. Your original files are kept. To keep an Obsidian folder in sync, use ${link("sources", "Data sources & sync")} instead.</p><label class="field">Markdown notes<input type="file" name="notes" accept=".md,text/markdown" multiple required></label><p class="field-hint">Up to 200 files per import. Review the selection before creating cards.</p><div data-import-preview aria-live="polite"></div><div class="form-error hidden" role="alert"></div></div><div class="dialog-foot"><button type="submit" class="button primary" disabled>Import selected notes</button></div></form>`;
  }
  function advanced() {
    return `<div class="settings-page-body"><section class="settings-action-row"><div><h3>Version history</h3><p>Review saved project settings and restore an earlier version.</p></div><button class="button" data-feature="project-history">Version history</button></section><section class="settings-action-row"><div><h3>${state.project.archived ? "Restore archived project" : "Archive project"}</h3><p>Keep cards and boards while hiding the project from active planning. Restore it at any time.</p></div><button class="button" data-feature="project-archive">${state.project.archived ? "Unarchive project" : "Archive project"}</button></section><section class="settings-action-row settings-danger"><div><h3>Move project to Trash</h3><p>Moves this project and all its cards and boards to Trash. Recover it from Settings → Recovery &amp; backups.</p></div><button class="button danger" data-feature="project-delete">Move to Trash</button></section></div>`;
  }
  async function diagnostics(host, valid) {
    const data = await api("/diagnostics");
    if (!valid()) return;
    const errors = Object.values(data.errors || {}).reduce((a, b) => a + b, 0);
    host.innerHTML = `<div class="settings-page-body"><div class="settings-health-summary"><section><strong>${Math.floor(data.uptime_seconds / 60)} min</strong><span>Server uptime</span></section><section><strong>${errors}</strong><span>HTTP errors since restart</span></section><section><strong>${data.journal_conflicts?.length || 0}</strong><span>File recovery conflicts</span></section></div><section class="settings-action-row"><div><h3>Search index</h3><p>Rebuild if search results do not match the files in your vault. This does not change your cards or boards.</p></div><button class="button" data-settings-rebuild>Rebuild search index</button></section><p role="status" data-diagnostics-result></p><details><summary>Technical details</summary><pre class="source-description">${esc(JSON.stringify(data, null, 2))}</pre></details></div>`;
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
    const pages = pagesFor(state.project);
    const [section, title, , , description] = pages.find(([id]) => id === state.settingsSection) || pages[0];
    state.settingsSection = section;
    const detail = state.settingsDetail || "";
    // A new section starts at the top; saves and refreshes of the same one keep its scroll.
    const key = `${state.project?.id || ""}/${section}/${detail}`;
    // After an autosave the page around it is redrawn but the panel is kept as it is, with its open
    // menus and half-made edits, and its form stays the current one.
    const keep = state.settingsKeep && key === shown && panel;
    state.settingsKeep = false;
    const serial = keep ? sequence : ++sequence,
      projectId = state.project?.id;
    if (key !== shown) pageScroll = 0;
    shown = key;
    const valid = () =>
      serial === sequence &&
      state.project?.id === projectId &&
      current(section) &&
      (state.settingsDetail || "") === detail;
    let group = "";
    document.querySelector("#view-toolbar").innerHTML = "";
    const content = document.querySelector("#view-content");
    content.className = "content project-settings-page project-settings-layout";
    content.innerHTML = `<aside class="settings-navigation"><h1>Settings</h1><p>${esc(state.project?.title || state.organisation?.title || "")}</p><nav aria-label="Settings sections">${pages
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
      )}</nav><label class="field settings-mobile-nav">Settings section<select id="settings-section-select">${pages.map(([id, name]) => `<option value="${id}" ${id === section ? "selected" : ""}>${name}</option>`).join("")}</select></label><button type="button" class="button settings-return" data-action="settings-close">${icon("arrow-left")}${state.project ? "Back to project" : "Back"}</button></aside><section class="settings-content"><header class="settings-section-heading">${detail ? `${link(section, "← Back to " + title)}` : ""}<h2 id="settings-page-title" tabindex="-1">${esc(title)}</h2><span class="settings-save-state" role="status" data-settings-save-state>${esc(state.settingsSaveState || "")}</span><p>${description}</p></header><div id="settings-panel" aria-live="polite"><p class="settings-loading" role="status">Loading ${esc(title.toLowerCase())}…</p></div></section>`;
    // The rail is rebuilt with the page: keep where it was scrolled to, with the open section in view.
    const rail = content.querySelector(".settings-navigation");
    rail.scrollTop = railScroll;
    rail.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
    const pane = content.querySelector(".settings-content");
    if (keep) {
      document.querySelector("#settings-panel").replaceWith(panel);
      pane.scrollTop = pageScroll;
      return;
    }
    const host = (panel = document.querySelector("#settings-panel"));
    // Before the form's own listeners, so a save started by this change doesn't count it as a later edit.
    host.addEventListener("input", markDirty, true);
    host.addEventListener("change", markDirty, true);
    try {
      // A section opened during a save would show the project from before it, and a change made in
      // it would be lost or undo the save: it shows Loading… until the save has finished.
      if (state.settingsSaving) {
        while (state.settingsSaving) await new Promise((resolve) => setTimeout(resolve, 50));
        if (!valid()) return;
      }
      if (section === "personal") {
        host.innerHTML = personal().html();
        personal().mounted(host);
        return;
      }
      if (section === "organisation") {
        host.innerHTML = ctx.organisationFormHTML();
        // People and teams are edited here, their one home.
        const organisationForm = host.querySelector("form");
        organisationEditor(organisationForm);
        autosaveSettings(organisationForm, () => organisationForm.querySelector('[type="submit"]').disabled, state);
        return;
      }
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
      if (section === "trash" || section === "audit") {
        await records[section](host, valid);
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
      if (section === "general") {
        // The default view offers only the views that are on, and moves to Overview when its view goes.
        const defaults = () => {
          const on = new Set([...f.querySelectorAll('[name="project-view"]:checked')].map((box) => box.value)), select = f.elements.default_view;
          for (const option of select.options) option.disabled = option.value !== "overview" && !on.has(option.value);
          if (select.selectedOptions[0]?.disabled) select.value = "overview";
        };
        f.addEventListener("change", (event) => {
          const { viewGroup, group } = event.target.dataset, boxes = (id) => [...f.querySelectorAll(`[data-group="${id}"]`)];
          if (viewGroup) for (const box of boxes(viewGroup)) box.checked = event.target.checked;
          else if (group) f.querySelector(`[data-view-group="${group}"]`).checked = boxes(group).some((box) => box.checked);
          if (viewGroup || group) defaults();
        });
        defaults();
      }
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
        // Moving to another organisation moves the cards and boards too: ask before it saves. Its
        // teams belong to the old organisation, so they are chosen again there.
        f.addEventListener("change", (event) => {
          const select = f.elements.organisation;
          if (select.value === state.project.organisation || confirm(`Move this project to ${select.selectedOptions[0].text}? Its cards and boards move with it, and you then choose its teams there.`)) return;
          event.stopImmediatePropagation();
          select.value = state.project.organisation;
        }, true);
      }
      if (["workflow", "hierarchy"].includes(section))
        workflowEditor(f, schema, state.tasks, ctx, { section });
      // Assignee, status and priority share one box whose border takes the priority's colour.
      if (section === "workflow")
        f.querySelector(".dialog-body").insertAdjacentHTML("beforeend", `<fieldset class="card-fields"><legend>Card fields</legend><p class="field-hint">Cards always show their ID and title. Turn off the fields this project doesn't use: their values stay in the files, and views that need a field that's off leave the tabs.</p><div class="card-field-list">${CARD_FIELDS.map(([key, name]) => `<label><input type="checkbox" name="card-field" value="${key}" ${fieldOn(schema, key) ? "checked" : ""}> ${name}</label>`).join("")}</div></fieldset><fieldset class="priority-colors"><legend>Priority colours</legend><p class="field-hint">A card's assignee, status and priority share one box with a border in its priority's colour.</p><div class="priority-color-list">${priorityOptions.map((priority) => `<div class="field">${esc(priorityLabel(priority))}${colorPicker({ label: `${priorityLabel(priority)} priority colour`, value: taskFieldColor(state, "priority", priority), name: `priority-color-${priority}` })}</div>`).join("")}</div></fieldset>`);
      if (section !== "import") autosaveSettings(f, () => state.settingsSaving, state);
      f.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        // One save at a time: a change made meanwhile is saved after it (autosaveSettings).
        if (state.settingsSaving) return;
        const submit = f.querySelector('[type="submit"]'),
          error = f.querySelector(".form-error"),
          edits = state.settingsEdits,
          typed = state.settingsTyped;
        if (submit) submit.disabled = true;
        else settingsSaveState(state, "Saving…");
        state.settingsSaving = true;
        state.settingsSavingEdits = edits;
        error.classList.add("hidden");
        try {
          const data = new FormData(f);
          // The project as it is now: an earlier save from this page is already in it.
          const config = structuredClone(state.config);
          let changes;
          if (section === "general") {
            changes = Object.fromEntries(data);
            delete changes["project-view"];
            const on = data.getAll("project-view"), off = VIEW_GROUPS.flatMap(([, , views]) => views).filter((view) => !on.includes(view));
            if (off.join() !== (config.views_off || []).join()) changes.schema = { ...config, views_off: off.length ? off : undefined };
          }
          if (section === "teams")
            changes = {
              organisation: data.get("organisation"),
              teams: JSON.parse(data.get("teams")),
            };
          if (["workflow", "hierarchy"].includes(section))
            changes = { schema: JSON.parse(data.get("workflowSchema")) };
          if (section === "workflow") {
            // Only colours that differ from the defaults are kept, so the defaults can change later.
            const colors = Object.fromEntries(priorityOptions.map((priority) => [priority, data.get(`priority-color-${priority}`)]).filter(([priority, color]) => color && color !== priorityColors[priority]));
            changes.schema.priority_colors = Object.keys(colors).length ? colors : undefined;
            const on = data.getAll("card-field"), off = CARD_FIELDS.map(([key]) => key).filter((key) => !on.includes(key));
            changes.schema.off = off.length ? off : undefined;
          }
          if (section === "fields")
            changes = {
              schema: {
                ...config,
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
                `Imported ${result.tasks.length} ${result.tasks.length === 1 ? "note as a card" : "notes as cards"}.`;
            }
            toast(
              `Imported ${result.tasks.length} note${result.tasks.length === 1 ? "" : "s"}.`,
            );
          } else {
            const saved = await api(`/projects/${projectId}`, {
              method: "PATCH",
              body: { ...changes, revision: f.dataset.revision },
            });
            // The next save checks against this one, so an edit made elsewhere since still conflicts.
            f.dataset.revision = saved.revision;
            state.settingsFailed = false;
            await refresh(false);
            if (!f.isConnected) {
              // Left during the save: a Settings page shown since is redrawn with the saved values,
              // unless it has edits of its own.
              if (showing() && !state.settingsDirty) renderApp();
            } else if (state.settingsEdits !== edits) {
              // A change made during the save is saved next instead of being redrawn away.
              settingsSaveState(state, "Saved");
              queueMicrotask(() => {
                if (!f.isConnected) return;
                if (f.checkValidity()) f.requestSubmit();
                else settingsSaveState(state, "Not saved");
              });
            } else {
              settingsSaveState(state, "Saved");
              if (state.settingsTyped === typed) clean();
              if (valid()) {
                state.settingsKeep = true;
                renderApp();
                state.settingsKeep = false;
              }
            }
          }
        } catch (e) {
          if (!submit && f.isConnected) {
            settingsSaveState(state, "Not saved");
            state.settingsFailed = true;
          }
          if (f.isConnected) {
            error.textContent = e.message;
            error.classList.remove("hidden");
          } else toast(e.message, true);
        } finally {
          state.settingsSaving = false;
          if (submit) submit.disabled = !f.elements.notes.files.length;
        }
      });
    } catch (e) {
      if (valid())
        host.innerHTML = `<div class="settings-page-body"><p class="form-error" role="alert">${esc(e.message)}</p><button class="button" data-settings-retry>Try again</button></div>`;
    } finally {
      if (pane.isConnected) pane.scrollTop = pageScroll;
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
    if (target.hasAttribute("data-settings-parent")) open(page()[0]);
    if (target.hasAttribute("data-settings-retry")) void render();
    if (target.hasAttribute("data-settings-add-field")) {
      document
        .querySelector("[data-settings-fields]")
        .insertAdjacentHTML("beforeend", customField());
      document.querySelector("[data-fields-empty]").hidden = true;
      focusOnOpen(document.querySelector("[data-settings-fields] section:last-child input"), target);
    }
    if (target.hasAttribute("data-settings-remove-field")) {
      const fields = target.closest("form");
      target.closest("[data-field-id]").remove();
      document.querySelector("[data-fields-empty]").hidden =
        !!document.querySelector("[data-field-id]");
      fields.dispatchEvent(new Event("change", { bubbles: true }));
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
  document.addEventListener("scroll", (event) => {
    if (event.target.classList?.contains("settings-navigation")) railScroll = event.target.scrollTop;
    if (event.target.classList?.contains("settings-content")) pageScroll = event.target.scrollTop;
  }, true);
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
