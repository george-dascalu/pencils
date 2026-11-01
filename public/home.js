import { compact, stackOrder } from "./home-grid.js";
import { anchoredPanel } from "./anchored-panel.js";
import { markdownSlice } from "./canvas-format.js";
import { localDate } from "./task-visibility.js";

// The personal Home (owner request T22, 31 October 2026): each person's own page of panels on a
// 12-column grid (40px rows), kept on the server (server/home.js). Edit layout drags and resizes
// panels by hand, pushing overlapped panels down (home-grid.js), adds from a catalogue and removes;
// every change saves at once. Phones stack the panels in reading order (home.css).
const ROW = 40, GAP = 12, COLUMNS = 12, ROWS = 400;
const VIEWS = ["list", "tree", "table", "kanban", "calendar", "timeline", "capacity"];
const TYPES = [
  ["projects", "Projects", "folder", { w: 12, h: 4 }],
  ["bookmarks", "Bookmarks", "star", { w: 4, h: 6 }],
  ["commands", "Commands", "play", { w: 4, h: 5 }],
  ["recent", "Recent", "clock", { w: 4, h: 6 }],
  ["visited", "Most visited", "activity", { w: 4, h: 6 }],
  ["web", "Web page", "external", { w: 6, h: 8 }],
  ["tasks", "Card list", "task", { w: 6, h: 6 }],
  ["stat", "Stat", "status", { w: 3, h: 3 }],
  ["breakdown", "Breakdown", "table", { w: 4, h: 5 }],
  ["note", "Note", "text", { w: 6, h: 4 }],
  ["document", "Document", "file", { w: 6, h: 6 }],
];
const typeOf = (type) => TYPES.find((t) => t[0] === type) || TYPES[0];
const KINDS = [["card", "Cards"], ["doc", "Documents"], ["board", "Boards"], ["view", "Views"]];
const itemIcons = { card: "task", doc: "file", board: "board" };
const DUE = [["", "Any time"], ["overdue", "Overdue"], ["today", "Due today"], ["next7", "Due in the next 7 days"], ["none", "No due date"]];
const BY = [["status", "Status"], ["priority", "Priority"], ["assignee", "Assignee"]];

