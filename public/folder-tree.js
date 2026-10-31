import { randomUUID } from "./uuid.js";
import { focusOnOpen } from "./open-focus.js";

// The folder tree Documents and Boards show in the sidebar: nested folders that open and close,
// drag and drop to move items and folders, and a panel to add, rename or delete a folder. `kind`
// ("document" or "board") names the ids, the data attributes (data-<kind>-open, -folder,
// -folder-edit, -folder-drop, -root), the drag types and the project's list (<kind>_folders).
export function folderTree({ kind, label, placeholder, glyph, state, api, esc, icon, toast, panels, items, selected, matches, moveItem }) {
  const plural = label.toLowerCase(), field = `${kind}_folders`, searchKey = `${kind}Search`;
  const attr = name => `data-${kind}-${name}`;
  const type = folder => `application/x-pencils-${kind}${folder ? "-folder" : ""}`;
  let active = null, drag = null, movePending = false;
  const closed = new Set();
  const folders = () => state.project?.[field] || [];
  const inside = (id, ancestor, list = folders()) => {
    const seen = new Set();
    while (id && !seen.has(id)) {
      if (id === ancestor) return true;
      seen.add(id);
      id = list.find(f => f.id === id)?.parent;
    }
    return false;
  };
  const name = (id, seen = new Set()) => {
    const folder = folders().find(f => f.id === id);
    if (!folder || seen.has(id)) return "";
    seen.add(id);
    return [name(folder.parent, seen), folder.title].filter(Boolean).join(" / ");
  };
  const options = (value = null, excluded = null) =>
    `<option value="">${label}</option>${folders().filter(f => !excluded || !inside(f.id, excluded)).sort((a,b) => name(a.id).localeCompare(name(b.id))).map(f => `<option value="${esc(f.id)}" ${f.id === value ? "selected" : ""}>${esc(name(f.id))}</option>`).join("")}`;
  function tree() {
    const query = (state[searchKey] || "").trim().toLocaleLowerCase(), current = selected();
    const list = items().filter(d => !query || matches(d, query))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id));
    const item = d => `<li><button type="button" draggable="true" class="document-link ${d.id === current ? "active" : ""}" ${attr("open")}="${esc(d.id)}" ${d.id === current ? 'aria-current="page"' : ""} title="${esc([name(d.folder), d.title].filter(Boolean).join(" / "))}">${icon(glyph)}<span>${esc(d.title)}</span></button></li>`;
    if (query) return list.map(item).join("") || `<li class="document-explorer-empty">No matching ${plural}.</li>`;
    const branch = (parent, seen = new Set()) => {
      const children = folders().filter(f => (f.parent || null) === parent && !seen.has(f.id)).sort((a,b) => a.title.localeCompare(b.title));
      return children.map(f => `<li><div class="document-folder-row ${active === f.id ? "active" : ""}" ${attr("folder-drop")}="${esc(f.id)}"><button type="button" draggable="true" class="document-link" ${attr("folder")}="${esc(f.id)}" aria-expanded="${!closed.has(f.id)}" title="${esc(name(f.id))} · Drag to move">${icon("chevron")}${icon("folder")}<span>${esc(f.title)}</span></button><button type="button" class="icon-button" ${attr("folder-edit")}="${esc(f.id)}" aria-label="Edit ${esc(f.title)} folder" title="Edit folder">${icon("more")}</button></div><ul ${closed.has(f.id) ? "hidden" : ""}>${branch(f.id, new Set([...seen, f.id]))}</ul></li>`).join("") +
        list.filter(d => parent ? d.folder === parent : !folders().some(f => f.id === d.folder)).map(item).join("");
    };
    return branch(null) || `<li class="document-explorer-empty">No ${plural} yet.</li>`;
  }
  // The section: a header with the count and the caller's actions, search, the tree and a footer.
  function html({ actions, footer = "" }) {
    return `<aside id="${kind}-explorer" class="document-explorer" aria-label="${kind[0].toUpperCase() + kind.slice(1)} explorer">
        <header ${attr("folder-drop")}="" title="Drop here to move to ${label}"><button type="button" class="icon-button sidebar-documents-back" data-drawer-back aria-label="Back to the menu" title="Back to the menu">${icon("chevron")}</button><h2><button type="button" class="document-root" ${attr("root")}>${label} <span class="count" id="${kind}-count">${items().length}</span></button></h2><div class="document-explorer-actions">${actions}</div></header>
        <label class="document-search search">${icon("search")}<input type="search" id="${kind}-search" aria-label="Find a ${kind}" placeholder="${placeholder}" value="${esc(state[searchKey] || "")}"></label>
        <nav aria-label="Project ${plural}"><ul id="${kind}-list">${tree()}</ul></nav>
        ${footer}
      </aside>`;
  }
  function update() {
    const list = document.getElementById(`${kind}-list`);
    if (!list) return;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const open = focused?.getAttribute(attr("open")), folder = focused?.getAttribute(attr("folder")) || focused?.getAttribute(attr("folder-edit"));
    list.innerHTML = tree();
    if (open) list.querySelector(`[${attr("open")}="${CSS.escape(open)}"]`)?.focus({ preventScroll: true });
    if (folder) list.querySelector(`[${attr("folder")}="${CSS.escape(folder)}"]`)?.focus({ preventScroll: true });
    document.getElementById(`${kind}-count`).textContent = items().length;
  }
  function expand(folder) {
    for (let id = folder, seen = new Set(); id && !seen.has(id); id = folders().find(f => f.id === id)?.parent) {
      seen.add(id); closed.delete(id);
    }
  }
  // Changes the folder list against the project's latest revision; false if the project changed
  // meanwhile or the change returns null (nothing to change).
  async function updateFolders(change) {
    const pid = state.project.id, snapshot = await api(`/projects/${pid}`);
    const next = change([...(snapshot.project[field] || [])], snapshot);
    if (!next) return false;
    const record = await api(`/projects/${pid}`, { method: "PATCH", body: { revision: snapshot.project.revision, [field]: next } });
    if (state.project?.id !== pid) return false;
    state.project = record;
    return true;
  }
  async function moveFolder(id, parent) {
    if (movePending) return;
    movePending = true;
    try {
      let missing = null;
      const changed = await updateFolders(list => {
        const folder = list.find(f => f.id === id);
        if (!folder) missing = `This folder no longer exists. Refresh ${label} and try again.`;
        else if (parent && !list.some(f => f.id === parent)) missing = "The destination folder no longer exists.";
        else if (inside(parent, id, list)) missing = "Choose a folder outside this folder and its subfolders.";
        if (missing) throw Error(missing);
        return (folder.parent || null) === parent ? null : list.map(f => f.id === id ? { ...f, parent } : f);
      });
      if (!changed) return;
      expand(parent);
      update();
      document.querySelector(`[${attr("folder")}="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      toast(`Folder moved to ${parent ? name(parent) : label}.`);
    } finally { movePending = false; }
  }
  function panel(button, id = null) {
    const folder = folders().find(f => f.id === id);
    const box = panels.show(button, folder ? "Edit folder" : "New folder", `<form><label class="field">Folder name<input name="title" required maxlength="100" value="${esc(folder?.title || "")}" autocomplete="off"></label><label class="field">Parent folder<select name="parent">${options(folder ? folder.parent : active, id)}</select></label><p class="form-error" role="alert" hidden></p><div class="document-panel-actions">${folder ? '<button type="button" class="button danger" data-delete-folder>Delete folder</button>' : ""}<button type="submit" class="button primary">${folder ? "Save" : "Create folder"}</button></div></form>`);
    const save = async (remove = false) => {
      const values = new FormData(box.querySelector("form"));
      const buttons = box.querySelectorAll("button"); buttons.forEach(b => b.disabled = true);
      try {
        const folderId = id || `folder-${randomUUID()}`;
        const changed = await updateFolders((list, snapshot) => {
          const next = list.filter(f => f.id !== folderId);
          if (!remove) next.push({ id: folderId, title: values.get("title"), parent: values.get("parent") || null });
          else if (snapshot[plural].some(d => d.folder === id) || list.some(f => f.parent === id))
            throw Error(`Move this folder's ${plural} and subfolders before deleting it.`);
          return next;
        });
        if (!changed) return;
        active = remove ? null : folderId;
        closed.delete(folderId);
        panels.close(true); update();
      } catch (error) {
        const message = box.querySelector(".form-error"); message.hidden = false; message.textContent = error.message;
        buttons.forEach(b => b.disabled = false);
      }
    };
    box.querySelector("form").addEventListener("submit", event => { event.preventDefault(); void save(); });
    box.querySelector("[data-delete-folder]")?.addEventListener("click", () => void save(true));
    if (focusOnOpen(box.querySelector("input"), box.querySelector("button"))) box.querySelector("input").select();
  }
  document.addEventListener("input", event => {
    if (event.target.id !== `${kind}-search`) return;
    state[searchKey] = event.target.value;
    update();
  });
  document.addEventListener("click", event => {
    const folder = event.target.closest(`[${attr("folder")}]`);
    if (folder) {
      const id = folder.getAttribute(attr("folder"));
      active = id;
      closed.has(id) ? closed.delete(id) : closed.add(id);
      update();
      document.querySelector(`[${attr("folder")}="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    const edit = event.target.closest(`[${attr("folder-edit")}]`);
    if (edit) return panel(edit, edit.getAttribute(attr("folder-edit")));
    if (event.target.closest(`[${attr("root")}]`)) { active = null; update(); }
  });
  function clearDropTargets() {
    document.querySelectorAll(".document-drop-target").forEach(el => el.classList.remove("document-drop-target"));
  }
  function reset() {
    drag = null;
    clearDropTargets();
  }
  function dragged(transfer) {
    const kinds = [...transfer.types];
    const what = kinds.includes(type(true)) ? "folder" : kinds.includes(type(false)) ? "item" : null;
    if (!what) return null;
    if (drag?.what === what && drag.project === state.project?.id) return drag;
    const id = transfer.getData(type(what === "folder"));
    return id ? { what, id } : null;
  }
  function accepts(item, parent) {
    if (!item || (parent && !folders().some(f => f.id === parent))) return false;
    const source = (item.what === "folder" ? folders() : items()).find(f => f.id === item.id);
    if (!source) return false;
    if (item.what === "folder")
      return !movePending && (source.parent || null) !== parent && !inside(parent, item.id);
    return (source.folder || null) !== parent;
  }
  document.addEventListener("dragstart", event => {
    const item = event.target.closest(`.document-explorer [${attr("open")}], .document-explorer [${attr("folder")}]`);
    if (!item) return;
    reset();
    const what = item.hasAttribute(attr("folder")) ? "folder" : "item";
    const id = item.getAttribute(attr(what === "folder" ? "folder" : "open"));
    drag = { what, id, project: state.project.id };
    event.dataTransfer.setData(type(what === "folder"), id);
    event.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", event => {
    const item = dragged(event.dataTransfer);
    if (!item) return;
    const folder = event.target.closest(`[${attr("folder-drop")}]`);
    clearDropTargets();
    if (!folder || !accepts(item, folder.getAttribute(attr("folder-drop")) || null)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
    folder.classList.add("document-drop-target");
  });
  document.addEventListener("dragleave", event => {
    const folder = event.target.closest(`[${attr("folder-drop")}]`);
    if (folder && !folder.contains(event.relatedTarget)) folder.classList.remove("document-drop-target");
  });
  document.addEventListener("drop", event => {
    const item = dragged(event.dataTransfer);
    if (!item) return;
    const folder = event.target.closest(`[${attr("folder-drop")}]`);
    reset();
    if (!folder) return;
    event.preventDefault();
    const parent = folder.getAttribute(attr("folder-drop")) || null;
    if (!accepts(item, parent)) return;
    void (item.what === "folder" ? moveFolder(item.id, parent) : moveItem(item.id, parent)).catch(error => toast(error.message, true));
  });
  document.addEventListener("dragend", reset);
  return {
    html, update, panel, expand, updateFolders, reset, folders, name, options,
    get active() { return active; },
    set active(id) { active = id; },
  };
}
