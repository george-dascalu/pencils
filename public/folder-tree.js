import { randomUUID } from "./uuid.js";
import { focusOnOpen } from "./open-focus.js";
import { orderedEntries, planTreeMove } from "./folder-order.js";

// The folder tree Documents and Boards show in their list panels (list-panel.js): nested folders that open and close,
// drag and drop to move items and folders, and a panel to add, rename or delete a folder. `kind`
// ("document" or "board") names the ids, the data attributes (data-<kind>-open, -folder,
// -folder-edit, -folder-drop, -root), the drag types and the project's list (<kind>_folders).
export function folderTree({ kind, label, placeholder, glyph, state, api, esc, icon, toast, panels, items, selected, matches, itemMenu, beforeMove, onMove }) {
  const plural = label.toLowerCase(), field = `${kind}_folders`, searchKey = `${kind}Search`;
  const attr = name => `data-${kind}-${name}`;
  const type = folder => `application/x-pencils-${kind}${folder ? "-folder" : ""}`;
  let active = null, drag = null, movePending = false, updatePending = false;
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
    // An item with a menu (documents) has ⋯ beside it, as folders do.
    const link = d => `<button type="button" draggable="true" class="document-link ${d.id === current ? "active" : ""}" ${attr("open")}="${esc(d.id)}" ${d.id === current ? 'aria-current="page"' : ""} title="${esc([name(d.folder), d.title].filter(Boolean).join(" / "))}">${icon(typeof glyph === "function" ? glyph(d) : glyph)}<span>${esc(d.title)}</span></button>`;
    const item = d => `<li><div class="document-item-row" data-tree-row="item:${esc(d.id)}">${link(d)}${itemMenu ? `<button type="button" class="icon-button" ${attr("item-menu")}="${esc(d.id)}" aria-label="Actions for ${esc(d.title)}" title="More actions">${icon("more")}</button>` : ""}</div></li>`;
    if (query) return list.map(item).join("") || `<li class="document-explorer-empty">No matching ${plural}.</li>`;
    const branch = (parent, seen = new Set()) => orderedEntries(folders(), list, state.project?.[`${kind}_order`], parent).filter(e => !seen.has(e.key)).map(({ what, key, value: f }) => what === "item" ? item(f) : `<li><div class="document-folder-row ${active === f.id ? "active" : ""}" data-tree-row="${esc(key)}" ${attr("folder-drop")}="${esc(f.id)}"><button type="button" draggable="true" class="document-link" ${attr("folder")}="${esc(f.id)}" aria-expanded="${!closed.has(f.id)}" title="${esc(name(f.id))} · Drag to move">${icon("chevron")}${icon("folder")}<span>${esc(f.title)}</span></button><button type="button" class="icon-button" ${attr("folder-edit")}="${esc(f.id)}" aria-label="Edit ${esc(f.title)} folder" title="Edit folder">${icon("more")}</button></div><ul ${closed.has(f.id) ? "hidden" : ""}>${branch(f.id, new Set([...seen, key]))}</ul></li>`).join("");
    return branch(null) || `<li class="document-explorer-empty">No ${plural} yet.</li>`;
  }
  // The section: a header with the count and the caller's actions, search, the tree and a footer.
  function html({ actions, footer = "" }) {
    return `<aside id="${kind}-explorer" class="document-explorer" aria-label="${kind[0].toUpperCase() + kind.slice(1)} explorer">
        <header ${attr("folder-drop")}="" title="Drop here to move to ${label}"><h2><button type="button" class="document-root" ${attr("root")}>${label} <span class="count" id="${kind}-count">${items().length}</span></button></h2><div class="document-explorer-actions">${actions}<button type="button" class="icon-button" data-list-close aria-label="Close ${plural}" title="Close">${icon("close")}</button></div></header>
        <label class="document-search search">${icon("search")}<input type="search" id="${kind}-search" aria-label="Find a ${kind}" placeholder="${placeholder}" value="${esc(state[searchKey] || "")}"></label>
        <nav aria-label="Project ${plural}"><ul id="${kind}-list">${tree()}</ul></nav>
        ${footer}
      </aside>`;
  }
  function update() {
    // Removing an HTML drag source cancels the browser's drag. Keep it mounted
    // through background saves, then draw the latest tree after drop or cancel.
    if (drag?.native) { updatePending = true; return; }
    const list = document.getElementById(`${kind}-list`);
    if (!list) return;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const open = focused?.getAttribute(attr("open")), folder = focused?.getAttribute(attr("folder")) || focused?.getAttribute(attr("folder-edit"));
    list.innerHTML = tree();
    // A live project refresh can redraw the tree during a drag. Keep its feedback at the
    // pointer instead of dropping the insertion line until the next mouse/finger movement.
    if (drag && pointer) showDrop(drag, destination(document.elementFromPoint(pointer.x, pointer.y), pointer.y));
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
  function panel(button, id = null) {
    const folder = folders().find(f => f.id === id);
    const box = panels.show(button, folder ? "Edit folder" : "New folder", `<form><label class="field">Folder name<input name="title" required maxlength="100" value="${esc(folder?.title || "")}" autocomplete="off"></label><label class="field">Parent folder<select name="parent">${options(folder ? folder.parent : active, id)}</select></label><p class="form-error" role="alert" hidden></p><div class="document-panel-actions">${folder ? '<button type="button" class="button danger" data-delete-folder>Delete folder</button>' : ""}<button type="submit" class="button primary">${folder ? "Save" : "Create folder"}</button></div></form>`);
    if (!box) return;
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
    const more = event.target.closest(`[${attr("item-menu")}]`);
    if (more) return itemMenu(more, more.getAttribute(attr("item-menu")));
    if (event.target.closest(`[${attr("root")}]`)) { active = null; update(); }
  });
  function clearDropTargets() {
    document.querySelectorAll(".document-drop-target, [data-tree-insert]").forEach(el => {
      el.classList.remove("document-drop-target"); el.removeAttribute("data-tree-insert");
    });
  }
  let scrollFrame = 0, pointer = null, preview = null;
  function reset() {
    drag = null; pointer = null;
    cancelAnimationFrame(scrollFrame); scrollFrame = 0;
    preview?.remove(); preview = null;
    clearDropTargets();
    if (updatePending) { updatePending = false; update(); }
  }
  function dragged(transfer) {
    const kinds = [...transfer.types];
    const what = kinds.includes(type(true)) ? "folder" : kinds.includes(type(false)) ? "item" : null;
    if (!what) return null;
    if (drag?.project === state.project?.id && drag.what === what) return drag;
    // Don't accept a drag from another project/tab: ids alone don't identify its source project.
    return null;
  }
  function destination(target, y) {
    const host = target?.closest?.(`#${kind}-explorer`);
    if (!host) return null;
    const row = target.closest("[data-tree-row]");
    if (row && !(state[searchKey] || "").trim()) {
      const key = row.dataset.treeRow, what = key.startsWith("folder:") ? "folder" : "item";
      const source = (what === "folder" ? folders() : items()).find(d => key === `${what}:${d.id}`);
      if (!source) return null;
      const bounds = row.getBoundingClientRect(), part = (y - bounds.top) / bounds.height;
      if (what === "folder" && part >= 0.25 && part <= 0.75) return { parent: source.id, before: null, element: row };
      const parent = (what === "folder" ? source.parent : source.folder) || null;
      const siblings = orderedEntries(folders(), items(), state.project?.[`${kind}_order`], parent);
      const after = part >= 0.5;
      return { parent, before: after ? siblings[siblings.findIndex(e => e.key === key) + 1]?.key || null : key,
        element: row, edge: after ? "after" : "before" };
    }
    const folder = target.closest(`[${attr("folder-drop")}]`);
    if (folder) return { parent: folder.getAttribute(attr("folder-drop")) || null, before: null, element: folder };
    // Empty space below the tree is also a root drop target.
    if (target.closest("nav")) return { parent: null, before: null, element: host.querySelector("header") };
    return null;
  }
  function accepts(item, dest) {
    if (!item || !dest || movePending) return false;
    try { return planTreeMove(folders(), items(), state.project?.[`${kind}_order`], { ...item, parent: dest.parent, before: dest.before }).changed; }
    catch { return false; }
  }
  function showDrop(item, dest) {
    clearDropTargets();
    if (!accepts(item, dest)) return false;
    if (dest.edge) dest.element.dataset.treeInsert = dest.edge;
    else dest.element.classList.add("document-drop-target");
    return true;
  }
  async function relocate(item, dest) {
    if (!accepts(item, dest)) return;
    movePending = true;
    const pid = state.project.id;
    try {
      await beforeMove?.(item);
      if (state.project?.id !== pid) return;
      const snapshot = await api(`/projects/${pid}?boards=summary`);
      const source = snapshot[plural].find(d => d.id === item.id);
      const result = await api(`/projects/${pid}`, { method: "PATCH", body: {
        revision: snapshot.project.revision, ...(item.what === "item" ? { item_revision: source?.revision } : {}),
        tree_move: { kind, what: item.what, id: item.id, parent: dest.parent, before: dest.before },
      } });
      if (state.project?.id !== pid) return;
      state.project = result.project;
      expand(dest.parent);
      await onMove?.(result);
      update();
      toast(item.what === "folder" ? "Folder moved." : `${kind === "document" ? "Document" : "Board"} moved.`);
    } finally { movePending = false; }
  }
  function track(x, y) {
    pointer = { x, y };
    if (preview) { preview.style.left = `${x + 12}px`; preview.style.top = `${y + 12}px`; }
    if (scrollFrame) return;
    const step = () => {
      scrollFrame = 0;
      const nav = document.querySelector(`#${kind}-explorer nav`);
      if (!drag || !pointer || !nav) return;
      const box = nav.getBoundingClientRect(), { x, y } = pointer;
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) return;
      const delta = y < box.top + 40 ? -12 : y > box.bottom - 40 ? 12 : 0;
      if (!delta) return;
      nav.scrollTop += delta;
      showDrop(drag, destination(document.elementFromPoint(x, y), y));
      scrollFrame = requestAnimationFrame(step);
    };
    scrollFrame = requestAnimationFrame(step);
  }
  document.addEventListener("dragstart", event => {
    const item = event.target.closest(`.document-explorer [${attr("open")}], .document-explorer [${attr("folder")}]`);
    if (!item) return;
    reset();
    const what = item.hasAttribute(attr("folder")) ? "folder" : "item";
    drag = { what, id: item.getAttribute(attr(what === "folder" ? "folder" : "open")), project: state.project.id, native: true };
    event.dataTransfer.setData(type(what === "folder"), drag.id);
    event.dataTransfer.effectAllowed = "move";
  });
  document.addEventListener("dragover", event => {
    const item = dragged(event.dataTransfer);
    if (!item) return;
    track(event.clientX, event.clientY);
    if (!showDrop(item, destination(event.target, event.clientY))) { event.dataTransfer.dropEffect = "none"; return; }
    event.preventDefault(); event.dataTransfer.dropEffect = "move";
  });
  document.addEventListener("dragleave", event => {
    if (!event.target.closest?.(`#${kind}-explorer`)?.contains(event.relatedTarget)) clearDropTargets();
  });
  document.addEventListener("drop", event => {
    const item = dragged(event.dataTransfer);
    if (!item) return;
    const dest = destination(event.target, event.clientY);
    reset(); event.preventDefault();
    void relocate(item, dest).catch(error => toast(error.message, true));
  });
  document.addEventListener("dragend", reset);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || (!drag && !press)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    swallow = Date.now();
    endPress(); reset();
  }, true);
  // Touch screens (owner requests T82, T83): a long press marks the item or folder as held; lifting
  // the finger then opens its menu (an item's ⋯ menu, a folder's panel), while moving it drags it
  // onto a folder, as a mouse drags. The menu opens on lifting because lifting would dismiss it.
  let press = null, swallow = 0, touched = false;
  const pressable = el => el?.closest?.(`.document-explorer [${attr("open")}], .document-explorer [${attr("folder")}]`);
  const dropAt = (x, y) => destination(document.elementFromPoint(x, y), y);
  // Ends a touch press, leaving a mouse drag (which shares `drag`) alone.
  function endPress() {
    if (!press) return;
    clearTimeout(press.timer);
    press.target.classList.remove("document-held", "document-dragging");
    if (press.dragging) reset();
    press = null;
  }
  // A new touch clears a release that no click followed.
  document.addEventListener("pointerdown", event => { swallow = 0; touched = event.pointerType !== "mouse"; }, true);
  document.addEventListener("pointerdown", event => {
    const target = event.pointerType !== "mouse" && pressable(event.target);
    if (!target) return;
    endPress();
    const what = target.hasAttribute(attr("folder")) ? "folder" : "item";
    press = { target, what, id: target.getAttribute(attr(what === "folder" ? "folder" : "open")), x: event.clientX, y: event.clientY, held: false, dragging: false };
    press.timer = setTimeout(() => { press.held = true; target.classList.add("document-held"); }, 500);
  });
  document.addEventListener("pointermove", event => {
    if (!press || event.pointerType === "mouse") return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10;
    // Moving before the hold is a scroll.
    if (!press.held) return void (moved && endPress());
    if (!press.dragging && moved) {
      press.dragging = true;
      press.target.classList.add("document-dragging");
      drag = { what: press.what, id: press.id, project: state.project.id };
      preview = document.createElement("div"); preview.className = "document-drag-preview drag-ghost";
      preview.textContent = press.target.textContent; preview.setAttribute("aria-hidden", "true"); document.body.append(preview);
    }
    if (!press.dragging) return;
    track(event.clientX, event.clientY);
    showDrop(drag, dropAt(event.clientX, event.clientY));
  });
  document.addEventListener("pointerup", event => {
    if (!press || event.pointerType === "mouse") return;
    const { what, id, held, dragging } = press, item = drag;
    endPress();
    // An item without a menu (a board) lets its tap through when it isn't dragged.
    if (!held || (!dragging && what === "item" && !itemMenu)) return;
    swallow = Date.now();
    if (dragging) {
      void relocate(item, dropAt(event.clientX, event.clientY)).catch(error => toast(error.message, true));
      return;
    }
    setTimeout(() => {
      // The list may have been redrawn during the hold.
      const row = document.querySelector(`.document-explorer [${attr(what === "folder" ? "folder" : "open")}="${CSS.escape(id)}"]`)?.parentElement;
      if (!row) return;
      if (what === "folder") panel(row.querySelector(`[${attr("folder-edit")}]`), id);
      else itemMenu(row.querySelector(`[${attr("item-menu")}]`), id);
    });
  });
  document.addEventListener("pointercancel", endPress);
  // While held, the finger drags instead of scrolling the list, and the click that ends the press
  // neither opens the item nor folds the folder.
  document.addEventListener("touchmove", event => { if (press?.held) event.preventDefault(); }, { passive: false });
  window.addEventListener("click", event => {
    if (Date.now() - swallow > 700 || !pressable(event.target)) return;
    swallow = 0;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  document.addEventListener("contextmenu", event => { if (touched && pressable(event.target)) event.preventDefault(); });
  return {
    html, update, panel, expand, updateFolders, reset, folders, name, options,
    // A folder chosen in another project (or since deleted) is no folder here.
    get active() { return folders().some(f => f.id === active) ? active : null; },
    set active(id) { active = id; },
  };
}
