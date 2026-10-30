import { reorderTasks } from "./task-order-model.js";
import { tableResult } from "./table-model.js";

export function taskReorderHandle(t, esc) {
  return `<button type="button" class="task-reorder-handle" data-task-reorder="${esc(t.id)}" aria-label="Reorder ${esc(t.title)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Drag to reorder. Alt + Up/Down moves this task." ><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></button>`;
}

export function taskReorder(ctx, tableTools) {
  const { state, task, patchTask, renderView, storage, toast, sync, route } = ctx;
  let drag = null, suppressClick = false, saving = false;
  const rowSelector = "#view-content [data-task-order-row]";
  const rows = () => [...document.querySelectorAll(rowSelector)];
  const hierarchy = () => state.view === "tree" || (state.view === "table" && tableTools.preferences().outline);
  const siblings = (a, b) => !hierarchy() || (task(a)?.parent || null) === (task(b)?.parent || null);
  const group = row => row?.dataset.taskOrderGroup || "";
  const handle = id => document.querySelector(`[data-task-reorder="${CSS.escape(id)}"]`);
  const scroller = () => document.querySelector("#view-content > .table-scroll, #view-content > .tree-wrapper") || document.querySelector("#view-content");
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Rows slide from where they were to where they are now, and the moved one is highlighted.
  // Only rows in view move, all measured before any starts.
  function settle(id, before) {
    if (!still()) {
      const view = scroller().getBoundingClientRect();
      const shifts = rows().map(r => {
        const top = r.getBoundingClientRect().top, was = before.get(r.dataset.taskOrderRow);
        const seen = [top, was].some(y => y != null && y > view.top - r.offsetHeight && y < view.bottom);
        return [r, seen && was != null ? was - top : 0];
      });
      for (const [r, dy] of shifts) if (Math.abs(dy) > 1) r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 180, easing: "cubic-bezier(.2, .8, .2, 1)" });
    }
    const moved = rows().find(r => r.dataset.taskOrderRow === id);
    moved?.classList.add("task-reorder-moved");
    setTimeout(() => moved?.classList.remove("task-reorder-moved"), 1200);
  }
  function announce(message) {
    let live = document.querySelector("#task-reorder-status");
    if (!live) {
      live = document.createElement("span");
      live.id = "task-reorder-status";
      live.className = "sr-only";
      live.setAttribute("role", "status");
      document.body.append(live);
    }
    live.textContent = message;
  }
  function orderedScope(id, crossGroup, sourceGroup) {
    let tasks = ctx.filteredTasks();
    if (state.view === "table") {
      const p = tableTools.preferences();
      const result = tableResult(tasks, p, state.config, state.tasks, { me: state.session?.user?.username || "" });
      tasks = result.tasks.filter(t => crossGroup || JSON.stringify(result.groupPath(t)) === sourceGroup);
    } else if (state.view === "list" && state.groupBy !== "none") {
      const key = state.groupBy || "status";
      if (!crossGroup) tasks = tasks.filter(t => String(t[key] || "") === sourceGroup);
      else {
        const groups = key === "status" ? state.config.statuses : [...new Set(tasks.map(t => t[key] || ""))];
        tasks = groups.flatMap(value => tasks.filter(t => (t[key] || "") === value));
      }
    }
    // Context ancestors may not match the search, but are still movable siblings.
    if (hierarchy()) {
      const ids = new Set(tasks.map(t => t.id));
      for (const row of rows()) if (!ids.has(row.dataset.taskOrderRow)) tasks.push(task(row.dataset.taskOrderRow));
      tasks = tasks.filter(t => t && siblings(id, t.id));
    }
    return tasks.map(t => t.id);
  }
  // from: where the moved row's copy was dropped, so it settles from there.
  async function move(id, target, after, from) {
    if (saving || !siblings(id, target)) return;
    const all = rows(), source = all.find(r => r.dataset.taskOrderRow === id), destination = all.find(r => r.dataset.taskOrderRow === target);
    if (!source || !destination) return;
    const crossGroup = group(source) !== group(destination);
    const changes = reorderTasks(state.tasks, orderedScope(id, crossGroup, group(source)), id, target, after);
    if (!changes.length) return;
    const project = state.project.id;
    const scroll = scroller(), position = { top: scroll.scrollTop, left: scroll.scrollLeft };
    const before = new Map(all.map(r => [r.dataset.taskOrderRow, r.getBoundingClientRect().top]));
    if (from != null) before.set(id, from);
    state.sort = "order";
    state.sortDir = 1;
    storage.set(`sort:${project}`, "order");
    if (state.view === "table") {
      tableTools.preferences().sorts = [];
      if (crossGroup) tableTools.preferences().groups = [];
      tableTools.persist();
    } else if (state.view === "list" && crossGroup) {
      state.groupBy = "none";
      storage.set(`group-by:${project}`, "none");
    }
    saving = state.taskReordering = true;
    try {
      // The existing save queue makes these updates optimistic and durable offline.
      const pending = changes.map(({ id, order }) => patchTask(id, { order }, false));
      renderView();
      scroller()?.scrollTo(position);
      handle(id)?.focus({ preventScroll: true });
      handle(id)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      settle(id, before);
      const message = crossGroup ? "Task moved. Grouping cleared to keep your manual order." : "Task moved. Manual order selected.";
      announce(message);
      if (crossGroup) toast(message);
      await Promise.all(pending);
      if (state.project?.id === project && changes.some(({ id }) => {
        const entry = sync.entries.get(route("tasks", id));
        return entry?.blocked || entry?.conflict;
      })) toast("The task order could not be synced. Review the pending changes in save status.", true);
    } catch (error) {
      toast(error.message, true);
    } finally {
      saving = state.taskReordering = false;
    }
  }
  function paint() {
    const d = drag;
    if (!d?.active) return;
    const bounds = d.scroll.getBoundingClientRect();
    const header = d.scroll.querySelector("thead")?.getBoundingClientRect();
    const top = Math.max(0, header?.bottom ?? bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
    const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
    d.valid = d.x >= left && d.x <= right && d.y >= top && d.y <= bottom;
    const candidates = rows().filter(r => r.dataset.taskOrderRow !== d.id && siblings(d.id, r.dataset.taskOrderRow));
    const hovered = document.elementFromPoint(d.x, d.y)?.closest("[data-task-order-row]");
    if (hovered && !siblings(d.id, hovered.dataset.taskOrderRow)) d.valid = false;
    const before = candidates.find(r => { const b = r.getBoundingClientRect(); return d.y < b.top + b.height / 2; });
    const target = before || candidates.at(-1);
    d.target = target?.dataset.taskOrderRow;
    d.after = !before;
    let markerY = target?.getBoundingClientRect()[before ? "top" : "bottom"];
    // A parent's whole branch travels with it in the tree/outline.
    if (d.after && hierarchy() && target) {
      const following = rows().slice(rows().indexOf(target) + 1);
      const branch = new Set([d.target]);
      for (const row of following) {
        const t = task(row.dataset.taskOrderRow);
        if (!branch.has(t?.parent)) break;
        branch.add(t.id);
        markerY = row.getBoundingClientRect().bottom;
      }
    }
    d.marker.hidden = !d.valid || markerY == null || markerY < top || markerY > bottom;
    Object.assign(d.marker.style, { left: `${left}px`, top: `${markerY}px`, width: `${right - left}px` });
    // A lifted row moves up and down with the pointer where it was grabbed; Table's title follows it.
    if (d.grab != null) d.ghost.style.top = `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y - d.grab))}px`;
    else Object.assign(d.ghost.style, {
      left: `${Math.max(8, Math.min(innerWidth - d.ghost.offsetWidth - 8, d.x + 16))}px`,
      top: `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y + 16))}px`,
    });
    d.ghost.classList.toggle("invalid", !d.valid || !d.target);
  }
  function tick(time) {
    const d = drag;
    if (!d?.active) return;
    if (!d.row.isConnected || state.project?.id !== d.project || state.view !== d.view) return finish(false);
    const b = d.scroll.getBoundingClientRect();
    const top = Math.max(0, d.scroll.querySelector("thead")?.getBoundingClientRect().bottom ?? b.top), bottom = Math.min(innerHeight, b.bottom);
    const elapsed = Math.min(32, time - (d.time ?? time));
    d.time = time;
    if (d.x >= b.left && d.x <= Math.min(innerWidth, b.right) && d.y >= top && d.y <= bottom) {
      const speed = d.y < top + 40 ? -Math.min(1, (top + 40 - d.y) / 40) : d.y > bottom - 40 ? Math.min(1, (d.y - bottom + 40) / 40) : 0;
      d.scroll.scrollTop += speed * elapsed * 0.65;
    }
    paint();
    d.frame = requestAnimationFrame(tick);
  }
  function start() {
    const d = drag;
    d.active = suppressClick = true;
    state.taskReordering = true;
    document.body.classList.add("task-reordering");
    // List and Tree rows lift as a copy of themselves; a table row can't stand alone, so Table
    // shows the title.
    if (state.view === "table") {
      d.ghost = document.createElement("div");
      d.ghost.className = "task-reorder-ghost";
      d.ghost.textContent = task(d.id)?.title || "Task";
    } else {
      const r = d.row.getBoundingClientRect();
      d.ghost = d.row.cloneNode(true);
      d.ghost.removeAttribute("data-task-order-row");
      // Nothing in the copy answers to the row's actions or lookups.
      for (const el of d.ghost.querySelectorAll("[id], [data-action], [data-id], [data-row-field], [data-row-dates], [data-task-reorder]"))
        for (const name of ["id", "data-action", "data-id", "data-row-field", "data-row-dates", "data-task-reorder"]) el.removeAttribute(name);
      d.ghost.inert = true;
      d.ghost.classList.add("task-reorder-ghost", "task-reorder-lifted");
      Object.assign(d.ghost.style, { left: `${r.left}px`, width: `${r.width}px` });
      d.grab = d.startY - r.top;
    }
    d.row.classList.add("task-reorder-source");
    d.marker = document.createElement("div");
    d.marker.className = "task-reorder-marker";
    // The copy stays in the page, so its styles apply, outside the rows; the line needs no page styles.
    for (const el of [d.ghost, d.marker]) el.setAttribute("aria-hidden", "true");
    (d.row.closest(".main") || document.body).append(d.ghost);
    document.body.append(d.marker);
    announce(hierarchy() ? "Reorder among sibling tasks. Escape cancels." : "Drag to the desired position. Escape cancels.");
    paint();
    d.frame = requestAnimationFrame(tick);
  }
  function finish(commit) {
    const d = drag;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(d.frame);
    d.row.classList.remove("task-reorder-source");
    d.marker?.remove();
    document.body.classList.remove("task-reordering");
    if (d.button.hasPointerCapture(d.pointer)) d.button.releasePointerCapture(d.pointer);
    state.taskReordering = false;
    const dropped = d.ghost?.getBoundingClientRect().top;
    const ghost = d.ghost;
    if (commit && d.active && d.valid && d.target) {
      ghost?.remove();
      void move(d.id, d.target, d.after, d.grab != null ? dropped : undefined);
    } else {
      // A cancelled copy glides back to its row before it goes.
      if (ghost && d.grab != null && d.row.isConnected && !still()) {
        const back = ghost.animate([{ transform: "none" }, { transform: `translateY(${d.row.getBoundingClientRect().top - dropped}px)` }], { duration: 160, easing: "ease-out" });
        back.onfinish = back.oncancel = () => ghost.remove();
      } else ghost?.remove();
      if (d.active) announce("Reordering cancelled.");
    }
    setTimeout(() => { suppressClick = false; }, 0);
  }
  document.addEventListener("pointerdown", e => {
    if (drag && drag.pointer !== e.pointerId) { finish(false); return; }
    const button = e.target.closest("[data-task-reorder]");
    if (!button || e.button !== 0 || saving || !["table", "list", "tree"].includes(state.view)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    finish(false);
    button.focus({ preventScroll: true });
    drag = { button, row: button.closest("[data-task-order-row]"), scroll: scroller(), id: button.dataset.taskReorder,
      pointer: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, project: state.project.id, view: state.view };
    state.taskReordering = true;
    button.setPointerCapture(e.pointerId);
  }, true);
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6) start();
    if (drag.active) { e.preventDefault(); paint(); }
  }, true);
  document.addEventListener("pointerup", e => { if (drag?.pointer === e.pointerId) { paint(); finish(true); } }, true);
  for (const event of ["pointercancel", "lostpointercapture"]) document.addEventListener(event, e => { if (drag?.pointer === e.pointerId) finish(false); }, true);
  document.addEventListener("click", e => {
    if (suppressClick || e.target.closest("[data-task-reorder]")) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("keydown", e => {
    if (drag && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(false); return; }
    const button = e.target.closest("[data-task-reorder]");
    if (!button || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const id = button.dataset.taskReorder, candidates = rows().filter(r => siblings(id, r.dataset.taskOrderRow));
    const next = candidates[candidates.findIndex(r => r.dataset.taskOrderRow === id) + (e.key === "ArrowUp" ? -1 : 1)];
    if (next) void move(id, next.dataset.taskOrderRow, e.key === "ArrowDown");
  }, true);
  window.addEventListener("blur", () => finish(false));
}
