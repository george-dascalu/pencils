import { APP_VERSION } from "./app-version.js";
import { randomUUID } from "./uuid.js";
import { positionPopover } from "./popover-position.js";
import { REQUEST_STATUSES, REQUEST_PRIORITIES, REQUEST_ACCEPT, REQUEST_FILES, REQUEST_FILE_BYTES, REQUEST_TOTAL_BYTES } from "./feature-request-model.js";

export function featureRequests({ api, state, esc, icon, toast }) {
  let panel, opener, data, selected, mode = "list", files = [], busy = false, filter = "open", query = "";
  let draft;
  try { draft = JSON.parse(sessionStorage.getItem("pencils:feature-request-draft")); } catch {}
  draft ||= { id: `fr-${randomUUID()}`, title: "", body: "", priority: "normal" };
  const opts = (values, current) => Object.entries(values).map(([id, label]) => `<option value="${id}" ${id === current ? "selected" : ""}>${esc(label)}</option>`).join("");
  const button = (action, name, symbol) => `<button type="button" class="icon-button" data-request-action="${action}" aria-label="${name}" title="${name}">${icon(symbol)}</button>`;
  const size = bytes => bytes < 1000000 ? `${Math.ceil(bytes / 1000)} KB` : `${(bytes / 1000000).toFixed(1)} MB`;
  const date = value => `<time datetime="${esc(value)}" title="${esc(new Date(value).toLocaleString())}">${esc(new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</time>`;
  const status = r => `<span class="request-status" data-status="${r.status}">${icon(r.status === "done" ? "check" : r.status === "in-progress" ? "refresh" : "clock")}${REQUEST_STATUSES[r.status]}</span>`;
  function remember() { try { sessionStorage.setItem("pencils:feature-request-draft", JSON.stringify(draft)); } catch {} }
  function position() {
    if (!panel?.matches(":popover-open")) return;
    const anchor = opener?.isConnected ? opener.getBoundingClientRect() : { left: innerWidth - 560, top: 60, bottom: 60 };
    positionPopover(panel, anchor, { width: 560, maxHeight: Math.min(760, innerHeight - 32) });
  }
  function error(message) {
    const target = panel.querySelector(".request-error");
    target.textContent = message;
    target.hidden = !message;
  }
  function workerHTML() {
    if (!data) return "";
    const paused = !data.automatic;
    const message = paused ? "Automatic work is paused. Requests stay in the queue." : data.worker.message;
    return `<div class="request-worker"><span>${icon(paused ? "clock" : data.worker.state === "idle" ? "check" : "info")}<span>${esc(message)}</span></span>${button("automatic", paused ? "Resume automatic work" : "Pause automatic work", paused ? "play" : "pause")}</div>`;
  }
  function rows() {
    const records = (data?.requests || []).filter(r => (filter === "all" || (filter === "open" ? !["done", "cancelled"].includes(r.status) : r.status === filter)) && `${r.title} ${r.body} ${r.key}`.toLowerCase().includes(query.toLowerCase()));
    return records.length ? `<ul class="request-list">${records.slice().reverse().map(r => `<li><button type="button" class="request-row" data-request-id="${r.id}"><span class="request-row-title">${esc(r.title)}</span><span class="request-row-meta">${status(r)}<span>${esc(r.key)}</span>${r.attachments.length ? `<span aria-label="${r.attachments.length} attachments">${icon("file")}${r.attachments.length}</span>` : ""}${date(r.updated)}</span></button></li>`).join("")}</ul>` : `<p class="request-empty">${query || filter !== "open" ? "No requests match this view." : "No open requests. Describe an improvement and attach screenshots to get started."}</p>`;
  }
  function listHTML() {
    return `${workerHTML()}<div class="request-list-tools"><label class="sr-only" for="request-search">Search feature requests</label><input id="request-search" type="search" placeholder="Find a request…" value="${esc(query)}"><label class="sr-only" for="request-filter">Request status</label><select id="request-filter">${opts({ open: "Open", all: "All requests", ...REQUEST_STATUSES }, filter)}</select><button type="button" class="button primary" data-request-action="new">${icon("plus")}New</button></div><div data-request-rows>${rows()}</div><p class="field-hint request-location">Saved in the vault’s feature-requests folder, with a Markdown index.</p>`;
  }
  function fileList() {
    return files.map((file, index) => `<li><span>${icon("file")}<span>${esc(file.name)}<small>${size(file.size)}</small></span></span><button type="button" class="icon-button" data-request-remove="${index}" aria-label="Remove ${esc(file.name)}">${icon("close")}</button></li>`).join("");
  }
  function formHTML() {
    return `<form id="feature-request-form"><label class="field">Title<input name="title" value="${esc(draft.title)}" maxlength="180" required placeholder="What would you like to improve?"></label><label class="field">Description<textarea name="body" rows="6" maxlength="30000" required placeholder="Describe the change, what happens now and what you’d like to happen.">${esc(draft.body)}</textarea></label><label class="field">Priority<select name="priority">${opts(REQUEST_PRIORITIES, draft.priority)}</select></label><div class="request-upload"><label class="field">Attachments<input type="file" name="attachments" accept="${REQUEST_ACCEPT}" multiple></label><p class="field-hint">Choose files, drop them here or paste a screenshot. Up to 5 files, 10 MB each and 20 MB total.</p><ul class="request-files">${fileList()}</ul></div><p class="field-hint">${state.project ? `Context: ${esc(state.project.title)} · ${esc(state.view)}.` : "Request an improvement to Pencils."} Your request will join the work queue.</p><div class="request-form-actions"><button type="button" class="button" data-request-action="back">Back</button><button type="submit" class="button primary">${icon("plus")}Send request</button></div></form>`;
  }
  function detailHTML(r) {
    return `<div class="request-detail"><div class="request-detail-meta"><span>${esc(r.key)}</span>${status(r)}${date(r.created)}</div><h3>${esc(r.title)}</h3><div class="request-description">${esc(r.body)}</div>${r.context ? `<p class="field-hint">${esc(r.context)} · v${esc(r.app_version)}</p>` : ""}${r.attachments.length ? `<ul class="request-attachments">${r.attachments.map(a => `<li><a href="${a.url}" target="_blank" rel="noopener" download="${esc(a.name)}">${/\.(png|jpe?g|gif|webp)$/i.test(a.name) ? `<img src="${a.url}" alt="${esc(a.name)}" loading="lazy">` : icon("file")}<span>${esc(a.name)}<small>${size(a.size)}</small></span></a></li>`).join("")}</ul>` : ""}<h4>Progress</h4><ol class="request-activity">${r.activity.map(a => `<li><div><strong>${esc(a.author)}</strong>${date(a.at)}</div><p>${esc(a.text)}</p></li>`).join("")}</ol><form id="request-update-form"><div class="field-row"><label class="field">Status<select name="status" ${r.status === "in-progress" ? "disabled" : ""}>${opts(Object.fromEntries(Object.entries(REQUEST_STATUSES).filter(([s]) => s !== "in-progress" || r.status === s)), r.status)}</select></label><label class="field">Priority<select name="priority">${opts(REQUEST_PRIORITIES, r.priority)}</select></label></div><label class="field">Add an update<textarea name="note" rows="3" maxlength="10000" placeholder="Add details, answer a question or explain a status change…"></textarea></label><div class="request-form-actions"><button type="submit" class="button primary">Save update</button></div></form><p class="field-hint request-location">${esc(r.folder)}/request.md</p></div>`;
  }
  function render() {
    const hadFocus = panel.contains(document.activeElement);
    const action = document.activeElement?.closest("[data-request-action]")?.dataset.requestAction;
    panel.innerHTML = `<header>${mode !== "list" ? button("back", "Back to requests", "arrow-left") : ""}<h2 tabindex="-1">${mode === "new" ? "New feature request" : "Feature requests"}</h2>${mode !== "new" ? button("refresh", "Refresh requests", "refresh") : ""}${button("close", "Close feature requests", "close")}</header><div class="request-error form-error" role="alert" hidden></div><div class="request-content">${!data && mode === "list" ? '<p role="status">Loading requests…</p>' : mode === "new" ? formHTML() : mode === "detail" ? detailHTML(selected) : listHTML()}</div>`;
    position();
    if (hadFocus) (action && panel.querySelector(`[data-request-action="${CSS.escape(action)}"]`) || panel.querySelector("header h2")).focus({ preventScroll: true });
  }
  async function refresh() {
    data = await api("/feature-requests");
    if (mode === "detail") selected = data.requests.find(r => r.id === selected.id) || selected;
    render();
  }
  async function addFiles(incoming) {
    const next = [...files, ...incoming];
    if (next.length > REQUEST_FILES || next.some(f => f.size > REQUEST_FILE_BYTES) || next.reduce((sum, f) => sum + f.size, 0) > REQUEST_TOTAL_BYTES) return error("Use up to 5 files, 10 MB each and 20 MB total.");
    if (next.some(f => !REQUEST_ACCEPT.split(",").includes(`.${f.name.split(".").pop().toLowerCase()}`))) return error("Use images, PDF, text, Markdown, CSV or ZIP files.");
    files = next;
    panel.querySelector(".request-files").innerHTML = fileList();
    error(""); position();
  }
  const encoded = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: reader.result.split(",")[1] });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Choose the file again.`));
    reader.readAsDataURL(file);
  });
  async function submit(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    if (busy) return;
    const form = event.target, fields = new FormData(form);
    busy = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      if (form.id === "feature-request-form") {
        draft = { ...draft, title: fields.get("title"), body: fields.get("body"), priority: fields.get("priority") }; remember();
        selected = await api("/feature-requests", { method: "POST", body: { ...draft, attachments: await Promise.all(files.map(encoded)), context: state.project ? `${state.project.title} · ${state.view}` : "Workspace", app_version: APP_VERSION } });
        files = []; draft = { id: `fr-${randomUUID()}`, title: "", body: "", priority: "normal" }; remember();
        mode = "detail";
        toast(`${selected.key} added to feature requests.`);
      } else {
        selected = await api(`/feature-requests/${selected.id}`, { method: "PATCH", body: { revision: selected.revision, status: fields.get("status") || selected.status, priority: fields.get("priority"), note: fields.get("note") } });
        toast("Request updated.");
      }
      await refresh();
    } catch (e) { error(e.message); }
    finally { busy = false; submit.disabled = false; }
  }
  async function open(trigger) {
    if (panel?.matches(":popover-open")) { panel.hidePopover(); return; }
    opener = trigger;
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "document-panel feature-requests-panel";
      panel.setAttribute("popover", "auto"); panel.setAttribute("aria-label", "Feature requests");
      document.body.append(panel);
      panel.addEventListener("submit", submit);
      panel.addEventListener("input", e => {
        if (e.target.closest("#feature-request-form") && ["title", "body", "priority"].includes(e.target.name)) { draft[e.target.name] = e.target.value; remember(); }
        if (e.target.id === "request-search") { query = e.target.value; panel.querySelector("[data-request-rows]").innerHTML = rows(); }
      });
      panel.addEventListener("change", e => {
        if (e.target.name === "attachments") { void addFiles([...e.target.files]); e.target.value = ""; }
        if (e.target.id === "request-filter") { filter = e.target.value; panel.querySelector("[data-request-rows]").innerHTML = rows(); }
      });
      panel.addEventListener("dragover", e => { if (mode === "new" && e.dataTransfer.types.includes("Files")) e.preventDefault(); });
      panel.addEventListener("drop", e => { if (mode === "new" && e.dataTransfer.files.length) { e.preventDefault(); void addFiles([...e.dataTransfer.files]); } });
      panel.addEventListener("paste", e => { if (mode === "new" && e.clipboardData.files.length) { e.preventDefault(); void addFiles([...e.clipboardData.files]); } });
      panel.addEventListener("click", async e => {
        const action = e.target.closest("[data-request-action]")?.dataset.requestAction;
        const row = e.target.closest("[data-request-id]"), remove = e.target.closest("[data-request-remove]");
        if (busy) return;
        try {
          if (row) { selected = data.requests.find(r => r.id === row.dataset.requestId); mode = "detail"; render(); }
          else if (remove) { files.splice(Number(remove.dataset.requestRemove), 1); panel.querySelector(".request-files").innerHTML = fileList(); }
          else if (action === "close") panel.hidePopover();
          else if (action === "new") { mode = "new"; render(); }
          else if (action === "back") { mode = "list"; await refresh(); }
          else if (action === "refresh") await refresh();
          else if (action === "automatic") { await api("/feature-requests/settings", { method: "PATCH", body: { automatic: !data.automatic } }); await refresh(); }
        } catch (err) { error(err.message); }
      });
      panel.addEventListener("toggle", () => { if (!panel.matches(":popover-open")) opener?.focus({ preventScroll: true }); });
    }
    render(); panel.showPopover(); position(); panel.querySelector('[data-request-action="close"]').focus({ preventScroll: true });
    try { if (mode === "list") await refresh(); } catch (e) { error(e.message); }
  }
  document.addEventListener("click", e => {
    const trigger = e.target.closest("[data-feature-requests]");
    if (trigger) { e.preventDefault(); void open(trigger); }
  });
  window.addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", position);
  setInterval(() => {
    if (panel?.matches(":popover-open") && mode === "list" && !busy) void api("/feature-requests").then(value => {
      if (mode !== "list" || busy || !panel.matches(":popover-open")) return;
      data = value;
      if (!document.activeElement?.closest(".request-list")) panel.querySelector("[data-request-rows]").innerHTML = rows();
      if (!document.activeElement?.closest(".request-worker")) panel.querySelector(".request-worker").outerHTML = workerHTML();
    }).catch(() => {});
  }, 10000);
}
