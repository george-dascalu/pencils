import { syncTopbarTitle } from "./topbar-title.js";
import { panelCategories } from "./document-insert.js";
import { markdownDocumentEditor } from "./document-editor.js";
import { documentReadingSearch } from "./document-reading-search.js";
import { documentMarkdown } from "./document-markdown.js";
import { documentHeadings, documentOutline, documentStats, documentReference, resolveDocument, resolveCard, obsidianDocumentURI } from "./document-model.js";
import { statusLabel, canTransition, initialStatus, transitionError } from "./workflow-model.js";
import { priorityLabel } from "./task-priority.js";
import { parseTaskQuery, runTaskQuery } from "./document-task-query.js";
import { plainMentions, linkMentions, unlinkedMentions } from "./document-mentions.js";
import { expandTemplate, templatePrompts, templateDocuments, inTemplatesFolder, formatDate } from "./document-templates.js";
import { documentProperties, checkTags, matchesDocument, frontmatterTags } from "./document-properties.js";
import { makeAnchor, documentThreads, threadRoots, validComment } from "./document-comments.js";
import { boardComments } from "./board-comments.js";
import { sketchPad } from "./sketch-pad.js";
import { taskColorAttributes, fieldBoxStyle } from "./task-colors.js";
import { positionPopover } from "./popover-position.js";
import { richToolbar } from "./canvas-rich-text.js";
import { installToolbarScroll, floatMenuPanel } from "./rich-toolbar-scroll.js";
import { randomUUID } from "./uuid.js";
import { allowsTextAutofocus, focusOnOpen } from "./open-focus.js";
import { mountLayoutTray, removeLayoutTray, tabBar } from "./layout-tray.js";