export function installHome(ctx) {
  const { state, api, esc, icon, toast, bookmarks, commands, markdown, welcomePage, renderApp, viewLabel } = ctx;
  let panels = null, loading = null, saving = Promise.resolve(), snapshots = new Map(), visitsCache = new Map(), lastVisit = "", onHome = false;
  const panelsUI = anchoredPanel(ctx);
  const me = () => state.session?.user?.name || state.session?.user?.username || "";
  const projects = () => state.projects.filter((p) => p.organisation === state.organisation?.id && !p.archived && !p.personal);
  const projectOf = (settings) => projects().find((p) => p.id === settings.project) || projects()[0] || null;
  const newId = () => `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const bottom = () => panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
  // A bookmarked view is named by its view and project, as on the bottom bar.
  const itemTitle = (item) => (item.kind === "view" ? `${viewLabel(item.id)} · ${item.project_title}` : item.title);
  const itemButton = (item, extra = "") => `<button type="button" class="home-item" data-feature="search-open" data-kind="${esc(item.kind)}" data-id="${esc(item.id)}" data-project="${esc(item.project)}" title="${esc(itemTitle(item))}">${icon(item.kind === "view" ? item.id : itemIcons[item.kind] || "file")}<span>${esc(itemTitle(item))}</span>${extra}</button>`;

  async function load() {
    if (!loading) loading = api("/home").then((data) => (panels = data.panels)).catch((error) => { loading = null; throw error; });
    return loading;
  }
  // Saves in order; resolves to whether this save was accepted.
  function save() {
    const sent = panels.map((p) => ({ ...p }));
    const status = document.querySelector("#home-save");
    if (status) status.textContent = "Saving…";
    const result = saving.then(() => api("/home", { method: "PATCH", body: { panels: sent } })).then(() => {
      if (document.querySelector("#home-save")) document.querySelector("#home-save").textContent = "Saved automatically";
      return true;
    }, (error) => {
      toast(error.message, true);
      return false;
    });
    saving = result;
    return result;
  }
  const editing = () => !!state.homeEditing;

  // ----- Markup -----
  function html() {
    // The first draw shows a placeholder and redraws once the layout has loaded. Panel data is
    // fetched once per stay on Home, not per redraw.
    if (!panels && !loading) void load().then(() => renderApp()).catch((error) => toast(error.message, true));
    if (!onHome) {
      visitsCache = new Map();
      snapshots = new Map();
      onHome = true;
    }
    const add = `<details class="board-menu" data-board-menu="home-add"><summary class="button small" title="Add a panel">${icon("plus")}Add panel</summary><div class="board-menu-panel">${TYPES.map(([type, name, glyph]) => `<button type="button" data-home-add="${type}">${icon(glyph)}${esc(name)}</button>`).join("")}</div></details>`;
    return `<div id="view-toolbar"><div class="board-toolbar home-toolbar"><span class="board-save" id="home-save">${panels ? "Saved automatically" : "Loading…"}</span>${editing() ? add : ""}<button type="button" class="icon-button" id="home-edit" data-home="edit" aria-pressed="${editing()}" aria-label="Edit layout" title="Edit layout">${icon("pencil")}</button></div></div>
    <section id="view-content" class="home content${editing() ? " editing" : ""}" aria-label="Home" ${editing() ? 'data-editing=""' : ""}>${panels ? `<div class="home-grid">${stackOrder(panels).map(panelHTML).join("")}</div>` : '<p role="status" class="home-loading">Loading your home…</p>'}</section>`;
  }
  function panelHTML(p) {
    const [, name] = typeOf(p.type), title = p.settings.title || name, edit = editing();
    const menu = edit ? `<details class="board-menu" data-board-menu="panel-${esc(p.id)}"><summary class="icon-summary" aria-label="Panel options" title="Panel options">${icon("more")}</summary><div class="board-menu-panel">${p.type === "projects" ? "" : `<button type="button" data-home-panel-action="settings" data-panel="${esc(p.id)}">${icon("settings")}Settings</button>`}<button type="button" data-home-panel-action="duplicate" data-panel="${esc(p.id)}">${icon("duplicate")}Duplicate</button><button type="button" data-home-panel-action="remove" data-panel="${esc(p.id)}">${icon("trash")}Remove</button></div></details>` : "";
    return `<article class="home-panel" data-panel="${esc(p.id)}" data-type="${esc(p.type)}" style="--x:${p.x};--y:${p.y};--w:${p.w};--h:${p.h}" aria-labelledby="home-panel-${esc(p.id)}"><header class="home-panel-head">${edit ? `<button type="button" class="icon-button" data-home-drag aria-label="Move ${esc(title)}" title="Drag to move">${icon("drag")}</button>` : ""}<h2 id="home-panel-${esc(p.id)}">${esc(title)}</h2>${menu}</header><div class="home-panel-body">${bodyNow(p)}</div>${edit ? `<button type="button" class="home-panel-resize" data-home-resize aria-label="Resize ${esc(title)}" title="Drag to resize"></button>` : ""}</article>`;
  }
  // Bodies that need no data draw at once; the others fill in after mounting.
  function bodyNow(p) {
    const s = p.settings;
    if (p.type === "projects") return welcomePage();
    if (p.type === "commands") {
      const list = commands().filter((c) => !s.ids?.length || s.ids.includes(c.id));
      return list.length ? `<div class="home-list">${list.map((c) => `<button type="button" class="home-item" data-feature="command-run" data-command="${esc(c.id)}">${icon("play")}<span>${esc(c.title)}</span></button>`).join("")}</div>` : '<p class="field-hint">No commands here. Open a project for its commands, or choose some in Settings.</p>';
    }
    if (p.type === "note") return s.text ? `<div class="home-note canvas-markdown">${markdown(s.text)}</div>` : '<p class="field-hint">Open the panel\'s Settings to write a note.</p>';
    if (p.type === "web") {
      if (!s.url) return '<p class="field-hint">Open the panel\'s Settings to choose a page.</p>';
      if (s.embeddable === false) return `<a class="home-link-card" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${icon("external")}<strong>${esc(s.title || s.url)}</strong><span>${esc(s.url)}</span><em>This site can't be shown here. Open it in a new tab.</em></a>`;
      return `<iframe class="home-web" src="${esc(s.url)}" title="${esc(s.title || s.url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer" loading="lazy"></iframe>`;
    }
    return '<p class="home-loading field-hint">Loading…</p>';
  }
  async function fill(el) {
    const p = panels?.find((x) => x.id === el.dataset.panel);
    if (!p || ["projects", "commands", "note", "web"].includes(p.type)) return;
    const body = el.querySelector(".home-panel-body");
    try {
      body.innerHTML = await bodyLater(p);
    } catch (error) {
      body.innerHTML = `<p class="field-hint">${esc(error.message)}</p>`;
    }
  }
  async function visits(days, kinds) {
    const query = `days=${days}&kinds=${kinds.join(",")}`;
    if (!visitsCache.has(query)) visitsCache.set(query, api(`/visits?${query}`).catch((error) => { visitsCache.delete(query); throw error; }));
    return visitsCache.get(query);
  }
  async function snapshot(id) {
    if (!snapshots.has(id)) snapshots.set(id, api(`/projects/${id}`).catch((error) => { snapshots.delete(id); throw error; }));
    return snapshots.get(id);
  }
  const config = (snap) => snap.project.schema || { statuses: ["backlog", "todo", "in-progress", "review", "done"], done: ["done"] };
  function matching(snap, s) {
    const today = localDate(), week = new Date(); week.setDate(week.getDate() + 7);
    const next7 = localDate(week), done = new Set(config(snap).done || ["done"]);
    return snap.tasks.filter((t) => !t.archived
      && (!s.status || t.status === s.status)
      && (!s.type || t.type === s.type)
      && (!s.assignee || (s.assignee === "me" ? t.assignee === me() : t.assignee === s.assignee))
      && (!s.due || (s.due === "none" ? !t.due : s.due === "today" ? t.due === today : s.due === "next7" ? t.due && t.due >= today && t.due <= next7 : s.due === "overdue" ? t.due && t.due < today && !done.has(t.status) : true)));
  }
  async function bodyLater(p) {
    const s = p.settings;
    if (p.type === "bookmarks") {
      const list = (await bookmarks.list()).slice(0, s.limit || 20);
      return list.length ? `<div class="home-list${s.layout === "grid" ? " home-grid-list" : ""}">${list.map((b) => itemButton(b)).join("")}</div>` : '<p class="field-hint">Nothing bookmarked yet. Press the star beside a card, document, board or view.</p>';
    }
    if (p.type === "recent" || p.type === "visited") {
      const kinds = s.kinds?.length ? s.kinds : ["card", "doc", "board"], days = s.days || 30;
      const data = await visits(p.type === "recent" ? 365 : days, kinds);
      const list = (p.type === "recent" ? data.recent : data.visited).slice(0, s.limit || 10);
      return list.length ? `<div class="home-list">${list.map((v) => itemButton(v, p.type === "visited" ? `<small>${v.count}</small>` : "")).join("")}</div>` : `<p class="field-hint">${p.type === "recent" ? "Things you open show up here." : "Nothing visited in the last " + days + " days."}</p>`;
    }
    const project = projectOf(s);
    if (!project) return '<p class="field-hint">No project in this organisation yet.</p>';
    const snap = await snapshot(project.id);
    if (p.type === "tasks") {
      const list = matching(snap, s), shown = list.slice(0, s.limit || 20);
      return `<p class="home-count">${list.length} ${list.length === 1 ? "card" : "cards"} · ${esc(project.title)}</p>${shown.length ? `<div class="home-list">${shown.map((t) => `<button type="button" class="home-item home-task" data-feature="search-open" data-kind="card" data-id="${esc(t.id)}" data-project="${esc(project.id)}"><span class="home-task-key">${esc(t.key || "")}</span><span>${esc(t.title)}</span><span class="home-task-status">${esc(t.status)}</span>${t.due ? `<span class="home-task-due">${esc(t.due)}</span>` : ""}</button>`).join("")}</div>` : '<p class="field-hint">No cards match.</p>'}`;
    }
    if (p.type === "stat") {
      const count = matching(snap, s).length, over = s.threshold != null && s.threshold > 0 && count >= s.threshold;
      return `<button type="button" class="home-stat${over ? " over" : ""}" data-feature="search-open" data-kind="view" data-id="list" data-project="${esc(project.id)}" title="Open the list"><strong>${count}</strong><span>${esc(project.title)}</span></button>`;
    }
    if (p.type === "breakdown") {
      const by = s.by || "status", counts = new Map();
      for (const t of snap.tasks.filter((t) => !t.archived)) counts.set(t[by] || "—", (counts.get(t[by] || "—") || 0) + 1);
      const max = Math.max(1, ...counts.values());
      return counts.size ? `<div class="home-bars">${[...counts].sort((a, b) => b[1] - a[1]).map(([name, n]) => `<div class="home-bar"><span>${esc(name)}</span><i style="--share:${n / max}"></i><b>${n}</b></div>`).join("")}</div>` : '<p class="field-hint">No cards yet.</p>';
    }
    if (p.type === "document") {
      const doc = (snap.documents || []).find((d) => d.id === s.document);
      if (!doc) return '<p class="field-hint">Open the panel\'s Settings to choose a document.</p>';
      const data = await api(`/projects/${project.id}/documents/${doc.id}`), text = (data.document || data).body || "";
      const slice = s.heading ? markdownSlice(text, `#${s.heading}`) : null;
      if (s.heading && !slice) return `<p class="field-hint">No heading "${esc(s.heading)}" in ${esc(doc.title)}.</p>`;
      return `<div class="home-note canvas-markdown">${markdown(slice ? slice.text : text)}</div>`;
    }
    return "";
  }
  function mount() {
    for (const el of document.querySelectorAll(".home .home-panel")) void fill(el);
  }

  // ----- Editing -----
  function place(p) {
    const el = document.querySelector(`.home .home-panel[data-panel="${CSS.escape(p.id)}"]`);
    if (el) for (const k of ["x", "y", "w", "h"]) el.style.setProperty(`--${k}`, p[k]);
  }
  function update(next, movedId) {
    panels = compact(next, movedId);
    panels.forEach(place);
  }
  function add(type) {
    const [, , , size] = typeOf(type);
    panels.push({ id: newId(), type, x: 0, y: bottom(), ...size, settings: {} });
    void save();
    renderApp();
  }
  function remove(id) {
    panels = panels.filter((p) => p.id !== id);
    void save();
    renderApp();
  }
  function duplicate(id) {
    const p = panels.find((x) => x.id === id);
    if (!p) return;
    panels.push({ ...p, id: newId(), y: bottom(), settings: { ...p.settings } });
    void save();
    renderApp();
  }
  let drag = null;
  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-home-drag], [data-home-resize]");
    if (!handle || !editing() || !panels) return;
    const el = handle.closest(".home-panel"), p = panels.find((x) => x.id === el.dataset.panel), grid = document.querySelector(".home .home-grid");
    if (!p || !grid) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    // A column's pitch is its width plus the gap, as a row's is ROW plus the gap.
    drag = { id: p.id, resize: handle.hasAttribute("data-home-resize"), x: event.clientX, y: event.clientY, start: { ...p }, cell: (grid.getBoundingClientRect().width + GAP) / COLUMNS, pointer: event.pointerId };
    el.classList.add("moving");
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const dx = Math.round((event.clientX - drag.x) / drag.cell), dy = Math.round((event.clientY - drag.y) / (ROW + GAP));
    step(drag.id, drag.start, dx, dy, drag.resize);
  }, true);
  // Moves or resizes a panel by whole cells from a starting place, inside the grid.
  function step(id, s, dx, dy, resize) {
    const next = resize
      ? { w: Math.max(1, Math.min(COLUMNS - s.x, s.w + dx)), h: Math.max(1, Math.min(ROWS - s.y, s.h + dy)) }
      : { x: Math.max(0, Math.min(COLUMNS - s.w, s.x + dx)), y: Math.max(0, Math.min(ROWS - s.h, s.y + dy)) };
    const current = panels.find((p) => p.id === id);
    if (["x", "y", "w", "h"].every((k) => (next[k] ?? current[k]) === current[k])) return false;
    update(panels.map((p) => (p.id === id ? { ...s, ...next } : p)), id);
    return true;
  }
  // Arrow keys move a panel from its drag handle and resize it from its corner handle.
  document.addEventListener("keydown", (event) => {
    const handle = event.target.closest?.("[data-home-drag], [data-home-resize]");
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!handle || !delta || !editing() || !panels) return;
    const p = panels.find((x) => x.id === handle.closest(".home-panel").dataset.panel);
    if (!p) return;
    event.preventDefault();
    if (step(p.id, { ...p }, delta[0], delta[1], handle.hasAttribute("data-home-resize"))) void save();
  });
  const finish = (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    document.querySelector(`.home .home-panel[data-panel="${CSS.escape(drag.id)}"]`)?.classList.remove("moving");
    drag = null;
    void save();
  };
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", finish, true);

  // ----- Settings -----
  function settingsHTML(p) {
    const s = p.settings, projectOptions = (chosen) => projects().map((pr) => `<option value="${esc(pr.id)}" ${pr.id === (chosen || projectOf(s)?.id) ? "selected" : ""}>${esc(pr.title)}</option>`).join("");
    const title = `<label class="field">Title<input name="title" value="${esc(s.title || "")}" placeholder="${esc(typeOf(p.type)[1])}" maxlength="120"></label>`;
    const number = (name, label, value, placeholder) => `<label class="field">${label}<input name="${name}" type="number" min="0" max="1000" value="${value ?? ""}" placeholder="${placeholder}"></label>`;
    const kinds = (chosen) => `<div class="field"><span>Show</span><div class="home-checks">${KINDS.map(([k, l]) => `<label><input type="checkbox" name="kinds" value="${k}" ${(chosen?.length ? chosen : ["card", "doc", "board"]).includes(k) ? "checked" : ""}>${l}</label>`).join("")}</div></div>`;
    const snap = projectOf(s) && snapshots.get(projectOf(s).id);
    const filter = `${title}<label class="field">Project<select name="project">${projectOptions()}</select></label><label class="field">Status<input name="status" value="${esc(s.status || "")}" list="home-statuses" placeholder="Any"></label><datalist id="home-statuses"></datalist><label class="field">Assignee<select name="assignee"><option value="" ${!s.assignee ? "selected" : ""}>Anyone</option><option value="me" ${s.assignee === "me" ? "selected" : ""}>Me</option>${s.assignee && s.assignee !== "me" ? `<option value="${esc(s.assignee)}" selected>${esc(s.assignee)}</option>` : ""}</select></label><label class="field">Type<input name="type" value="${esc(s.type || "")}" placeholder="Any"></label><label class="field">Due<select name="due">${DUE.map(([v, l]) => `<option value="${v}" ${(s.due || "") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
    void snap;
    const forms = {
      bookmarks: `${title}<label class="field">Layout<select name="layout"><option value="list" ${s.layout !== "grid" ? "selected" : ""}>List</option><option value="grid" ${s.layout === "grid" ? "selected" : ""}>Grid</option></select></label>${number("limit", "At most", s.limit, "20")}`,
      commands: `${title}<div class="field"><span>Commands</span><div class="home-checks">${commands(true).map((c) => `<label><input type="checkbox" name="ids" value="${esc(c.id)}" ${!s.ids?.length || s.ids.includes(c.id) ? "checked" : ""}>${esc(c.title)}</label>`).join("")}</div></div>`,
      recent: `${title}${kinds(s.kinds)}${number("limit", "At most", s.limit, "10")}`,
      visited: `${title}${kinds(s.kinds)}${number("limit", "At most", s.limit, "10")}${number("days", "Within days", s.days, "30")}`,
      web: `${title}<label class="field">Address<input name="url" type="url" value="${esc(s.url || "")}" placeholder="https://" required></label><p class="field-hint">Sites that refuse to be embedded show a link card instead.</p>`,
      tasks: `${filter}${number("limit", "At most", s.limit, "20")}`,
      stat: `${filter}${number("threshold", "Warn from", s.threshold, "none")}`,
      breakdown: `${title}<label class="field">Project<select name="project">${projectOptions()}</select></label><label class="field">By<select name="by">${BY.map(([v, l]) => `<option value="${v}" ${(s.by || "status") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`,
      note: `${title}<label class="field">Text<textarea name="text" rows="6" placeholder="Markdown">${esc(s.text || "")}</textarea></label>`,
      document: `${title}<label class="field">Project<select name="project" data-home-reload>${projectOptions()}</select></label><label class="field">Document<select name="document" data-home-documents><option value="">Loading…</option></select></label><label class="field">From heading<input name="heading" value="${esc(s.heading || "")}" placeholder="Whole document"></label>`,
    };
    return `<form id="home-panel-settings" data-panel="${esc(p.id)}">${forms[p.type] || ""}<div class="dialog-foot"><button type="submit" class="button primary">Save</button></div></form>`;
  }
  async function fillDocuments(form, projectId, chosen) {
    const select = form.querySelector("[data-home-documents]");
    if (!select) return;
    const snap = await snapshot(projectId);
    select.innerHTML = `<option value="">Choose a document</option>${(snap.documents || []).map((d) => `<option value="${esc(d.id)}" ${d.id === chosen ? "selected" : ""}>${esc(d.title)}</option>`).join("")}`;
  }
  async function openSettings(button, id) {
    const p = panels.find((x) => x.id === id);
    if (!p) return;
    panelsUI.show(button, `${typeOf(p.type)[1]} settings`, settingsHTML(p), 360);
    const form = document.querySelector("#home-panel-settings");
    const projectId = projectOf(p.settings)?.id;
    if (projectId) {
      void fillDocuments(form, form.querySelector('[name="project"]')?.value || projectId, p.settings.document);
      const snap = await snapshot(projectId).catch(() => null);
      const list = form.querySelector("#home-statuses");
      if (snap && list) list.innerHTML = (config(snap).statuses || []).map((st) => `<option value="${esc(st)}">`).join("");
    }
  }
  document.addEventListener("change", (event) => {
    const select = event.target.closest("#home-panel-settings [data-home-reload]");
    if (select) void fillDocuments(select.form, select.value, "");
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#home-panel-settings");
    if (!form) return;
    event.preventDefault();
    const p = panels.find((x) => x.id === form.dataset.panel);
    if (!p) return;
    const data = new FormData(form), settings = {};
    for (const [key, value] of data) {
      if (["kinds", "ids"].includes(key)) (settings[key] ||= []).push(value);
      else if (["limit", "threshold", "days"].includes(key)) { if (value !== "") settings[key] = Number(value); }
      else if (value !== "") settings[key] = String(value);
    }
    if (p.type === "commands" && settings.ids?.length === commands(true).length) delete settings.ids;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (p.type === "web" && settings.url && settings.url !== p.settings.url) {
        const check = await api(`/home/embed?url=${encodeURIComponent(settings.url)}`);
        settings.embeddable = check.embeddable;
        // A title the page gave follows the page; one the person typed stays.
        if ((!settings.title || settings.title === p.settings.title) && check.title) settings.title = check.title;
      } else if (p.type === "web" && "embeddable" in p.settings) settings.embeddable = p.settings.embeddable;
      const before = p.settings;
      p.settings = settings;
      if (!(await save())) {
        p.settings = before;
        submit.disabled = false;
        return;
      }
      panelsUI.close();
      renderApp();
    } catch (error) {
      submit.disabled = false;
      toast(error.message, true);
    }
  });
  document.addEventListener("click", (event) => {
    const edit = event.target.closest('[data-home="edit"]');
    if (edit) {
      state.homeEditing = !editing();
      panelsUI.close();
      renderApp();
      return;
    }
    const added = event.target.closest("[data-home-add]");
    if (added && panels) return add(added.dataset.homeAdd);
    const action = event.target.closest("[data-home-panel-action]");
    if (!action || !panels) return;
    const { homePanelAction: kind, panel: id } = action.dataset;
    if (kind === "remove") remove(id);
    else if (kind === "duplicate") duplicate(id);
    else if (kind === "settings") void openSettings(action.closest(".home-panel").querySelector("summary"), id);
  });

  // ----- Visits -----
  // What the person opens, for Recent and Most visited: cards when their editor opens, and the
  // open document, board or view after each render; the same item isn't counted again at once.
  function visit(kind, project, id) {
    if (!project || !id) return;
    const key = `${kind}:${project}:${id}`;
    if (key === lastVisit) return;
    lastVisit = key;
    onHome = false;
    // Kept alive, so leaving the page or closing it at once (Safari cuts the request off) still records it.
    api("/visits", { method: "POST", body: { kind, project, id }, keepalive: true }).catch(() => {});
  }
  function visitCurrent() {
    const p = state.project;
    if (!p || p.personal || state.helpArticle) return;
    if (state.view === "documents" && state.selectedDocument) return visit("doc", p.id, state.selectedDocument);
    if (["board", "drawing"].includes(state.view) && state.selectedBoard) return visit("board", p.id, state.selectedBoard);
    if (VIEWS.includes(state.view)) visit("view", p.id, state.view);
  }
  return { html, mount, visit, visitCurrent };
}
