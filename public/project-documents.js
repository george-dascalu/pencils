import { markdownDocumentEditor } from "./document-editor.js";
import { documentReadingSearch } from "./document-reading-search.js";
import { documentMarkdown } from "./document-markdown.js";
import { documentHeadings, documentOutline, documentStats, documentReference, resolveDocument, obsidianDocumentURI } from "./document-model.js";
import { positionPopover } from "./popover-position.js";
import { randomUUID } from "./uuid.js";

export function projectDocuments(ctx) {
  const { state, api, sync, storage, esc, icon, renderView, toast } = ctx;
  let editor = null, form = null, current = null, project = null, renderer = null, panel = null, panelOpener = null;
  let readingSearch = null;
  let mode = storage.get("document-mode", "live");
  let documentWidth = storage.get("document-width", "page") === "full" ? "full" : "page";
  let sidebarCollapsed = storage.get("document-sidebar-collapsed", false);
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
    const documents = all().filter(d => !query || `${d.title}\n${d.body}`.toLocaleLowerCase().includes(query))
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
  function folderPanel(button, id = null) {
    const folder = folders().find(f => f.id === id);
    const box = showPanel(button, folder ? "Edit folder" : "New folder", `<form><label class="field">Folder name<input name="title" required maxlength="100" value="${esc(folder?.title || "")}" autocomplete="off"></label><label class="field">Parent folder<select name="parent">${folderOptions(folder ? folder.parent : activeFolder, id)}</select></label><p class="form-error" role="alert" hidden></p><div class="document-panel-actions">${folder ? '<button type="button" class="button danger" data-delete-folder>Delete folder</button>' : ""}<button type="submit" class="button primary">${folder ? "Save" : "Create folder"}</button></div></form>`);
    const save = async (remove = false) => {
      const pid = state.project.id, values = new FormData(box.querySelector("form"));
      const buttons = box.querySelectorAll("button"); buttons.forEach(b => b.disabled = true);
      try {
        const snapshot = await api(`/projects/${pid}`);
        const list = [...(snapshot.project.document_folders || [])];
        const folderId = id || `folder-${randomUUID()}`;
        const next = list.filter(f => f.id !== folderId);
        if (!remove) next.push({ id: folderId, title: values.get("title"), parent: values.get("parent") || null });
        else if (snapshot.documents.some(d => d.folder === id) || list.some(f => f.parent === id))
          throw Error("Move this folder's documents and subfolders before deleting it.");
        const record = await api(`/projects/${pid}`, { method: "PATCH", body: { revision: snapshot.project.revision, document_folders: next } });
        if (state.project?.id !== pid) return;
        state.project = record;
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
    box.querySelector("input").focus(); box.querySelector("input").select();
  }
  async function versionsPanel(button) {
    const pid = project, id = current.id;
    await flushDocument(id);
    const latest = await api(endpoint(pid, id));
    const result = await api(`/history?${new URLSearchParams({ file: latest.file })}`);
    if (project !== pid || current?.id !== id) return;
    const versions = [{ ...latest, data: latest, current: true }, ...result.versions];
    const label = v => v.data.version ? `Version ${v.data.version}` : v.current ? "Version 1" : "Earlier save";
    const box = showPanel(button, "Page versions", `<div class="document-version-list">${versions.map((v,i) => `<button type="button" class="document-panel-item" data-version-index="${i}"><span>${esc(label(v))}${v.current ? " · Current" : ""}</span><time>${esc(v.updated ? new Date(v.updated).toLocaleString() : "")}</time></button>`).join("")}</div><section class="document-version-detail" hidden></section>`, 520);
    box.querySelector(".document-version-list").addEventListener("click", event => {
      const item = event.target.closest("[data-version-index]"); if (!item) return;
      const version = versions[Number(item.dataset.versionIndex)];
      box.querySelectorAll("[data-version-index]").forEach(b => b.setAttribute("aria-pressed", String(b === item)));
      const detail = box.querySelector(".document-version-detail"); detail.hidden = false;
      detail.innerHTML = `<h3>${esc(version.title)}</h3><article class="document-prose">${renderer.render(version.body)}</article>${version.current ? "" : '<div class="document-panel-actions"><button type="button" class="button primary" data-restore-document-version>Restore this version</button></div>'}`;
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
    // SaveQueue retains every edit in browser storage before sending it, merges
    // independent edits and preserves conflicts for the shared Recovery screen.
    void sync.enqueue(endpoint(project, current.id), base, changes);
    syncChanged();
    updateStats();
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
    panel.querySelector("input,button")?.focus({ preventScroll: true });
    return panel;
  }
  function setMode(next, focus = true) {
    readingSearch?.close();
    if (next === "reading") editor.escape();
    mode = next; storage.set("document-mode", next);
    const reading = form.querySelector(".document-reading"), host = form.querySelector(".document-codemirror");
    host.hidden = mode === "reading";
    reading.hidden = mode !== "reading";
    form.querySelector(".document-formatting").hidden = mode === "reading";
    for (const button of form.querySelectorAll("[data-document-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.documentMode === mode));
    if (mode === "reading") {
      reading.innerHTML = `<div class="document-page document-prose">${renderer.render(form.elements.body.value)}</div>`;
      for (const heading of reading.querySelectorAll("h1,h2,h3,h4,h5,h6")) if (!heading.id) heading.id = `document-heading-${heading.textContent.trim().replace(/\s+/g, "-").toLocaleLowerCase()}`;
      editor.hydrate(reading);
      if (focus) reading.focus();
    } else { editor.setMode(mode); if (focus) editor.focus(); }
  }
  function setDocumentWidth(next) {
    documentWidth = next;
    storage.set("document-width", next);
    form.dataset.documentWidth = next;
    const button = form.querySelector("[data-document-action=width]");
    button.setAttribute("aria-pressed", String(next === "full"));
    button.title = next === "full" ? "Use page width" : "Use full width";
    button.innerHTML = icon(next === "full" ? "width-page" : "width-full");
    editor?.view.requestMeasure();
  }
  function followLink(reference) {
    const target = resolveDocument(reference, all());
    if (!target) { toast("No matching document in this project. Use [[ to choose a document.", true); return; }
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
    clearExplorerDrag();
    closePanel();
    readingSearch?.destroy(); readingSearch = null;
    editor?.flush();
    editor?.destroy();
    editor = form = current = project = renderer = null;
  }
  function render() {
    reset();
    const content = document.querySelector("#view-content");
    if (!state.selectedDocument) {
      const remembered = storage.get(listKey(), null);
      state.selectedDocument = all().find(d => d.id === remembered)?.id || all()[0]?.id || null;
    }
    const doc = selected();
    content.className = "content documents-content";
    if (!folders().some(f => f.id === activeFolder)) activeFolder = null;
    content.innerHTML = `<div class="documents-workspace" data-sidebar-collapsed="${!!doc && sidebarCollapsed}" data-pane="${state.documentExplorerOpen || !doc ? "explorer" : "editor"}">
      <aside class="document-explorer" aria-label="Document explorer">
        <header data-document-folder-drop="" title="Drop here to move to Documents"><h2><button type="button" class="document-root" data-document-root>Documents <span class="count" id="document-count">${all().length}</span></button></h2><div class="document-explorer-actions"><button type="button" class="icon-button" data-document-action="create" aria-label="New document" title="New document">${icon("plus")}</button><button type="button" class="icon-button" data-document-action="new-folder" aria-label="New folder" title="New folder">${icon("folder")}</button>${doc ? `<button type="button" class="icon-button" data-document-action="sidebar" aria-label="Collapse Documents sidebar" title="Collapse sidebar">${icon("chevron")}</button>` : ""}</div></header>
        <label class="document-search search">${icon("search")}<input type="search" id="document-search" aria-label="Find a document" placeholder="Find a document…" value="${esc(state.documentSearch || "")}"></label>
        <nav aria-label="Project documents"><ul id="document-list">${explorer()}</ul></nav>
        <footer><button type="button" class="button small" data-document-action="import">${icon("plus")}Import Markdown</button><input type="file" id="document-import" accept=".md,.markdown,text/markdown,text/plain" multiple hidden></footer>
      </aside>
      <section class="document-editor" aria-label="Document content">${doc ? `
        <form id="document-form" data-document-width="${documentWidth}">
          <header class="document-heading"><button type="button" class="icon-button document-browse" data-document-action="browse" aria-label="Browse documents" title="Show Documents sidebar" aria-expanded="${!sidebarCollapsed}">${icon("menu")}</button>${icon("file")}
            <input name="title" aria-label="Document title" value="${esc(doc.title)}" placeholder="Untitled document" maxlength="300" autocomplete="off">
            <a class="icon-button" href="#" data-document-action="obsidian" aria-label="Open in Obsidian" title="Open in Obsidian">${icon("external")}</a>
            <button type="button" class="icon-button" data-document-action="versions" aria-label="Page versions" title="Page versions · Version ${doc.version || 1}" data-version="${doc.version || 1}">${icon("clock")}</button>
            <button type="button" class="icon-button" data-document-action="tools" aria-label="Document tools" title="Document tools">${icon("more")}</button>
            <button type="button" class="icon-button" data-document-action="export" aria-label="Export Markdown" title="Export Markdown">${icon("download")}</button>
            <details class="board-menu document-delete"><summary aria-label="Delete document" title="Delete document">${icon("trash")}</summary><div class="board-menu-panel"><p>Move this document to Trash?</p><button type="button" class="button small danger" data-document-action="delete">Move to Trash</button></div></details>
          </header>
          <div class="document-controls">
            <div class="document-formatting" role="toolbar" aria-label="Format document">
              <select data-document-format-select aria-label="Paragraph style"><option value="">Style</option><option value="paragraph">Paragraph</option>${[1, 2, 3, 4, 5, 6].map(n => `<option value="h${n}">Heading ${n}</option>`).join("")}</select>
              ${[["bold", "bold", "Bold"], ["italic", "italic", "Italic"], ["check", "check", "Checklist"], ["link", "link", "Link"]].map(([command, glyph, title]) => `<button type="button" class="icon-button" data-document-format="${command}" aria-label="${title}" title="${title}">${icon(glyph)}</button>`).join("")}
              <button type="button" class="button small" data-document-action="insert">${icon("plus")}Insert</button>
            </div>
            <div class="document-view-controls" role="toolbar" aria-label="Document navigation">
            <button type="button" class="icon-button" data-document-action="outline" aria-label="Document outline" title="Document outline" aria-expanded="false" aria-haspopup="dialog" popovertarget="document-outline-panel">${icon("tree")}</button>
            <div class="document-modes" role="group" aria-label="Document view">${[["live", "Live preview", "pencil"], ["source", "Source", "code"], ["reading", "Reading", "preview"]].map(([key, label, glyph]) => `<button type="button" class="icon-button" data-document-mode="${key}" aria-label="${label}" title="${label}" aria-pressed="${mode === key}">${icon(glyph)}</button>`).join("")}</div>
            <button type="button" class="icon-button" data-document-action="width" aria-label="Full width" aria-pressed="${documentWidth === "full"}" title="${documentWidth === "full" ? "Use page width" : "Use full width"}">${icon(documentWidth === "full" ? "width-page" : "width-full")}</button>

            <button type="button" class="icon-button" data-document-action="find" aria-label="Find in document" title="Find in document (Ctrl / ⌘ F)">${icon("search")}</button>
            </div>
          </div>
          <div class="document-save-problem" data-document-save-problem hidden><span data-document-save role="status" aria-live="polite"></span><button type="button" class="button small" data-feature="recovery" data-document-recovery hidden>Review pending save</button></div>
          <div class="document-writing"><div class="document-codemirror"></div><article class="document-reading" tabindex="0" aria-label="Document reading view" hidden></article><textarea name="body" hidden>${esc(doc.body || "")}</textarea></div>
          <input type="file" id="document-attachment" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.md,.csv,.zip" multiple hidden>
          <footer class="document-save"><span data-document-stats></span></footer>
        </form>` : `<div class="document-empty">${icon("file")}<h2>${state.selectedDocument ? "Document unavailable" : "A home for your project notes"}</h2><p>${state.selectedDocument ? "Choose another document from the explorer." : "Write briefs, meeting notes and reference documents."}</p><button type="button" class="button primary" data-document-action="create">${icon("plus")}New document</button></div>`}
      </section></div>`;
    if (!doc) return;
    current = doc;
    project = state.project.id;
    form = document.querySelector("#document-form");
    renderer = documentMarkdown({ documents: all, project: () => project, esc });
    editor = markdownDocumentEditor({
      icon,
      parent: form.querySelector(".document-codemirror"), text: doc.body || "",
      mode: mode === "source" ? "source" : "live", renderer, documents: all,
      onChange(value) {
        form.elements.body.value = value;
        form.elements.body.dispatchEvent(new Event("input", { bubbles: true }));
      },
      onError: message => toast(message, true), onLink: followLink,
    });
    readingSearch = documentReadingSearch({ form, content: form.querySelector(".document-reading"), icon });
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
    setMode(mode, false); updateStats(); updateObsidianLink();
    if (state.documentExplorerOpen) document.querySelector("#document-search").focus({ preventScroll: true });
    syncChanged();
  }
  function open(id) {
    reset();
    state.selectedDocument = id;
    activeFolder = all().find(d => d.id === id)?.folder || null;
    state.documentExplorerOpen = false;
    storage.set(listKey(), id);
    renderView();
  }
  async function create(title = "Untitled document", body = "") {
    const pid = state.project.id;
    const record = await api(endpoint(pid), { method: "POST", body: { title, body, folder: activeFolder } });
    if (state.project?.id !== pid) return;
    state.documents = [...all(), record];
    state.documentSearch = "";
    if (state.view === "documents") {
      open(record.id);
      form.elements.title.focus();
      form.elements.title.select();
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
    if (item) { open(item.dataset.documentOpen); return; }
    const viewButton = event.target.closest("[data-document-mode]");
    if (viewButton && form) { setMode(viewButton.dataset.documentMode); return; }
    const formatButton = event.target.closest("[data-document-format]");
    if (formatButton && editor) { closePanel(); if (mode === "reading") setMode("live", false); editor.format(formatButton.dataset.documentFormat); return; }
    const jump = event.target.closest("[data-document-jump]");
    if (jump && editor) { closePanel(); setMode("live", false); editor.jump(Number(jump.dataset.documentJump)); return; }
    const link = event.target.closest(".document-reading [data-document-ref]");
    if (link && editor) { event.preventDefault(); followLink(link.dataset.documentRef); return; }
    const anchor = event.target.closest('.document-reading a[href^="#"]');
    if (anchor && anchor.hash) {
      event.preventDefault();
      const id = decodeURIComponent(anchor.hash.slice(1));
      const target = form.querySelector(`[id="${CSS.escape(id)}"]`) || [...form.querySelectorAll(".document-reading h1,.document-reading h2,.document-reading h3,.document-reading h4,.document-reading h5,.document-reading h6")].find(h => h.textContent.toLocaleLowerCase() === id.replaceAll("-", " ").toLocaleLowerCase());
      target?.scrollIntoView({ block: "start" }); return;
    }
    const button = event.target.closest("[data-document-action]");
    if (!button) return;
    const action = button.dataset.documentAction;
    event.preventDefault();
    try {
      if (action === "new-folder") folderPanel(button);
      else if (action === "width") setDocumentWidth(documentWidth === "full" ? "page" : "full");
      else if (action === "move") movePanel(button);
      else if (action === "versions") await versionsPanel(button);
      else if (action === "sidebar") {
        sidebarCollapsed = true; storage.set("document-sidebar-collapsed", true);
        state.documentExplorerOpen = false;
        const workspace = document.querySelector(".documents-workspace");
        workspace.dataset.sidebarCollapsed = "true"; workspace.dataset.pane = "editor";
        const browse = form.querySelector("[data-document-action=browse]");
        browse.setAttribute("aria-expanded", "false"); browse.focus({ preventScroll: true });
      } else if (action === "obsidian") {
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
        const backlinks = all().filter(d => d.id !== current.id && [...(d.body || "").matchAll(/\[\[([^\]\n]+)\]\]|\[[^\]]*\]\(([^)\s]+)\)/g)].some(m => resolveDocument(m[1] || m[2], all())?.id === current.id));
        showPanel(button, "Document tools", `<button type="button" class="document-panel-item" data-document-action="move">${icon("folder")}Move to folder</button><button type="button" class="document-panel-item" data-document-action="versions">${icon("clock")}Page versions</button><button type="button" class="document-panel-item" data-document-action="obsidian-settings">${icon("settings")}Obsidian settings</button><button type="button" class="document-panel-item" data-document-action="export">${icon("download")}Export Markdown</button><button type="button" class="document-panel-item" data-document-format="undo">${icon("undo")}Undo</button><button type="button" class="document-panel-item" data-document-format="redo">${icon("redo")}Redo</button><h3>Backlinks (${backlinks.length})</h3>${backlinks.map(d => `<button type="button" class="document-panel-item" data-document-open="${esc(d.id)}">${icon("file")}${esc(d.title)}</button>`).join("") || "<p>No documents link here yet.</p>"}`);
      } else if (action === "insert") {
        const categories = [
          ["Structure", [["h1","Heading","heading"],["bullet","Bullet list","list"],["number","Numbered list","numbered"],["check","Checklist","check"],["quote","Quote","quote"],["rule","Divider","minus"]]],
          ["Formatting", [["strike","Strikethrough","strike"],["highlight","Highlight","highlight"],["code","Inline code","code"]]],
          ["Components", [["table","Table","table"],["callout","Callout","comment"],["codeblock","Code block","codeblock"],["math","Math","math"],["mermaid","Mermaid diagram","tree"]]],
          ["References & files", [["wiki","Document link","link"],["footnote","Footnote","footnote"],["attach","Attach file","attachment"]]],
        ];
        showPanel(button, "Insert", `<div class="document-insert-options">${categories.map(([title, items]) => `<section aria-label="${title}"><h3>${title}</h3>${items.map(([key,label,glyph]) => `<button type="button" class="document-panel-item" ${key === "attach" ? 'data-document-action="attach"' : `data-document-format="${key}"`}>${icon(glyph)}${label}</button>`).join("")}</section>`).join("")}</div>`);

      } else if (action === "attach") { closePanel(); form.querySelector("#document-attachment").click(); }
      else if (action === "browse") {
        const mobile = matchMedia("(max-width: 780px)").matches;
        sidebarCollapsed = mobile ? false : !sidebarCollapsed;
        storage.set("document-sidebar-collapsed", sidebarCollapsed);
        document.querySelector(".documents-workspace").dataset.sidebarCollapsed = String(sidebarCollapsed);
        button.setAttribute("aria-expanded", String(!sidebarCollapsed));
        state.documentExplorerOpen = true;
        document.querySelector(".documents-workspace").dataset.pane = "explorer";
        if (!sidebarCollapsed) document.querySelector("#document-search").focus();
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
  return { render, reset, syncChanged };
}