export function projectDocuments(ctx) {
  const { state, api, sync, storage, esc, icon, renderView, toast } = ctx;
  let editor = null, form = null, current = null, project = null, renderer = null, panel = null, panelOpener = null, paneEditor = null;
  let readingSearch = null;
  let mode = storage.get("document-mode", "live");
  let documentWidth = storage.get("document-width", "page") === "full" ? "full" : "page";
  let activeFolder = null;
  let explorerDrag = null, folderMovePending = false;
  const closedFolders = new Set();
  const folders = () => state.project?.document_folders || [];
  const insideFolder = (id, ancestor, list = folders()) => {
    const seen = new Set();
    while (id && !seen.has(id)) {
      if (id === ancestor) return true;
      seen.add(id);
      id = list.find(f => f.id === id)?.parent;
    }
    return false;
  };
  const folderName = (id, seen = new Set()) => {
    const folder = folders().find(f => f.id === id);
    if (!folder || seen.has(id)) return "";
    seen.add(id);
    return [folderName(folder.parent, seen), folder.title].filter(Boolean).join(" / ");
  };
  const folderOptions = (value = null, excluded = null) =>
    `<option value="">Documents</option>${folders().filter(f => !excluded || !insideFolder(f.id, excluded)).sort((a,b) => folderName(a.id).localeCompare(folderName(b.id))).map(f => `<option value="${esc(f.id)}" ${f.id === value ? "selected" : ""}>${esc(folderName(f.id))}</option>`).join("")}`;
  if (!["live", "source", "reading"].includes(mode)) mode = "live";
  const all = () => state.documents || [];
  const endpoint = (pid, id = "") => `/projects/${pid}/documents${id ? `/${id}` : ""}`;
  const selected = () => all().find(d => d.id === state.selectedDocument);
  const listKey = () => `document:${state.project.id}`;
  const MODES = [["live", "Live preview", "pencil"], ["source", "Source", "code"], ["reading", "Reading", "preview"]];
  // Open documents show as tabs, and a second pane can show another document beside or below
  // (iPad and desktop). Both are remembered per project in this browser; phones keep one document.
  const narrow = () => matchMedia("(max-width: 600px), (max-height: 500px)").matches;
  const tabsKey = () => `document-tabs:${state.project.id}`, splitKey = () => `document-split:${state.project.id}`;
  const openTabs = () => { const saved = storage.get(tabsKey(), []); return Array.isArray(saved) ? saved.filter(id => all().some(d => d.id === id)) : []; };
  const splitState = () => {
    const saved = storage.get(splitKey(), null);
    return saved?.id !== state.selectedDocument && all().some(d => d.id === saved?.id)
      ? { id: saved.id, mode: MODES.some(([key]) => key === saved.mode) ? saved.mode : "live", direction: saved.direction === "rows" ? "rows" : "columns" } : null;
  };
  const setSplit = (split) => storage.set(splitKey(), split);
  const download = (record) => {
    const url = URL.createObjectURL(new Blob([record.body || ""], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.title.replace(/[\\/:*?"<>|]/g, "-") || "Document"}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  function explorer() {
    const query = (state.documentSearch || "").trim().toLocaleLowerCase();
    const documents = all().filter(d => !query || matchesDocument(d, query))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id));
    const documentItem = d => `<li><button type="button" draggable="true" class="document-link ${d.id === state.selectedDocument ? "active" : ""}" data-document-open="${esc(d.id)}" ${d.id === state.selectedDocument ? 'aria-current="page"' : ""} title="${esc([folderName(d.folder), d.title].filter(Boolean).join(" / "))}">${icon("file")}<span>${esc(d.title)}</span></button></li>`;
    if (query) return documents.map(documentItem).join("") || '<li class="document-explorer-empty">No matching documents.</li>';
    const tree = (parent, seen = new Set()) => {
      const children = folders().filter(f => (f.parent || null) === parent && !seen.has(f.id)).sort((a,b) => a.title.localeCompare(b.title));
      return children.map(f => `<li><div class="document-folder-row ${activeFolder === f.id ? "active" : ""}" data-document-folder-drop="${esc(f.id)}"><button type="button" draggable="true" class="document-link" data-document-folder="${esc(f.id)}" aria-expanded="${!closedFolders.has(f.id)}" title="${esc(folderName(f.id))} · Drag to move">${icon("chevron")}${icon("folder")}<span>${esc(f.title)}</span></button><button type="button" class="icon-button" data-document-folder-edit="${esc(f.id)}" aria-label="Edit ${esc(f.title)} folder" title="Edit folder">${icon("more")}</button></div><ul ${closedFolders.has(f.id) ? "hidden" : ""}>${tree(f.id, new Set([...seen, f.id]))}</ul></li>`).join("") +
        documents.filter(d => parent ? d.folder === parent : !folders().some(f => f.id === d.folder)).map(documentItem).join("");
    };
    return tree(null) || '<li class="document-explorer-empty">No documents yet.</li>';
  }
  function updateExplorer() {
    const list = document.querySelector("#document-list");
    if (!list) return;
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.documentOpen : null;
    const focusedFolder = list.contains(document.activeElement) ? (document.activeElement.dataset.documentFolder || document.activeElement.dataset.documentFolderEdit) : null;
    list.innerHTML = explorer();
    if (focused) list.querySelector(`[data-document-open="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    if (focusedFolder) list.querySelector(`[data-document-folder="${CSS.escape(focusedFolder)}"]`)?.focus({ preventScroll: true });
    document.querySelector("#document-count").textContent = all().length;
  }
  function syncChanged() {
    if (!form?.isConnected || state.project?.id !== project) return;
    const entry = sync.entries.get(endpoint(project, current.id));
    const problem = entry?.error || entry?.conflict || sync.storageError;
    form.querySelector("[data-document-save-problem]").hidden = !problem;
    form.querySelector("[data-document-save]").textContent =
      sync.storageError ? "Browser storage is full. Keep this page open until saved."
      : entry?.conflict ? "This document changed elsewhere. Review your pending save."
      : entry?.error ? "Changes kept in this browser. Waiting to save." : "";
    form.querySelector("[data-document-recovery]").hidden = !problem;
    const saved = all().find(d => d.id === current.id);
    const versions = form.querySelector("[data-document-action=versions]");
    versions.title = `Page versions · Version ${saved?.version || 1}`;
    versions.dataset.version = saved?.version || 1;
    renderTaskQueries(form);
    refreshComments();
    updateExplorer();
  }
  async function flushDocument(id = current?.id) {
    if (id === current?.id) editor?.flush();
    const url = endpoint(state.project.id, id);
    const entry = sync.entries.get(url);
    if (entry) await sync.run(entry);
    if (sync.entries.has(url)) throw Error("Finish saving this document before continuing.");
  }
  async function moveDocument(id, folder) {
    const pid = state.project.id;
    await flushDocument(id);
    const url = endpoint(pid, id), latest = await api(url);
    const record = await api(url, { method: "PATCH", body: { revision: latest.revision, folder: folder || null } });
    if (state.project?.id !== pid) return;
    state.documents = all().map(d => d.id === id ? record : d);
    if (current?.id === id) { current = record; activeFolder = record.folder; }
    expandFolderAncestors(folder);
    updateExplorer(); syncChanged();
    toast("Document moved.");
  }
  function expandFolderAncestors(folder) {
    for (let id = folder, seen = new Set(); id && !seen.has(id); id = folders().find(f => f.id === id)?.parent) {
      seen.add(id); closedFolders.delete(id);
    }
  }
  async function moveFolder(id, parent) {
    if (folderMovePending) return;
    const pid = state.project.id;
    folderMovePending = true;
    try {
      const snapshot = await api(`/projects/${pid}`);
      const list = snapshot.project.document_folders || [];
      const folder = list.find(f => f.id === id);
      if (!folder) throw Error("This folder no longer exists. Refresh Documents and try again.");
      if (parent && !list.some(f => f.id === parent)) throw Error("The destination folder no longer exists.");
      if (insideFolder(parent, id, list)) throw Error("Choose a folder outside this folder and its subfolders.");
      if ((folder.parent || null) === parent) return;
      const record = await api(`/projects/${pid}`, {
        method: "PATCH",
        body: {
          revision: snapshot.project.revision,
          document_folders: list.map(f => f.id === id ? { ...f, parent } : f),
        },
      });
      if (state.project?.id !== pid) return;
      state.project = record;
      expandFolderAncestors(parent);
      updateExplorer();
      document.querySelector(`[data-document-folder="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      toast(`Folder moved to ${parent ? folderName(parent) : "Documents"}.`);
    } finally { folderMovePending = false; }
  }
  function movePanel(button) {
    const box = showPanel(button, "Move document", `<form><label class="field">Folder<select name="folder">${folderOptions(selected()?.folder)}</select></label><div class="document-panel-actions"><button class="button primary">Move</button></div></form>`);
    box.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const submit = event.submitter; submit.disabled = true;
      try { await moveDocument(current.id, event.target.elements.folder.value); closePanel(true); }
      catch (error) { toast(error.message, true); submit.disabled = false; }
    });
  }
  // Names a document; new documents open with this panel.
  function renamePanel(button) {
    const box = showPanel(button, "Rename document", `<form><label class="field">Document name<input name="title" required maxlength="300" value="${esc(current.title)}" autocomplete="off"></label><div class="document-panel-actions"><button type="submit" class="button primary">Rename</button></div></form>`);
    const field = box.querySelector("input");
    if (focusOnOpen(field, box.querySelector("button"))) field.select();
    box.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      form.elements.title.value = field.value.trim() || "Untitled document";
      form.elements.title.dispatchEvent(new Event("input", { bubbles: true }));
      closePanel(true);
    });
  }
  // New → From template: pick a document from a "Templates" folder, answer its {{prompt:…}}
  // questions, and open the new document with the caret at {{cursor}}.
  function templatePanel(button) {
    const templates = templateDocuments(all(), folders()).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
    const box = showPanel(button, "New from template", templates.length
      ? `<div class="document-template-list">${templates.map(t => `<button type="button" class="document-panel-item" data-template="${esc(t.id)}">${icon("file")}<span>${esc(t.title)}</span></button>`).join("")}</div>`
      : `<p class="field-hint">Put documents in a folder named Templates to start new documents from them. Templates can use {{title}}, {{date}}, {{time}}, {{project}}, {{cursor}} and {{prompt:Question}}.</p>`);
    box.addEventListener("click", event => {
      const template = templates.find(t => t.id === event.target.closest("[data-template]")?.dataset.template);
      if (template) templateForm(button, template);
    });
  }
  function templateForm(button, template) {
    const prompts = templatePrompts(template.body || "");
    const box = showPanel(button, template.title, `<form><label class="field">Document name<input name="title" required maxlength="300" value="${esc(template.title)}" autocomplete="off"></label>${prompts.map((label, i) => `<label class="field">${esc(label)}<input name="prompt-${i}" maxlength="500" autocomplete="off"></label>`).join("")}<p class="form-error" role="alert" hidden></p><div class="document-panel-actions"><button type="submit" class="button primary">Create document</button></div></form>`);
    const field = box.querySelector("input");
    if (focusOnOpen(field, box.querySelector("button"))) field.select();
    box.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const title = data.get("title").trim() || template.title;
      const answers = Object.fromEntries(prompts.map((label, i) => [label, data.get(`prompt-${i}`)]));
      const { body, cursor } = expandTemplate(template.body || "", { title, project: state.project.title, answers });
      const submit = event.target.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const record = await create(title, body, { folder: inTemplatesFolder(activeFolder, folders()) ? null : activeFolder, caret: cursor });
        closePanel();
        if (record && state.view !== "documents") openDocument(record.id);
      } catch (error) {
        const problem = box.querySelector(".form-error");
        problem.textContent = error.message; problem.hidden = false;
        submit.disabled = false;
      }
    });
  }
  // Changes the folder list against the project's latest revision; false if the project changed meanwhile.
  async function updateFolders(change) {
    const pid = state.project.id, snapshot = await api(`/projects/${pid}`);
    const record = await api(`/projects/${pid}`, { method: "PATCH", body: { revision: snapshot.project.revision, document_folders: change([...(snapshot.project.document_folders || [])], snapshot) } });
    if (state.project?.id !== pid) return false;
    state.project = record;
    return true;
  }
  // Today: this day's note (YYYY-MM-DD) in the Daily folder, made from a "Daily" template when there is one.
  const DAILY = "# {{date:dddd D MMMM YYYY}}\n\n## Cards due\n\n```tasks\nnot done\nassignee is me\ndue before tomorrow\nsort by due\n```\n\n## Notes\n\n{{cursor}}\n";
  async function today() {
    const date = formatDate(new Date(), "YYYY-MM-DD");
    let daily = folders().find(f => !f.parent && f.title.trim().toLowerCase() === "daily");
    if (!daily) {
      const isDaily = f => !f.parent && f.title.trim().toLowerCase() === "daily";
      daily = { id: `folder-${randomUUID()}`, title: "Daily", parent: null };
      if (!(await updateFolders(list => list.some(isDaily) ? list : [...list, daily]))) return;
      daily = folders().find(isDaily);
    }
    const existing = all().find(d => d.folder === daily.id && d.title === date);
    if (existing) return openDocument(existing.id);
    const template = templateDocuments(all(), folders()).find(t => t.title.trim().toLowerCase() === "daily");
    const { body, cursor } = expandTemplate(template?.body ?? DAILY, { title: date, project: state.project.title });
    const record = await create(date, body, { folder: daily.id, caret: cursor });
    if (record && state.view !== "documents") openDocument(record.id);
  }
  function folderPanel(button, id = null) {
    const folder = folders().find(f => f.id === id);
    const box = showPanel(button, folder ? "Edit folder" : "New folder", `<form><label class="field">Folder name<input name="title" required maxlength="100" value="${esc(folder?.title || "")}" autocomplete="off"></label><label class="field">Parent folder<select name="parent">${folderOptions(folder ? folder.parent : activeFolder, id)}</select></label><p class="form-error" role="alert" hidden></p><div class="document-panel-actions">${folder ? '<button type="button" class="button danger" data-delete-folder>Delete folder</button>' : ""}<button type="submit" class="button primary">${folder ? "Save" : "Create folder"}</button></div></form>`);
    const save = async (remove = false) => {
      const values = new FormData(box.querySelector("form"));
      const buttons = box.querySelectorAll("button"); buttons.forEach(b => b.disabled = true);
      try {
        const folderId = id || `folder-${randomUUID()}`;
        const changed = await updateFolders((list, snapshot) => {
          const next = list.filter(f => f.id !== folderId);
          if (!remove) next.push({ id: folderId, title: values.get("title"), parent: values.get("parent") || null });
          else if (snapshot.documents.some(d => d.folder === id) || list.some(f => f.parent === id))
            throw Error("Move this folder's documents and subfolders before deleting it.");
          return next;
        });
        if (!changed) return;
        activeFolder = remove ? null : folderId;
        closedFolders.delete(folderId);
        closePanel(true); updateExplorer();
      } catch (error) {
        const message = box.querySelector(".form-error"); message.hidden = false; message.textContent = error.message;
        buttons.forEach(b => b.disabled = false);
      }
    };
    box.querySelector("form").addEventListener("submit", event => { event.preventDefault(); void save(); });
    box.querySelector("[data-delete-folder]")?.addEventListener("click", () => void save(true));
    if (focusOnOpen(box.querySelector("input"), box.querySelector("button"))) box.querySelector("input").select();
  }
  async function versionsPanel(button) {
    const pid = project, id = current.id;
    await flushDocument(id);
    const latest = await api(endpoint(pid, id));
    const result = await api(`/history?${new URLSearchParams({ file: latest.file })}`);
    if (project !== pid || current?.id !== id) return;
    // Saving a comment keeps a copy without making a version; show each version once.
    const seen = new Set();
    const versions = [{ ...latest, data: latest, current: true }, ...result.versions].filter(v => !v.data.version || !seen.has(v.data.version) && seen.add(v.data.version));
    const label = v => v.data.version ? `Version ${v.data.version}` : v.current ? "Version 1" : "Earlier save";
    const box = showPanel(button, "Page versions", `<div class="document-version-list">${versions.map((v,i) => `<button type="button" class="document-panel-item" data-version-index="${i}"><span>${esc(label(v))}${v.current ? " · Current" : ""}</span><time>${esc(v.updated ? new Date(v.updated).toLocaleString() : "")}</time></button>`).join("")}</div><section class="document-version-detail" hidden></section>`, 520);
    box.querySelector(".document-version-list").addEventListener("click", event => {
      const item = event.target.closest("[data-version-index]"); if (!item) return;
      const version = versions[Number(item.dataset.versionIndex)];
      box.querySelectorAll("[data-version-index]").forEach(b => b.setAttribute("aria-pressed", String(b === item)));
      const detail = box.querySelector(".document-version-detail"); detail.hidden = false;
      detail.innerHTML = `<h3>${esc(version.title)}</h3><article class="document-prose">${renderer.render(version.body)}</article>${version.current ? "" : '<div class="document-panel-actions"><button type="button" class="button primary" data-restore-document-version>Restore this version</button></div>'}`;
      renderTaskQueries(detail);
      detail.querySelector("[data-restore-document-version]")?.addEventListener("click", async event => {
        event.currentTarget.disabled = true;
        try {
          await flushDocument(id);
          const saved = all().find(d => d.id === id);
          const record = await api("/history", { method: "POST", body: { file: latest.file, version: version.revision, revision: saved.revision } });
          if (project !== pid || current?.id !== id) return;
          state.documents = all().map(d => d.id === id ? record : d);
          open(id); toast(`Restored as version ${record.version}.`);
        } catch (error) { toast(error.message, true); if (detail.isConnected) detail.querySelector("button").disabled = false; }
      });
    });
  }
  function changed(event) {
    if (!["title", "body"].includes(event.target.name)) return;
    const base = all().find(d => d.id === current.id) || current;
    const changes = {
      title: form.elements.title.value.trim() || "Untitled document",
      body: form.elements.body.value,
    };
    if (base.title === changes.title && base.body === changes.body) return;
    current = { ...base, ...changes };
    if (state.project?.id === project)
      state.documents = all().map(d => d.id === current.id ? current : d);
    if (base.title !== changes.title) updateTabs();
    // SaveQueue retains every edit in browser storage before sending it, merges
    // independent edits and preserves conflicts for the shared Recovery screen.
    void sync.enqueue(endpoint(project, current.id), base, changes);
    syncChanged();
    updateStats();
    syncTopbarTitle(state);
  }
  function updateStats() {
    if (!form) return;
    const stats = documentStats(form.elements.body.value);
    form.querySelector("[data-document-stats]").textContent = `${stats.words.toLocaleString()} words · ${stats.characters.toLocaleString()} characters`;
  }
  function closePanel(focus = false) {
    if (!panel) return;
    if (panelOpener?.hasAttribute("aria-expanded")) panelOpener.setAttribute("aria-expanded", "false");
    panel.cleanup?.();
    if (panel.matches(":popover-open")) panel.hidePopover();
    panel.remove(); panel = null;
    if (state.dialog === "document-panel") state.dialog = null;
    if (focus && panelOpener?.isConnected) panelOpener.focus({ preventScroll: true });
  }
  function showPanel(button, title, html, width = 360) {
    if (panel?.contains(button)) button = panelOpener;
    closePanel();
    panelOpener = button;
    panel = document.createElement("section");
    panel.className = "document-panel board-settings-popover";
    panel.setAttribute("popover", "auto");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    panel.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-document-panel-close aria-label="Close ${esc(title)}">${icon("close")}</button></header>${html}`;
    document.body.append(panel); panel.showPopover(); state.dialog = "document-panel";
    const position = () => panel && positionPopover(panel, button.getBoundingClientRect(), { width, maxHeight: Math.min(560, innerHeight - 24) });
    position();
    const lifecycle = new AbortController();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    panel.cleanup = () => { lifecycle.abort(); observer.disconnect(); };
    window.addEventListener("resize", position, { signal: lifecycle.signal });
    window.visualViewport?.addEventListener("resize", position, { signal: lifecycle.signal });
    const openedPanel = panel;
    panel.addEventListener("toggle", event => {
      if (event.newState !== "closed") return;
      openedPanel.cleanup();
      if (panel === openedPanel) {
        if (button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");
        if (state.dialog === "document-panel") state.dialog = null;
      }
    });
    panel.querySelector("[data-document-panel-close]").addEventListener("click", () => closePanel(true));
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePanel(true); }
    });
    focusOnOpen(panel.querySelector("input,button"), panel.querySelector("button"));
    return panel;
  }
  function setMode(next, focus = true) {
    readingSearch?.close();
    if (next === "reading") editor.escape();
    mode = next; storage.set("document-mode", next);
    form.dataset.documentMode = mode;
    const picker = form.querySelector(".document-mode-picker");
    if (picker) {
      const label = `Document view: ${mode === "reading" ? "Reading" : mode === "source" ? "Source" : "Live preview"}`;
      picker.innerHTML = icon(mode === "reading" ? "preview" : mode === "source" ? "code" : "pencil");
      picker.setAttribute("aria-label", label); picker.title = label;
    }
    const reading = form.querySelector(".document-reading"), host = form.querySelector(".document-codemirror");
    host.hidden = mode === "reading";
    reading.hidden = mode !== "reading";
    form.querySelector(".document-formatting").hidden = mode === "reading";
    for (const button of document.querySelectorAll("#document-form [data-document-mode], .layout-tray [data-document-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.documentMode === mode));
    if (mode === "reading") {
      reading.innerHTML = `<div class="document-page document-prose">${renderer.render(form.elements.body.value)}</div>`;
      for (const heading of reading.querySelectorAll("h1,h2,h3,h4,h5,h6")) if (!heading.id) heading.id = `document-heading-${heading.textContent.trim().replace(/\s+/g, "-").toLocaleLowerCase()}`;
      editor.hydrate(reading);
      if (focus) reading.focus();
    } else {
      editor.setMode(mode);
      if (focus) {
        if (allowsTextAutofocus()) editor.focus();
        // Otherwise the view's own control keeps focus: the picker, the button or, on phones, the Documents tab.
        else [picker, form.querySelector(`[data-document-mode="${mode}"]`), document.querySelector(".tabs .tab.active")].find((el) => el?.getClientRects().length)?.focus({ preventScroll: true });
      }
    }
  }
  function setDocumentWidth(next) {
    documentWidth = next;
    storage.set("document-width", next);
    form.dataset.documentWidth = next;
    for (const button of document.querySelectorAll("[data-document-action=width]")) {
      button.setAttribute("aria-pressed", String(next === "full"));
      button.title = next === "full" ? "Use page width" : "Use full width";
      button.innerHTML = icon(next === "full" ? "width-page" : "width-full") + (button.classList.contains("document-panel-item") ? (next === "full" ? "Use page width" : "Use full width") : "");
    }
    editor?.view.requestMeasure();
  }
  // A card mention's chip: type, key, title (or the link's label) and status, in the shared field order.
  function cardHTML(task, label) {
    return `${icon(task.type || "task")}<span class="document-card-key">${esc(task.key || task.id)}</span><span class="document-card-title">${esc(label || task.title)}</span><span class="field-chip field-chip-status" ${task.archived ? "" : taskColorAttributes(state, "status", task.status)}>${esc(task.archived ? "Archived" : statusLabel(state.config, task.status))}</span>`;
  }
  // "Card from text": the selection, or the current line without its list or heading marker,
  // becomes a card linked to this document, and the text becomes a mention of it.
  // "```tasks" blocks: the project's matching cards as rows (type, key, title, assignee, status,
  // priority), with a box that completes the card. Blocks re-render whenever saves change.
  // Comments on the text (document-comments.js): threads in the shared comments panel, anchored to
  // their quote and saved with the record through the save queue, as card comments are.
  const docComments = (doc) => doc?.comments == null ? [] : Array.isArray(doc.comments) && doc.comments.every(validComment) ? doc.comments : null;
  // The latest copy (saves, and pending edits from the save queue, land in state.documents).
  const commented = () => all().find(d => d.id === current?.id) || current;
  let commentPanel = null, thread = null; // thread: { id, anchor (until its first comment), comments }
  const threadComments = (id) => { const list = docComments(commented()) || [], roots = threadRoots(list); return list.filter(c => roots.get(c.id) === id); };
  const threadsNow = () => documentThreads(form.elements.body.value, docComments(commented()) || []);
  function refreshComments() {
    if (!editor || !current) return;
    editor.setComments(threadsNow().filter(t => t.range).map(t => ({ ...t.range, id: t.id })));
    if (thread && !thread.anchor) {
      // A thread deleted elsewhere starts again at the same words.
      const anchor = thread.comments.find(c => c.id === thread.id)?.anchor;
      thread.comments = threadComments(thread.id);
      if (!thread.comments.length) thread.anchor = anchor;
      commentPanel?.sync();
    }
  }
  function openThread(id, anchor = null) {
    if (docComments(commented()) === null) { toast("This document's comments property holds something else; change it in Obsidian.", true); return; }
    commentPanel ||= boardComments(ctx, () => state.session?.user?.username || "Workspace", prefix => `${prefix}-${randomUUID()}`, {
      host: document.querySelector(".documents-workspace"),
      trigger: "[data-comment-thread]",
      anchor: () => form?.querySelector(".document-writing"),
      item: () => thread,
      title: () => current?.title || "Document",
      context: () => {
        const quote = thread?.anchor?.quote ?? threadComments(thread?.id).find(c => c.anchor)?.anchor.quote ?? "";
        const detached = !thread?.anchor && !threadsNow().find(t => t.id === thread?.id)?.range;
        return `<blockquote class="document-comment-quote">${esc(quote)}</blockquote>${detached ? '<p class="field-hint">Detached: this text is no longer in the document.</p>' : ""}`;
      },
      onClose: (focus) => { if (focus && editor) focusOnOpen(editor.view.contentDOM); },
      change: (mutate) => {
        // The panel edits comments in place, so the save queue's base is a copy taken first.
        const base = structuredClone(commented()), previous = docComments(base), before = { id: thread.id, anchor: thread.anchor }, words = thread.anchor ?? thread.comments.find(c => c.id === thread.id)?.anchor;
        if (!previous) { toast("This document's comments property holds something else; change it in Obsidian.", true); return; }
        mutate();
        // A new thread's first comment carries the anchor; later ones answer it. A thread whose
        // comments are all deleted starts again at the same words.
        const first = thread.comments.find(c => !c.replyTo);
        if (thread.anchor && first) { first.anchor = thread.anchor; thread.id = first.id; delete thread.anchor; }
        for (const c of thread.comments) if (!c.replyTo && c.id !== thread.id) c.replyTo = thread.id;
        if (!thread.comments.length) thread.anchor = words;
        // The thread's comments keep their places, so saves from two people merge.
        const roots = threadRoots(previous), mine = new Map(thread.comments.map(c => [c.id, c]));
        const comments = previous.flatMap(c => roots.get(c.id) !== thread.id ? [c] : mine.has(c.id) ? [mine.get(c.id)] : []);
        comments.push(...thread.comments.filter(c => !roots.has(c.id)));
        // The server keeps up to 500, as for cards; one more would hold back the document's text too.
        if (comments.length > 500) {
          Object.assign(thread, before, { comments: threadComments(before.id) });
          toast("A document holds up to 500 comments. Delete some before adding more.", true);
          return;
        }
        current = { ...commented(), comments };
        state.documents = all().map(d => d.id === current.id ? current : d);
        void sync.enqueue(endpoint(project, current.id), base, { comments });
        refreshComments();
      },
    });
    commentPanel.close();
    thread = { id: id || `thread-${randomUUID()}`, anchor, comments: id ? threadComments(id) : [] };
    commentPanel.open(thread);
  }
  // Sketches (sketch-pad.js): saving writes a new SVG and strokes pair, and the document embeds the
  // SVG ("![[attachments/s-….svg]]", which Obsidian shows). A saved sketch reopens from its strokes.
  const pad = sketchPad(ctx);
  function sketch(file = null) {
    // Only a sketch's own attachment name reaches the API (the attribute can come from raw HTML).
    if (file !== null && !/^attachments\/s-[\w-]+\.svg$/.test(file)) return;
    const pid = project, id = current.id;
    pad.open({
      id: `${pid}:${id}:${file || "new"}`,
      load: file && (() => api(`/projects/${pid}/${file.replace(/\.svg$/, ".json")}`)),
      async save(strokes) {
        const saved = await api(`/projects/${pid}/sketches`, { method: "POST", body: { strokes } });
        if (project !== pid || current?.id !== id) throw new Error("Open the document again to add this sketch; it waits in the pad.");
        if (mode === "reading") setMode("live", false);
        const view = editor.view, text = view.state.doc.toString(), changes = [];
        for (let at = file ? text.indexOf(file) : -1; at >= 0; at = text.indexOf(file, at + file.length)) changes.push({ from: at, to: at + file.length, insert: saved.path });
        if (changes.length) view.dispatch({ changes });
        else editor.insert(`![[${saved.path}]]\n`);
      },
    }).catch(error => toast(error.message, true));
  }
  function commentOnText() {
    const { from, to } = selectedRange();
    if (from >= to) { toast("Select text, or write a line, to comment on it.", true); return; }
    openThread(null, makeAnchor(editor.view.state.doc.toString(), from, to));
  }
  // Properties and tags (document-properties.js): frontmatter Obsidian reads, edited at the top of
  // the document. Each change saves on its own, after any pending text, naming only what it changes.
  const splitList = (text) => text.split(",").map(t => t.trim()).filter(Boolean);
  function propertyInput(name, value, type) {
    const label = `aria-label="${esc(name)}"`;
    if (type === "checkbox") return `<input type="checkbox" class="document-checkbox" ${label} ${value ? "checked" : ""}>`;
    if (type === "number") return `<input type="number" step="any" ${label} value="${esc(String(value))}">`;
    if (type === "date") return `<input type="date" ${label} value="${esc(value)}">`;
    if (type === "list") return `<input type="text" ${label} value="${esc(value.join(", "))}" placeholder="Values, separated by commas">`;
    return `<input type="text" ${label} value="${esc(value)}" maxlength="1000">`;
  }
  const propertiesSummary = (doc) => {
    const count = documentProperties(doc).length;
    return `${icon("chevron")}<span>Properties</span>${count ? `<span class="count">${count}</span>` : ""}<span class="document-tag-chips">${frontmatterTags(doc).map(tag => `<span class="document-tag">#${esc(tag)}</span>`).join("")}</span>`;
  };
  function propertiesHTML(doc) {
    const tags = frontmatterTags(doc);
    return `<details class="document-properties" data-tags="${esc(JSON.stringify(tags))}" ${storage.get("document-properties-open", false) ? "open" : ""}><summary>${propertiesSummary(doc)}</summary>
      <div class="document-property-list">${documentProperties(doc).map(([name, value, type]) => `<div class="document-property" data-property="${esc(name)}" data-type="${type}" data-value="${esc(JSON.stringify(value))}"><span class="document-property-name" title="${esc(name)}">${esc(name)}</span>${propertyInput(name, value, type)}<button type="button" class="icon-button" data-property-remove aria-label="Remove ${esc(name)}" title="Remove ${esc(name)}">${icon("close")}</button></div>`).join("")}
        <div class="document-property"><span class="document-property-name">Tags</span><input type="text" name="document-tags" aria-label="Tags" value="${esc(tags.join(", "))}" placeholder="Tags, separated by commas"></div></div>
      <button type="button" class="button small" data-property-add>${icon("plus")}Add property</button></details>`;
  }
  const showProperties = (doc) => { const box = form?.querySelector(".document-properties"); if (box) box.outerHTML = propertiesHTML(doc); };
  // `check(latest)` names a problem (such as a value changed elsewhere since it was shown); the
  // saved values are then shown instead of being overwritten.
  let propertySaving = Promise.resolve();
  function saveProperties(change, check = () => null) {
    const run = propertySaving.then(async () => {
      const pid = state.project.id, id = current.id;
      await flushDocument(id);
      const url = endpoint(pid, id), latest = await api(url);
      const keep = (record) => {
        if (state.project?.id !== pid) return false;
        state.documents = all().map(d => d.id === id ? record : d);
        if (current?.id === id) current = record;
        return current?.id === id;
      };
      const problem = check(latest);
      if (problem) { if (keep(latest)) showProperties(latest); throw new Error(problem); }
      const record = await api(url, { method: "PATCH", body: { revision: latest.revision, document_properties: change } });
      if (keep(record)) form.querySelector(".document-properties summary").innerHTML = propertiesSummary(record);
      syncChanged();
      return record;
    });
    propertySaving = run.catch(() => {});
    return run;
  }
  const changedElsewhere = "This changed in another window or in Obsidian; showing the saved version.";
  async function propertyChanged(input) {
    const box = form.querySelector(".document-properties");
    if (input.name === "document-tags") {
      const record = await saveProperties({ tags: checkTags(splitList(input.value)) }, latest => JSON.stringify(frontmatterTags(latest)) === box.dataset.tags ? null : changedElsewhere);
      box.dataset.tags = JSON.stringify(frontmatterTags(record));
      return;
    }
    const row = input.closest("[data-property]");
    if (!row) return;
    const { property: name, type } = row.dataset;
    if (["number", "date"].includes(type) && !input.value) throw new Error(`Fill in “${name}”, or remove it.`);
    const value = type === "checkbox" ? input.checked : type === "number" ? Number(input.value) : type === "list" ? splitList(input.value) : input.value;
    const record = await saveProperties({ set: { [name]: value } }, latest => JSON.stringify(latest[name]) === row.dataset.value ? null : changedElsewhere);
    row.dataset.value = JSON.stringify(record[name]);
  }
  function addPropertyPanel(button) {
    const types = [["text", "Text"], ["number", "Number"], ["date", "Date"], ["checkbox", "Checkbox"], ["list", "List"]];
    const box = showPanel(button, "Add property", `<form><label class="field">Name<input name="name" required maxlength="60" autocomplete="off"></label><label class="field">Type<select name="type">${types.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label><p class="form-error" role="alert" hidden></p><div class="document-panel-actions"><button type="submit" class="button primary">Add</button></div></form>`);
    box.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(event.target), name = data.get("name").trim();
      const value = { text: "", number: 0, date: formatDate(new Date(), "YYYY-MM-DD"), checkbox: false, list: [] }[data.get("type")];
      try {
        const record = await saveProperties({ set: { [name]: value } }, latest => Object.keys(latest).some(key => key.toLowerCase() === name.toLowerCase()) ? `“${name}” already exists.` : null);
        showProperties(record);
        closePanel();
      } catch (error) {
        const problem = box.querySelector(".form-error");
        problem.textContent = error.message; problem.hidden = false;
      }
    });
  }
  // In the personal space, queries read the cards of every project you can open (loaded with each document).
  let everywhere = null, everywhereRequest = 0; // { tasks, configs: Map(project ID → workflow config) }
  async function loadEverywhere() {
    const request = ++everywhereRequest, data = await api("/overview");
    if (request !== everywhereRequest) return;
    everywhere = { tasks: data.tasks, configs: new Map(data.projects.map(p => [p.id, p.schema])) };
    if (form?.isConnected) renderTaskQueries(form);
  }
  // Cards from several projects may share an ID, so rows name their project too.
  const queryTask = (element) => queryTasks().find(t => t.id === (element.dataset.taskQueryDone || element.dataset.taskQueryOpen) && (t.project || "") === (element.dataset.taskQueryProject || t.project || ""));
  const queryConfig = (t) => (state.project?.personal && everywhere?.configs.get(t.project)) || state.config;
  function taskRow(t) {
    const config = queryConfig(t), colors = { ...state, config };
    const done = (config.done || []).includes(t.status);
    return `<div class="document-task-row"><input type="checkbox" class="document-checkbox" ${done ? "checked" : ""} data-task-query-done="${esc(t.id)}" data-task-query-project="${esc(t.project || "")}" aria-label="Done: ${esc(t.title)}"><button type="button" class="document-task-open" data-task-query-open="${esc(t.id)}" data-task-query-project="${esc(t.project || "")}" aria-label="Open ${esc(t.key || t.id)}: ${esc(t.title)}">${icon(t.type || "task")}<span class="document-card-key">${esc(t.key || t.id)}</span><span class="document-task-title">${esc(t.title)}</span></button><span class="document-task-fields field-box" ${fieldBoxStyle(colors, t.priority)}>${ctx.assigneeHTML(t)}<span class="field-chip field-chip-status" ${taskColorAttributes(colors, "status", t.status)}>${esc(statusLabel(config, t.status))}</span><span class="field-chip field-chip-priority" role="img" aria-label="Priority: ${esc(priorityLabel(t.priority || "none"))}" ${taskColorAttributes(colors, "priority", t.priority)}>${icon(`priority-${t.priority || "none"}`)}</span></span></div>`;
  }
  const queryTasks = () => state.project?.personal ? everywhere?.tasks || [] : state.tasks || [];
  function renderTaskQueries(root) {
    for (const block of root?.querySelectorAll("[data-document-task-query]") || []) {
      if (block.dataset.query == null) block.dataset.query = block.textContent;
      const query = parseTaskQuery(block.dataset.query);
      const { tasks, total } = runTaskQuery(queryTasks(), query, { config: state.config, configFor: queryConfig, me: state.session?.user?.username || "" });
      block.dataset.rendered = "true";
      const html = `${query.errors.length ? `<p class="form-error">Not understood: ${query.errors.map(esc).join(", ")}</p>` : ""}${tasks.map(taskRow).join("") || '<p class="field-hint">No matching cards.</p>'}${total > tasks.length ? `<p class="field-hint">${total - tasks.length} more not shown.</p>` : ""}`;
      // Every save calls this, so unchanged rows stay as they are, and focus stays on the same card.
      if (renderedQueries.get(block) !== html) {
        const focused = block.contains(document.activeElement) && document.activeElement.dataset.taskQueryDone;
        block.innerHTML = html;
        renderedQueries.set(block, html);
        if (focused) block.querySelector(`[data-task-query-done="${CSS.escape(focused)}"]`)?.focus();
      }
      // Bound on the block: editable components stop clicks from reaching the form.
      block.onchange = event => { if (event.target.dataset.taskQueryDone) completeCard(event.target); };
      block.onclick = event => {
        const open = event.target.closest("[data-task-query-open]");
        if (!open) return;
        event.preventDefault();
        const task = queryTask(open);
        if (task?.project && task.project !== state.project.id) ctx.openProject(task.project).then(opened => opened && ctx.taskDialog(task.id));
        else ctx.taskDialog(open.dataset.taskQueryOpen);
      };
      // A tap ticks the box without focusing the editor, which would open the iPhone keyboard.
      let tap = null;
      block.ontouchstart = event => {
        tap = event.touches.length === 1 && event.target.closest("[data-task-query-done]") ? { x: event.touches[0].clientX, y: event.touches[0].clientY, input: event.target.closest("[data-task-query-done]") } : null;
      };
      block.ontouchmove = event => { const t = event.touches[0]; if (tap && (!t || Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > 10)) tap = null; };
      block.ontouchend = event => {
        if (!tap) return;
        const { input } = tap;
        tap = null;
        event.preventDefault();
        input.checked = !input.checked;
        completeCard(input);
      };
    }
  }
  const renderedQueries = new WeakMap();
  async function completeCard(input) {
    const task = queryTask(input), config = task ? queryConfig(task) : state.config, doneStatuses = config.done || [];
    const wanted = input.checked ? doneStatuses : [initialStatus(config), ...config.statuses].filter(s => !doneStatuses.includes(s));
    const target = task && wanted.find(s => canTransition(config, task.status, s));
    try {
      if (!task) throw new Error("This card no longer exists.");
      if (!target) throw new Error(transitionError(config, task.status, wanted[0]));
      if (task.project && task.project !== state.project.id)
        await api(`/projects/${task.project}/tasks/${task.id}`, { method: "PATCH", body: { status: target, revision: task.revision } }).finally(() => loadEverywhere().catch(() => {}));
      else await ctx.patchTask(task.id, { status: target }, false);
    } catch (error) { toast(error.message, true); }
    renderTaskQueries(form);
  }
  // A few words either side of a mention, to show what Link will change.
  const mentionContext = (body, { index, length }) => {
    const start = Math.max(0, index - 30), end = Math.min(body.length, index + length + 30);
    return `${start ? "…" : ""}${body.slice(start, end).replace(/\s+/g, " ").trim()}${end < body.length ? "…" : ""}`;
  };
  let makingCard = false;
  // The selection, or the current line without its list, quote or heading marker.
  function selectedRange() {
    const view = editor.view, range = view.state.selection.main;
    if (!range.empty) return { from: range.from, to: range.to };
    const line = view.state.doc.lineAt(range.from);
    return { from: line.from + /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s*|#{1,6}\s+)?/.exec(line.text)[0].length, to: line.to };
  }
  async function makeCard() {
    if (makingCard) return;
    const view = editor.view, { from, to } = selectedRange();
    const text = view.state.sliceDoc(from, to), [first = "", ...rest] = text.trim().split("\n");
    // Titles hold 300 characters; the rest of a long first line starts the description.
    const title = first.slice(0, 300), body = [first.slice(300), ...rest].join("\n").trim();
    if (!title) { toast("Select text, or write a line, to make a card from it.", true); return; }
    const pid = project, docId = current.id, before = view.state.doc;
    makingCard = true;
    let task;
    try { task = await api(`/projects/${pid}/tasks`, { method: "POST", body: { title, body, documents: [docId] } }); }
    finally { makingCard = false; }
    if (state.project?.id === pid && !state.tasks.some((t) => t.id === task.id)) state.tasks = [...state.tasks, task];
    // Replace the text only if the document has not changed meanwhile; otherwise just report the card.
    if (editor?.view === view && current?.id === docId && view.state.doc.eq(before))
      view.dispatch({ changes: { from, to, insert: `${text.match(/^\s*/)[0]}[[${task.key || task.id}]]${text.match(/\s*$/)[0]}` } });
    else toast(`Card ${task.key || task.id} created.`);
  }
  function followLink(reference) {
    const target = resolveDocument(reference, all());
    const card = !target && resolveCard(reference, state.tasks || []);
    if (card) { ctx.taskDialog(card.id); return; }
    if (!target) { toast("No matching document or card in this project. Use [[ to choose one.", true); return; }
    const fragment = reference.includes("#") ? reference.slice(reference.indexOf("#") + 1) : "";
    if (target.id !== current.id) open(target.id);
    if (fragment) requestAnimationFrame(() => {
      if (!form) return;
      const heading = documentHeadings(form.elements.body.value).find(h => h.title.toLocaleLowerCase() === fragment.toLocaleLowerCase());
      const at = fragment.startsWith("^") ? form.elements.body.value.indexOf(fragment) : heading?.from;
      if (at >= 0) { setMode("live", false); editor.jump(at); }
    });
  }
  function obsidianSettings(button) {
    const prefs = storage.get("obsidian-documents", {});
    const box = showPanel(button, "Open in Obsidian", `<p>Open these same Markdown files in Obsidian to use its plugins. Obsidian must be installed and have access to this folder on your device.</p><form id="document-obsidian-settings"><label class="field">Obsidian vault name<input name="vault" value="${esc(prefs.vault || "")}" required maxlength="300" placeholder="Your vault name"></label><label class="field">Pencils folder inside that vault <span class="field-hint">(optional)</span><input name="folder" value="${esc(prefs.folder || "")}" placeholder="Leave blank if Pencils is the vault root"></label><p class="field-hint">Saved on this device. Documents open from <code>Projects/…/documents/…</code>. The browser does not copy or sync your vault to another device.</p><div class="document-panel-actions"><button class="button primary" type="submit">Save settings</button></div><p class="form-error" role="alert" hidden></p></form>`, 420);
    box.querySelector("form").addEventListener("submit", event => {
      event.preventDefault(); event.stopPropagation();
      const data = new FormData(event.target);
      const value = { vault: data.get("vault").trim(), folder: data.get("folder").trim() };
      try {
        obsidianDocumentURI(current, value);
        storage.set("obsidian-documents", value);
        closePanel(true); updateObsidianLink(); toast("Obsidian vault saved. Use Open in Obsidian to open this document.");
      } catch (error) {
        const message = box.querySelector(".form-error"); message.hidden = false; message.textContent = error.message;
      }
    });
  }
  function updateObsidianLink() {
    if (!form) return;
    const button = form.querySelector('[data-document-action="obsidian"]');
    const prefs = storage.get("obsidian-documents", {});
    const uri = obsidianDocumentURI(current, prefs);
    button.href = uri || "#";
    button.dataset.configured = String(!!uri);
  }
  function reset() {
    const host = document.querySelector("#sidebar-documents");
    if (host) host.innerHTML = "";
    document.querySelector(".sidebar")?.removeAttribute("data-documents");
    clearExplorerDrag();
    closePanel();
    readingSearch?.destroy(); readingSearch = null;
    commentPanel?.destroy(); commentPanel = null; thread = null;
    pad.close();
    paneEditor?.flush(); paneEditor?.destroy(); paneEditor = null;
    editor?.flush();
    editor?.destroy();
    editor = form = current = project = renderer = null;
  }
  let scrolled = null; // { id, scroll: { selector: scrollTop } } for the open document
  let pendingCaret = null; // { id, at }: where a document made from a template starts its caret
  // The document list sits in the main sidebar, so it has no pane of its own
  // to open, close or make inert.
  function syncExplorer() {}
  function tabsHTML() {
    const list = openTabs();
    return `<nav class="document-tabs" aria-label="Open documents">${list.map(id => {
      const title = all().find(d => d.id === id).title;
      return `<div class="document-tab"><button type="button" class="document-tab-open" data-document-tab="${esc(id)}" title="${esc(title)}" ${id === state.selectedDocument ? 'aria-current="page"' : ""}>${icon("file")}<span>${esc(title)}</span></button>${list.length > 1 ? `<button type="button" class="icon-button" data-document-action="close-tab" data-document-id="${esc(id)}" aria-label="Close ${esc(title)}" title="Close ${esc(title)}">${icon("close")}</button>` : ""}</div>`;
    }).join("")}</nav>`;
  }
  function openTab(id) {
    open(id);
    document.querySelector(`[data-document-tab="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
  function updateTabs() { const strip = document.querySelector(".document-tabs"); if (strip) strip.outerHTML = tabsHTML(); }
  function closeTab(id) {
    const list = openTabs(), rest = list.filter(t => t !== id), next = rest[Math.min(list.indexOf(id), rest.length - 1)];
    storage.set(tabsKey(), rest);
    // The next tab may be in the second pane; it moves to the main pane and the split ends.
    if (id === state.selectedDocument) { if (splitState()?.id === next) setSplit(null); openTab(next); return; }
    updateTabs();
    document.querySelector(`[data-document-tab="${CSS.escape(next)}"]`)?.focus();
  }
  // Opening the second pane's document in the main pane swaps the two, so no document shows twice.
  function swapPane(id) {
    const split = splitState();
    if (split?.id === id) setSplit({ ...split, id: state.selectedDocument });
  }
  let paneScroll = null; // { id, selector, top } for the second pane, kept across rebuilds
  // Rebuilds the second pane from the saved split: its own editor and view, saving to its own document.
  function showPane() {
    paneEditor?.flush(); paneEditor?.destroy(); paneEditor = null;
    const workspace = document.querySelector(".documents-workspace"), split = form && !narrow() && splitState();
    workspace?.querySelector(".document-pane")?.remove();
    if (!workspace) return;
    editor?.view.requestMeasure();
    if (!split) { delete workspace.dataset.split; return; }
    workspace.dataset.split = split.direction;
    workspace.insertAdjacentHTML("beforeend", `<section class="document-pane" aria-label="Second document">
      <header class="document-heading">
        <select data-document-pane-select aria-label="Document in the second pane">${all().filter(d => d.id !== current.id).map(d => `<option value="${esc(d.id)}" ${d.id === split.id ? "selected" : ""}>${esc(d.title)}</option>`).join("")}</select>
        <div class="document-modes" role="group" aria-label="Second document view">${MODES.map(([key, label, glyph]) => `<button type="button" class="icon-button" data-document-pane-mode="${key}" aria-label="${label}" title="${label}">${icon(glyph)}</button>`).join("")}</div>
        <button type="button" class="icon-button" data-document-action="split-swap" aria-label="Swap documents" title="Swap documents">${icon("swap")}</button>
        <button type="button" class="icon-button" data-document-action="split-close" aria-label="Close split" title="Close split">${icon("close")}</button>
      </header>
      <div class="document-writing"><div class="document-codemirror"></div><article class="document-reading" tabindex="0" aria-label="Second document reading view" hidden></article></div>
    </section>`);
    const section = workspace.querySelector(".document-pane"), pid = project;
    paneEditor = markdownDocumentEditor({
      icon, panel: showPanel, toast, parent: section.querySelector(".document-codemirror"), text: all().find(d => d.id === split.id).body || "",
      mode: split.mode === "source" ? "source" : "live", renderer, documents: all, hidden: ["attach", "card", "comment", "sketch"],
      cards: () => (state.tasks || []).filter(t => !t.archived), taskQueries: renderTaskQueries,
      onChange(body) {
        const base = all().find(d => d.id === split.id);
        if (!base || base.body === body || state.project?.id !== pid) return;
        state.documents = all().map(d => d.id === base.id ? { ...base, body } : d);
        void sync.enqueue(endpoint(pid, base.id), base, { body });
      },
      onError: message => toast(message, true), onLink: followLink,
    });
    section.querySelector("[data-document-pane-select]").addEventListener("change", event => {
      setSplit({ ...splitState(), id: event.target.value });
      showPane();
      document.querySelector("[data-document-pane-select]")?.focus();
    });
    section.addEventListener("keydown", event => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") { event.preventDefault(); paneEditor.flush(); }
      if (key === "e") { event.preventDefault(); setPaneMode(splitState()?.mode === "source" ? "live" : "source"); }
    });
    // Files attach to the main document; a drop here must not open the file in place of the app.
    section.addEventListener("dragover", event => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
    section.addEventListener("drop", event => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      toast("Drop files on the main document to attach them.", true);
    });
    setPaneMode(split.mode);
    section.addEventListener("scroll", event => {
      const selector = [".cm-scroller", ".document-reading"].find(s => event.target.matches?.(s));
      if (selector) paneScroll = { id: split.id, selector, top: event.target.scrollTop };
    }, true);
    if (paneScroll?.id === split.id) {
      const { selector, top } = paneScroll, restore = () => { const el = section.querySelector(selector); if (el) el.scrollTop = top; };
      restore();
      requestAnimationFrame(restore);
    }
  }
  function setPaneMode(next) {
    const split = splitState(), section = document.querySelector(".document-pane");
    if (!split || !section || !paneEditor) return;
    setSplit({ ...split, mode: next });
    for (const button of section.querySelectorAll("[data-document-pane-mode]")) button.setAttribute("aria-pressed", String(button.dataset.documentPaneMode === next));
    const reading = section.querySelector(".document-reading");
    section.querySelector(".document-codemirror").hidden = next === "reading";
    reading.hidden = next !== "reading";
    if (next === "reading") {
      reading.innerHTML = `<div class="document-page document-prose">${renderer.render(paneEditor.value())}</div>`;
      paneEditor.hydrate(reading);
    } else paneEditor.setMode(next);
  }
  // Phones and touch screens: tapping the open Documents tab again shows a tray above the bottom
  // bar with the document list and the document's views.
  function syncTray() {
    if (!selected() || !tabBar.matches) return removeLayoutTray();
    const tray = document.createElement("template");
    tray.innerHTML = `<div class="view-layout-switcher" role="group" aria-label="Document view"><button type="button" data-action="menu" aria-label="Documents" title="Documents">${icon("folder")}<span>Documents</span></button>${MODES.map(([key, label, glyph]) => `<button type="button" data-document-mode="${key}" aria-label="${label}" aria-pressed="${mode === key}" title="${label}">${icon(glyph)}<span>${label}</span></button>`).join("")}</div>`;
    mountLayoutTray(tray.content.firstElementChild, state.layoutTray === state.view);
  }
  // Re-sync after project-layout.js's toolbar reset, which removes any tray. Media query lists
  // report changes oldest first and this module loads later, so the width list made here fires
  // after project-layout.js's own; on tabBar, listeners run in the order they were added.
  const resyncTray = () => { if (state.view === "documents") syncTray(); };
  tabBar.addEventListener("change", resyncTray);
  matchMedia("(max-width: 600px)").addEventListener("change", resyncTray);
  function render() {
    // A refresh of the same open document (for example after a save's change
    // notice rebuilds the app) keeps its scroll position instead of jumping
    // to the top. Positions are recorded while scrolling, because a full
    // refresh has already replaced the old editor by the time this runs.
    const keep = scrolled?.id === state.selectedDocument ? scrolled : null;
    reset();
    const content = document.querySelector("#view-content");
    if (!state.selectedDocument) {
      const remembered = storage.get(listKey(), null);
      state.selectedDocument = all().find(d => d.id === remembered)?.id || all()[0]?.id || null;
    }
    const doc = selected();
    if (doc && !narrow() && !openTabs().includes(doc.id)) storage.set(tabsKey(), [...openTabs(), doc.id]);
    if (doc && storage.get(splitKey(), null)?.id === doc.id) setSplit(null);
    content.className = "content documents-content";
    if (!folders().some(f => f.id === activeFolder)) activeFolder = null;
    // The document tree lives in the main sidebar (iPad and desktop) and in the
    // drawer's Documents level (phones); the workspace holds the editor only.
    const host = document.querySelector("#sidebar-documents");
    if (host) {
      host.innerHTML = `
      <aside id="document-explorer" class="document-explorer" aria-label="Document explorer">
        <header data-document-folder-drop="" title="Drop here to move to Documents"><button type="button" class="icon-button sidebar-documents-back" data-drawer-back aria-label="Back to the menu" title="Back to the menu">${icon("chevron")}</button><h2><button type="button" class="document-root" data-document-root>Documents <span class="count" id="document-count">${all().length}</span></button></h2><div class="document-explorer-actions"><button type="button" class="icon-button" data-document-action="create" aria-label="New document" title="New document">${icon("plus")}</button><button type="button" class="icon-button" data-document-action="new-folder" aria-label="New folder" title="New folder">${icon("folder")}</button></div></header>
        <label class="document-search search">${icon("search")}<input type="search" id="document-search" aria-label="Find a document" placeholder="Find a document or #tag…" value="${esc(state.documentSearch || "")}"></label>
        <nav aria-label="Project documents"><ul id="document-list">${explorer()}</ul></nav>
        <footer><button type="button" class="button small" data-document-action="import">${icon("plus")}Import Markdown</button><input type="file" id="document-import" accept=".md,.markdown,text/markdown,text/plain" multiple hidden></footer>
      </aside>
`;
      host.closest(".sidebar")?.setAttribute("data-documents", "shown");
    }
    syncTray();
    content.innerHTML = `<div class="documents-workspace" data-has-document="${!!doc}">${doc && !narrow() ? tabsHTML() : ""}
      <section class="document-editor" aria-label="Document content">${doc ? `
        <form id="document-form" data-document-width="${documentWidth}">
          <!-- One bar: formatting on the left, the document's own controls on the right. The name
               shows in the top bar and changes through Document tools → Rename. -->
          <header class="document-heading">
            <div id="document-formatting" class="document-formatting task-rich-tools" role="toolbar" aria-label="Format document">${richToolbar(icon, { adapter: "document", alignment: null, modes: false, idPrefix: "document", extra: `<div class="selection-group" role="group" aria-label="Insert more"><button type="button" class="selection-action" data-document-action="insert" aria-label="Insert" title="Insert a table, code, callout or more">${icon("plus")}<span class="selection-action-label">Insert</span></button></div>` })}</div>
            <div class="document-view-controls" role="toolbar" aria-label="Document navigation">
              <button type="button" class="icon-button document-secondary-control" data-document-action="outline" aria-label="Document outline" title="Document outline" aria-expanded="false" aria-haspopup="dialog" popovertarget="document-outline-panel">${icon("tree")}</button>
              <div class="document-modes" role="group" aria-label="Document view">${MODES.map(([key, label, glyph]) => `<button type="button" class="icon-button" data-document-mode="${key}" aria-label="${label}" title="${label}" aria-pressed="${mode === key}">${icon(glyph)}</button>`).join("")}</div>
              <button type="button" class="icon-button document-mode-picker" data-document-action="mode-menu" aria-haspopup="dialog" aria-label="Document view">${icon("pencil")}</button>
              <button type="button" class="icon-button document-secondary-control" data-document-action="width" aria-label="Full width" aria-pressed="${documentWidth === "full"}" title="${documentWidth === "full" ? "Use page width" : "Use full width"}">${icon(documentWidth === "full" ? "width-page" : "width-full")}</button>
              <button type="button" class="icon-button document-format-toggle" data-document-action="format-toggle" aria-label="Show formatting" title="Show formatting" aria-expanded="false" aria-controls="document-formatting">${icon("heading")}</button>
              <button type="button" class="icon-button" data-document-action="find" aria-label="Find in document" title="Find in document (Ctrl / ⌘ F)">${icon("search")}</button>
            </div>
            <a class="icon-button document-file-action" href="#" data-document-action="obsidian" aria-label="Open in Obsidian" title="Open in Obsidian">${icon("external")}</a>
            <button type="button" class="icon-button document-file-action" data-document-action="versions" aria-label="Page versions" title="Page versions · Version ${doc.version || 1}" data-version="${doc.version || 1}">${icon("clock")}</button>
            ${ctx.bookmarks.button("doc", state.project.id, doc.id)}
            <button type="button" class="icon-button" data-document-action="tools" aria-label="Document tools" title="Document tools">${icon("more")}</button>
            <button type="button" class="icon-button document-file-action" data-document-action="export" aria-label="Export Markdown" title="Export Markdown">${icon("download")}</button>
            <details class="board-menu document-delete document-file-action"><summary aria-label="Delete document" title="Delete document">${icon("trash")}</summary><div class="board-menu-panel"><p>Move this document to Trash?</p><button type="button" class="button small danger" data-document-action="delete">Move to Trash</button></div></details>
          </header>
          ${(() => { const cards = (state.tasks || []).filter((t) => (t.documents || []).includes(doc.id)); return cards.length ? `<div class="document-linked-cards"><span class="caption">Linked cards</span>${cards.map((t) => `<button type="button" class="button soft" data-action="task-open" data-id="${esc(t.id)}" title="Open ${esc(t.title)}">${icon(t.type || "task")}<span class="task-relationship-key">${esc(t.key || t.id)}</span><span class="task-relationship-title">${esc(t.title)}</span></button>`).join("")}</div>` : ""; })()}
          ${propertiesHTML(doc)}
          <input type="hidden" name="title" value="${esc(doc.title)}">
          <div class="document-save-problem" data-document-save-problem hidden><span data-document-save role="status" aria-live="polite"></span><button type="button" class="button small" data-feature="recovery" data-document-recovery hidden>Review pending save</button></div>
          <div class="document-writing"><div class="document-codemirror"></div><article class="document-reading" tabindex="0" aria-label="Document reading view" hidden></article><textarea name="body" hidden>${esc(doc.body || "")}</textarea></div>
          <input type="file" id="document-attachment" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.zip" multiple hidden>
          <footer class="document-save"><span data-document-stats></span></footer>
        </form>` : `<div class="empty document-empty">${icon("file")}<h2>${state.selectedDocument ? "Document unavailable" : "A home for your project notes"}</h2><p>${state.selectedDocument ? "Choose another document from the explorer." : "Write briefs, meeting notes and reference documents."}</p><button type="button" class="button soft" data-document-action="create">${icon("plus")}New document</button><button type="button" class="button document-empty-browse" data-document-action="browse">${icon("documents")}Browse documents</button></div>`}
      </section></div>`;
    if (!doc) return;
    current = doc;
    project = state.project.id;
    form = document.querySelector("#document-form");
    renderer = documentMarkdown({ documents: all, project: () => project, esc, icon, cards: () => state.tasks || [], cardHTML });
    editor = markdownDocumentEditor({
      icon, panel: showPanel, toast,
      parent: form.querySelector(".document-codemirror"), text: doc.body || "",
      mode: mode === "source" ? "source" : "live", renderer, documents: all, hidden: state.project.personal ? ["card"] : [], cards: () => (state.tasks || []).filter((t) => !t.archived), taskQueries: renderTaskQueries,
      onChange(value) {
        form.elements.body.value = value;
        form.elements.body.dispatchEvent(new Event("input", { bubbles: true }));
      },
      onError: message => toast(message, true), onLink: followLink, onComment: id => openThread(id), onSketch: file => sketch(file),
      onInsert(command) {
        if (command === "attach") form.querySelector("#document-attachment").click();
        if (command === "card") makeCard().catch((error) => toast(error.message, true));
        if (command === "comment") commentOnText();
        if (command === "sketch") sketch();
      },
    });
    if (pendingCaret?.id === doc.id) { editor.jump(pendingCaret.at); pendingCaret = null; }
    refreshComments();
    if (state.project.personal) loadEverywhere().catch(error => toast(error.message, true));
    readingSearch = documentReadingSearch({ form, content: form.querySelector(".document-reading"), icon });
    // The Properties section is replaced when it refreshes, so its events are handled here.
    form.addEventListener("toggle", event => { if (event.target.matches?.(".document-properties")) storage.set("document-properties-open", event.target.open); }, true);
    form.addEventListener("change", event => {
      if (event.target.matches(".document-properties input")) propertyChanged(event.target).catch(error => toast(error.message, true));
    });
    form.addEventListener("click", event => {
      const remove = event.target.closest(".document-properties [data-property-remove]"), add = event.target.closest(".document-properties [data-property-add]");
      if (remove) {
        const row = remove.closest("[data-property]");
        saveProperties({ remove: [row.dataset.property] }).then(() => row.remove(), error => toast(error.message, true));
      }
      if (add) addPropertyPanel(add);
    });
    installToolbarScroll(form.querySelector(".document-formatting .rich-toolbar-shell"));
    form.addEventListener("input", changed);
    form.addEventListener("submit", e => { e.preventDefault(); editor.flush(); });
    form.addEventListener("keydown", e => {
      if (mode === "reading" && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault(); e.stopPropagation(); closePanel(); readingSearch.open(); return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault(); editor.flush();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault(); setMode(mode === "source" ? "live" : "source");
      }
      if (e.key === "Escape" && (readingSearch.close(true) || editor.escape())) {
        e.preventDefault(); e.stopPropagation();
      }
    });
    form.addEventListener("dragover", event => {
      if ([...(event.dataTransfer?.types || [])].includes("Files")) { event.preventDefault(); form.classList.add("document-drag-over"); }
    });
    form.addEventListener("dragleave", event => { if (!form.contains(event.relatedTarget)) form.classList.remove("document-drag-over"); });
    form.addEventListener("drop", event => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault(); event.stopPropagation(); form.classList.remove("document-drag-over");
      void attachFiles([...event.dataTransfer.files]);
    });
    setMode(mode, false); updateStats(); updateObsidianLink(); syncExplorer(); syncTopbarTitle(state); showPane();
    if (keep?.id === doc.id) {
      const restore = () => { for (const [selector, top] of Object.entries(keep.scroll)) { const el = form?.querySelector(selector); if (el && top) el.scrollTop = top; } };
      restore();
      requestAnimationFrame(restore);
    } else scrolled = { id: doc.id, scroll: {} };
    form.addEventListener("scroll", event => {
      const selector = [".cm-scroller", ".document-reading"].find(s => event.target.matches?.(s));
      if (!selector) return;
      if (scrolled?.id !== doc.id) scrolled = { id: doc.id, scroll: {} };
      scrolled.scroll[selector] = event.target.scrollTop;
    }, true);
    syncChanged();
  }
  // Open from another view (a linked card): remember the choice, then switch views.
  function openDocument(id) {
    if (state.view === "documents" && document.querySelector(".documents-workspace")) return open(id);
    swapPane(id);
    storage.set(listKey(), id);
    state.selectedDocument = id;
    state.documentExplorerOpen = false;
    ctx.openView("documents");
  }
  function open(id) {
    swapPane(id);
    reset();
    state.selectedDocument = id;
    activeFolder = all().find(d => d.id === id)?.folder || null;
    state.documentExplorerOpen = false;
    storage.set(listKey(), id);
    renderView();
  }
  // `caret` places the caret in the new document (a template's {{cursor}}) instead of asking for a name.
  async function create(title = "Untitled document", body = "", { folder = activeFolder, caret } = {}) {
    const pid = state.project.id;
    const record = await api(endpoint(pid), { method: "POST", body: { title, body, folder } });
    if (state.project?.id !== pid) return;
    state.documents = [...all(), record];
    state.documentSearch = "";
    if (caret !== undefined) pendingCaret = { id: record.id, at: caret ?? body.length };
    if (state.view === "documents" && document.querySelector(".documents-workspace")) {
      open(record.id);
      if (caret === undefined) renamePanel(form.querySelector('[data-document-action="tools"]'));
    } else {
      storage.set(listKey(), record.id);
      state.selectedDocument = record.id;
    }
    return record;
  }
  document.addEventListener("input", event => {
    if (event.target.id !== "document-search") return;
    state.documentSearch = event.target.value;
    updateExplorer();
  });
  document.addEventListener("click", async event => {
    const folder = event.target.closest("[data-document-folder]");
    if (folder) {
      const id = folder.dataset.documentFolder;
      activeFolder = id;
      closedFolders.has(id) ? closedFolders.delete(id) : closedFolders.add(id);
      updateExplorer();
      document.querySelector(`[data-document-folder="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const folderEdit = event.target.closest("[data-document-folder-edit]");
    if (folderEdit) { folderPanel(folderEdit, folderEdit.dataset.documentFolderEdit); return; }
    if (event.target.closest("[data-document-root]")) { activeFolder = null; updateExplorer(); return; }
    const branch = event.target.closest("[data-outline-toggle]");
    if (branch && panel?.contains(branch)) {
      const children = panel.querySelector(`#${CSS.escape(branch.getAttribute("aria-controls"))}`);
      children.hidden = !children.hidden;
      branch.setAttribute("aria-expanded", String(!children.hidden));
      return;
    }
    const item = event.target.closest("[data-document-open]");
    // Works from any view (the phone drawer lists documents everywhere).
    if (item) { openDocument(item.dataset.documentOpen); return; }
    const tab = event.target.closest("[data-document-tab]");
    if (tab) { openTab(tab.dataset.documentTab); return; }
    const paneMode = event.target.closest("[data-document-pane-mode]");
    if (paneMode) { setPaneMode(paneMode.dataset.documentPaneMode); return; }
    const viewButton = event.target.closest("button[data-document-mode]");
    if (viewButton && form) { closePanel(); setMode(viewButton.dataset.documentMode); return; }
    for (const menu of document.querySelectorAll(".document-formatting details[open]"))
      if (!menu.contains(event.target)) { menu.open = false; floatMenuPanel(menu); }
    const formatButton = event.target.closest("[data-document-format]");
    if (formatButton && editor) {
      closePanel();
      if (mode === "reading") setMode("live", false);
      editor.format(formatButton.dataset.documentFormat);
      const menu = formatButton.closest("details.selection-menu");
      if (menu) { menu.open = false; floatMenuPanel(menu); }
      return;
    }
    const jump = event.target.closest("[data-document-jump]");
    if (jump && editor) { closePanel(); setMode("live", false); editor.jump(Number(jump.dataset.documentJump)); return; }
    const drawing = event.target.closest("#document-form .document-reading img[data-document-sketch]");
    if (drawing && editor) { sketch(drawing.dataset.documentSketch); return; }
    const link = event.target.closest(".document-reading [data-document-ref]");
    if (link && editor) { event.preventDefault(); followLink(link.dataset.documentRef); return; }
    const anchor = event.target.closest('.document-reading a[href^="#"]');
    if (anchor && anchor.hash) {
      event.preventDefault();
      const id = decodeURIComponent(anchor.hash.slice(1));
      const root = anchor.closest(".document-reading");
      const target = root.querySelector(`[id="${CSS.escape(id)}"]`) || [...root.querySelectorAll(".document-reading h1,.document-reading h2,.document-reading h3,.document-reading h4,.document-reading h5,.document-reading h6")].find(h => h.textContent.toLocaleLowerCase() === id.replaceAll("-", " ").toLocaleLowerCase());
      target?.scrollIntoView({ block: "start" }); return;
    }
    const button = event.target.closest("[data-document-action]");
    if (!button) return;
    const action = button.dataset.documentAction;
    event.preventDefault();
    try {
      if (action === "mode-menu") {
        showPanel(button, "Document view", MODES.map(([key, title, glyph]) => `<button type="button" class="document-panel-item" data-document-mode="${key}" aria-pressed="${mode === key}">${icon(glyph)}${title}${mode === key ? icon("check") : ""}</button>`).join(""));
      } else if (action === "format-toggle") {
        const open = form.dataset.formatOpen !== "true";
        form.dataset.formatOpen = String(open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "Hide formatting" : "Show formatting");
        button.title = open ? "Hide formatting" : "Show formatting";
        editor.view.requestMeasure();
      } else if (action === "new-folder") folderPanel(button);
      else if (action === "width") setDocumentWidth(documentWidth === "full" ? "page" : "full");
      else if (action === "move") movePanel(button);
      else if (action === "versions") await versionsPanel(button);
      else if (action === "obsidian") {
        if (!button.closest(".document-heading")) {
          closePanel(); form.querySelector('.document-heading [data-document-action="obsidian"]').click(); return;
        }
        if (button.dataset.configured !== "true") { obsidianSettings(button); return; }
        editor.flush();
        const pid = project, id = current.id, url = endpoint(pid, id);
        const entry = sync.entries.get(url);
        if (entry) await sync.run(entry);
        if (sync.entries.has(url)) throw Error("Finish saving this document before opening it in Obsidian.");
        if (project === pid && current?.id === id) window.location.href = button.href;
      } else if (action === "obsidian-settings") obsidianSettings(button);
      else if (action === "find") {
        closePanel();
        if (mode === "reading") readingSearch.open();
        else editor.find();
      }
      else if (action === "outline") {
        if (panelOpener === button && panel?.matches(":popover-open")) { closePanel(true); return; }
        const headings = documentOutline(editor.value());
        const tree = (items) => `<ul>${items.map(h => `<li><div class="document-outline-row">${h.children.length ? `<button type="button" class="icon-button" data-outline-toggle aria-label="Toggle ${esc(h.title)} headings" aria-expanded="true" aria-controls="document-outline-${h.from}">${icon("chevron")}</button>` : '<span class="document-outline-spacer" aria-hidden="true"></span>'}<button type="button" class="document-panel-item" data-document-jump="${h.from}">${esc(h.title)}</button></div>${h.children.length ? `<div id="document-outline-${h.from}">${tree(h.children)}</div>` : ""}</li>`).join("")}</ul>`;
        const outline = showPanel(button, "Outline", `<nav class="document-outline" aria-label="Document headings">${headings.length ? tree(headings) : "<p>Add headings to navigate this document.</p>"}</nav>`, 400);
        outline.id = "document-outline-panel";
        button.setAttribute("aria-expanded", "true");
      } else if (action === "tools") {
        const unlinked = unlinkedMentions(all(), current.title, current.id);
        const backlinks = all().filter(d => d.id !== current.id && [...(d.body || "").matchAll(/\[\[([^\]\n]+)\]\]|\[[^\]]*\]\(([^)\s]+)\)/g)].some(m => resolveDocument(m[1] || m[2], all())?.id === current.id));
        const group = (name, items) => items ? `<section class="document-tool-group" aria-label="${name}"><h3>${name}</h3>${items}</section>` : "";
        showPanel(button, "Document tools", `${group("Document", `<button type="button" class="document-panel-item" data-document-action="rename">${icon("pencil")}Rename</button><button type="button" class="document-panel-item" data-document-action="move">${icon("folder")}Move to folder</button><button type="button" class="document-panel-item" data-document-action="export">${icon("download")}Export Markdown</button>${!form.querySelector(".document-delete").getClientRects().length ? `<button type="button" class="document-panel-item danger" data-document-action="confirm-delete">${icon("trash")}Delete document</button>` : ""}`)}${group("View", `${!form.querySelector('.document-heading [data-document-action="width"]').getClientRects().length ? `<button type="button" class="document-panel-item" data-document-action="outline">${icon("tree")}Document outline</button><button type="button" class="document-panel-item" data-document-action="width" aria-pressed="${documentWidth === "full"}">${icon("width-full")}${documentWidth === "full" ? "Use page width" : "Use full width"}</button>` : ""}${narrow() ? "" : `<button type="button" class="document-panel-item" data-document-action="split-columns" aria-pressed="${splitState()?.direction === "columns"}">${icon("split-columns")}Split side by side</button><button type="button" class="document-panel-item" data-document-action="split-rows" aria-pressed="${splitState()?.direction === "rows"}">${icon("split-rows")}Split top and bottom</button>`}`)}${group("History", `<button type="button" class="document-panel-item" data-document-format="undo">${icon("undo")}Undo</button><button type="button" class="document-panel-item" data-document-format="redo">${icon("redo")}Redo</button><button type="button" class="document-panel-item" data-document-action="versions">${icon("clock")}Page versions</button>`)}${group("Obsidian", `<button type="button" class="document-panel-item" data-document-action="obsidian">${icon("external")}Open in Obsidian</button><button type="button" class="document-panel-item" data-document-action="obsidian-settings">${icon("settings")}Obsidian settings</button>`)}<h3>Backlinks (${backlinks.length})</h3>${backlinks.map(d => `<button type="button" class="document-panel-item" data-document-open="${esc(d.id)}">${icon("file")}${esc(d.title)}</button>`).join("") || "<p>No documents link here yet.</p>"}<h3>Unlinked mentions (${unlinked.length})</h3>${unlinked.map(({ document: d, mentions }) => `<div class="document-mention-row"><button type="button" class="document-panel-item" data-document-open="${esc(d.id)}" title="${mentions.length} mention${mentions.length === 1 ? "" : "s"}">${icon("file")}<span>${esc(d.title)}<span class="field-hint document-mention-context">${esc(mentionContext(d.body || "", mentions[0]))}</span></span></button><button type="button" class="button small" data-document-action="link-mentions" data-document-id="${esc(d.id)}" aria-label="Link mentions in ${esc(d.title)}">Link</button></div>`).join("") || "<p>No other document names this one without a link.</p>"}${(() => {
          const threads = threadsNow();
          return `<h3>Comments (${threads.length})</h3>${threads.map(t => `<button type="button" class="document-panel-item" data-document-action="comment-open" data-comment-id="${esc(t.id)}">${icon("comment")}<span>${esc(t.root.anchor.quote.slice(0, 80))}<span class="field-hint document-mention-context">${t.range ? "" : "Detached · "}${t.comments.length} comment${t.comments.length === 1 ? "" : "s"}</span></span></button>`).join("") || "<p>No comments yet. Select text, then Insert → Comment on text.</p>"}`;
        })()}`);
      } else if (action === "close-tab") closeTab(button.dataset.documentId);
      else if (action === "split-columns" || action === "split-rows") {
        closePanel();
        const id = splitState()?.id || openTabs().filter(t => t !== current.id).at(-1) || all().find(d => d.id !== current.id)?.id;
        if (!id) toast("Create another document to show it beside this one.", true);
        else {
          setSplit({ id, mode: splitState()?.mode || "live", direction: action === "split-rows" ? "rows" : "columns" });
          showPane();
          document.querySelector("[data-document-pane-select]")?.focus({ preventScroll: true });
        }
      } else if (action === "split-swap") {
        const id = splitState()?.id;
        if (id) { open(id); document.querySelector('[data-document-action="split-swap"]')?.focus(); }
      } else if (action === "split-close") {
        setSplit(null); showPane();
        form.querySelector('[data-document-action="tools"]').focus();
      } else if (action === "rename") {
        renamePanel(form.querySelector('[data-document-action="tools"]'));
      } else if (action === "confirm-delete") {
        showPanel(button, "Delete document", '<p>Move this document to Trash?</p><button type="button" class="button danger" data-document-action="delete">Move to Trash</button>');
      } else if (action === "insert") {
        const categories = panelCategories(state.project.personal ? ["card"] : []);
        showPanel(button, "Insert", `<div class="document-insert-options">${categories.map(([title, items]) => `<section aria-label="${title}"><h3>${title}</h3>${items.map(([key,label,glyph]) => `<button type="button" class="document-panel-item" ${["attach", "card", "comment", "sketch"].includes(key) ? `data-document-action="${key}"` : `data-document-format="${key}"`}>${icon(glyph)}${label}</button>`).join("")}</section>`).join("")}</div>`);

      } else if (action === "attach") { closePanel(); form.querySelector("#document-attachment").click(); }
      else if (action === "card") { closePanel(); await makeCard(); }
      else if (action === "comment") { closePanel(); commentOnText(); }
      else if (action === "sketch") { closePanel(); sketch(); }
      else if (action === "comment-open") { closePanel(); openThread(button.dataset.commentId); }
      else if (action === "link-mentions") {
        // Turns every plain mention of this document in the other one into a link, saved
        // against that document's latest version.
        const id = button.dataset.documentId, pid = project, self = current;
        if (id && id !== self.id) {
          await flushDocument(id);
          const url = endpoint(pid, id), latest = await api(url);
          const body = linkMentions(latest.body || "", plainMentions(latest.body || "", self.title), documentReference(self));
          const record = await api(url, { method: "PATCH", body: { revision: latest.revision, body } });
          if (state.project?.id === pid) state.documents = all().map(d => d.id === id ? record : d);
          closePanel(true);
          toast(`Linked the mentions in ${record.title}.`);
        }
      }
      else if (action === "browse") {
        // The document list is in the sidebar: open it there.
        document.querySelector(".mobile-menu")?.click();
      } else if (action === "create") {
        button.disabled = true;
        await create();
      } else if (action === "import") document.querySelector("#document-import").click();
      else if (action === "export") {
        editor?.flush();
        if (selected()) download(selected());
      } else if (action === "delete") {
        editor?.flush();
        const record = selected(), pid = state.project.id;
        const url = endpoint(pid, record.id), entry = sync.entries.get(url);
        button.disabled = true;
        if (entry) await sync.run(entry);
        if (sync.entries.has(url)) throw new Error("Finish saving this document before moving it to Trash.");
        const revision = all().find(d => d.id === record.id)?.revision;
        await api(url, { method: "DELETE", body: { revision } });
        if (state.project?.id !== pid) return;
        reset();
        state.documents = all().filter(d => d.id !== record.id);
        state.selectedDocument = null;
        storage.set(listKey(), null);
        renderView();
        toast("Document moved to Trash.");
      }
    } catch (error) { toast(error.message, true); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  function clearExplorerDropTargets() {
    document.querySelectorAll(".document-drop-target").forEach(el => el.classList.remove("document-drop-target"));
  }
  function clearExplorerDrag() {
    explorerDrag = null;
    clearExplorerDropTargets();
  }
  function draggedExplorerItem(transfer) {
    const kind = [...transfer.types].includes("application/x-pencils-document-folder") ? "folder"
      : [...transfer.types].includes("application/x-pencils-document") ? "document" : null;
    if (!kind) return null;
    if (explorerDrag?.kind === kind && explorerDrag.project === state.project?.id) return explorerDrag;
    const id = transfer.getData(`application/x-pencils-document${kind === "folder" ? "-folder" : ""}`);
    return id ? { kind, id } : null;
  }
  function acceptsExplorerDrop(item, parent) {
    if (!item || (parent && !folders().some(f => f.id === parent))) return false;
    const source = (item.kind === "folder" ? folders() : all()).find(f => f.id === item.id);
    if (!source) return false;
    if (item.kind === "folder")
      return !folderMovePending && (source.parent || null) !== parent && !insideFolder(parent, item.id);
    return (source.folder || null) !== parent;
  }
  document.addEventListener("dragstart", event => {
    const item = event.target.closest(".document-explorer [data-document-open], .document-explorer [data-document-folder]");
    if (!item) return;
    clearExplorerDrag();
    const kind = item.hasAttribute("data-document-folder") ? "folder" : "document";
    const id = kind === "folder" ? item.dataset.documentFolder : item.dataset.documentOpen;
    explorerDrag = { kind, id, project: state.project.id };
    event.dataTransfer.setData(`application/x-pencils-document${kind === "folder" ? "-folder" : ""}`, id);
    event.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", event => {
    const folder = event.target.closest("[data-document-folder-drop]");
    const item = draggedExplorerItem(event.dataTransfer);
    if (!item) return;
    clearExplorerDropTargets();
    if (!folder || !acceptsExplorerDrop(item, folder.dataset.documentFolderDrop || null)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    folder.classList.add("document-drop-target");
  });
  document.addEventListener("dragleave", event => {
    const folder = event.target.closest("[data-document-folder-drop]");
    if (folder && !folder.contains(event.relatedTarget)) folder.classList.remove("document-drop-target");
  });
  document.addEventListener("drop", event => {
    const folder = event.target.closest("[data-document-folder-drop]");
    const item = draggedExplorerItem(event.dataTransfer);
    clearExplorerDrag();
    if (!folder || !item) return;
    event.preventDefault();
    const parent = folder.dataset.documentFolderDrop || null;
    if (!acceptsExplorerDrop(item, parent)) return;
    void (item.kind === "folder" ? moveFolder(item.id, parent) : moveDocument(item.id, parent)).catch(error => toast(error.message, true));
  });
  document.addEventListener("dragend", clearExplorerDrag);
  // The style menu lives inside the scrolling toolbar; open it in the top layer.
  document.addEventListener("toggle", (event) => {
    const menu = event.target;
    if (menu instanceof HTMLDetailsElement && menu.closest(".document-formatting")) floatMenuPanel(menu, { width: 200, maxHeight: 320 });
  }, true);
  document.addEventListener("change", async event => {
    if (event.target.matches("[data-document-format-select]")) {
      if (event.target.value) editor.format(event.target.value);
      event.target.value = ""; return;
    }
    if (event.target.id === "document-attachment") {
      const files = [...event.target.files]; event.target.value = "";
      await attachFiles(files); return;
    }
    if (event.target.id !== "document-import") return;
    const files = [...event.target.files], pid = state.project.id;
    try {
      for (const file of files) {
        if (state.project?.id !== pid) break;
        if (!/\.(md|markdown)$/i.test(file.name) || file.size > 800000)
          throw new Error("Choose Markdown files up to 200,000 characters.");
        const text = await file.text();
        if (text.length > 200000) throw new Error(`${file.name} is longer than 200,000 characters.`);
        await create(file.name.replace(/\.(md|markdown)$/i, "").slice(0, 300) || "Imported document", text);
      }
    } catch (error) { toast(error.message, true); }
    finally { event.target.value = ""; }
  });
  async function attachFiles(files) {
    const host = form, pid = project, docEditor = editor;
    try {
      for (const file of files) {
        if (form !== host || project !== pid) break;
        if (!/\.(png|jpe?g|gif|webp|pdf|txt|md|csv|zip)$/i.test(file.name) || file.size > 10000000)
          throw Error("Choose an image, PDF, text, Markdown, CSV or ZIP file under 10 MB.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let n = 0; n < bytes.length; n += 8192) binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
        const result = await api(`/projects/${pid}/attachments`, { method: "POST", body: { name: file.name, data: btoa(binary) } });
        if (form !== host || project !== pid) break;
        const label = file.name.replace(/[\r\n]/g, " ").replace(/[\\[\]]/g, "\\$&");
        const prefix = /\.(png|jpe?g|gif|webp)$/i.test(file.name) ? "!" : "";
        if (mode === "reading") setMode("live", false);
        docEditor.insert(`${prefix}[${label}](../${result.path})\n`);
      }
    } catch (error) { toast(error.message, true); }
  }
  window.addEventListener("beforeunload", event => {
    editor?.flush();
    if (form && sync.storageError && sync.entries.size) {
      event.preventDefault(); event.returnValue = "";
    }
  });
  // Search's Alt+Enter: text at the open document's caret; false when no document is open.
  function insertText(text) {
    if (!editor || !form?.isConnected) return false;
    editor.insert(text);
    return true;
  }
  return { render, reset, syncChanged, create, openDocument, templatePanel, today, insertText };
}
