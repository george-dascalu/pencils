import { priorityOptions } from "./task-priority.js";
import { projectTags, listableTag } from "./project-tags.js";

// Tag groups (F0.21-91): a card is in each of its tags' groups, or in No tag ("") without one.
export const tagGroups = (task) => (task.tags?.length ? [...new Set(task.tags)] : [""]);
export const inGroup = (task, key, value) => (key === "tags" ? tagGroups(task).includes(value) : (task[key] || "") === value);
// A card moved from one tag's group to another's swaps that tag; No tag clears them all.
export function tagMove(task, from, to) {
  const tags = task.tags || [];
  if (to && !listableTag(to)) throw new Error("Choose a tag without commas, up to 80 characters.");
  if (from === to) return null;
  const kept = tags.filter((tag) => tag !== from), next = !to ? [] : kept.includes(to) ? kept : [...kept, to];
  return next.length === tags.length && next.every((tag, i) => tag === tags[i]) ? null : next;
}

// Assignees run A to Z with Unassigned last; statuses, types and priorities keep the project's order.
export function naturalGroups(key, tasks, config, people = []) {
  const value = (t) => t[key] || "";
  if (key === "status") return [...new Set([...config.statuses, ...tasks.map(value)])];
  if (key === "tags") return [...projectTags(config, tasks).map((tag) => tag.name), ""];
  if (key === "assignee") return [...new Set([...people, ...tasks.map(value)].filter(Boolean))].sort((a, b) => a.localeCompare(b)).concat("");
  return [...new Set([...(key === "type" ? config.types : key === "priority" ? priorityOptions : []), ...tasks.map(value)])];
}

// List groups follow their natural order (workflow, types, priority, people A to Z), or the order a
// person dragged them into, reversed by Group by's toggle; kept per project and grouping field.

export function orderGroups(natural, custom = [], dir = 1) {
  const rank = new Map(custom.map((value, i) => [value, i]));
  const ordered = natural.map((value, i) => [value, rank.get(value) ?? custom.length + i]).sort((a, b) => a[1] - b[1]).map(([value]) => value);
  return dir === -1 ? ordered.reverse() : ordered;
}

// before: the group it now precedes, or null for last.
export function moveGroup(order, value, before) {
  const rest = order.filter(v => v !== value), at = before == null ? -1 : rest.indexOf(before);
  rest.splice(at < 0 ? rest.length : at, 0, value);
  return rest;
}

const key = project => `group-order:${project}`;
export function groupPreference(storage, project, field) {
  const saved = storage.get(key(project), {})?.[field];
  return { order: Array.isArray(saved?.order) ? saved.order.map(String) : [], dir: saved?.dir === -1 ? -1 : 1 };
}
export function saveGroupPreference(storage, project, field, preference) {
  const all = storage.get(key(project), {});
  storage.set(key(project), { ...(all && typeof all === "object" ? all : {}), [field]: preference });
}

export function groupReorderHandle(value, name, esc) {
  return `<button type="button" class="task-reorder-handle" data-group-reorder="${esc(value)}" aria-label="Move group ${esc(name)}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Drag to reorder groups. Alt + Up/Down moves this group."><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></button>`;
}

// The heading's name leaves out its handle's label.
export const groupHeadingLabel = (name, count, esc) => `aria-label="${esc(name)}, ${count} ${count === 1 ? "card" : "cards"}"`;

// Dragging a group heading's handle (or Alt + Up/Down on it) saves the order shown, unreversed.
export function taskGroupDrag({ state, storage, renderView }) {
  let drag = null, suppressClick = false;
  const sections = () => [...document.querySelectorAll("#view-content section[data-task-drop-field]")];
  const shown = () => sections().filter(s => !s.hidden);
  const field = () => state.groupBy || "status";
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
  function move(value, before) {
    const order = sections().map(s => s.dataset.taskDropValue), next = moveGroup(order, value, before);
    saveGroupPreference(storage, state.project.id, field(), { order: next, dir: 1 });
    renderView(true);
    const moved = shown().find(s => s.dataset.taskDropValue === value);
    const grip = moved?.querySelector("[data-group-reorder]");
    grip?.focus({ preventScroll: true });
    grip?.scrollIntoView({ block: "nearest" });
    moved?.querySelector(".section-title")?.classList.add("task-reorder-moved");
    announce(`${grip?.getAttribute("aria-label").replace(/^Move group /, "") || "Group"} moved to position ${shown().indexOf(moved) + 1} of ${shown().length}.`);
  }
  function paint() {
    const d = drag;
    const bounds = d.scroll.getBoundingClientRect();
    const top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
    d.valid = d.y >= top && d.y <= bottom;
    const others = shown().filter(s => s !== d.section);
    // Before the first group whose heading is still below the pointer.
    const before = others.find(s => { const r = s.querySelector(".section-title").getBoundingClientRect(); return d.y < r.top + r.height / 2; });
    d.before = before?.dataset.taskDropValue ?? null;
    const current = shown().map(s => s.dataset.taskDropValue);
    d.changed = moveGroup(current, d.value, d.before).some((v, i) => v !== current[i]);
    const y = before ? before.getBoundingClientRect().top : others.at(-1)?.getBoundingClientRect().bottom;
    d.marker.hidden = !d.valid || y == null;
    Object.assign(d.marker.style, { left: `${Math.max(0, bounds.left)}px`, top: `${y}px`, width: `${Math.min(innerWidth, bounds.right) - Math.max(0, bounds.left)}px` });
    d.ghost.style.top = `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y - d.grab))}px`;
    d.ghost.classList.toggle("invalid", !d.valid);
  }
  function tick(time) {
    const d = drag;
    if (!d?.active) return;
    if (!d.section.isConnected || state.project?.id !== d.project || state.view !== "list") return finish(false);
    const b = d.scroll.getBoundingClientRect(), top = Math.max(0, b.top), bottom = Math.min(innerHeight, b.bottom);
    const elapsed = Math.min(32, time - (d.time ?? time));
    d.time = time;
    const speed = d.y < top + 40 ? -Math.min(1, (top + 40 - d.y) / 40) : d.y > bottom - 40 ? Math.min(1, (d.y - bottom + 40) / 40) : 0;
    d.scroll.scrollTop += speed * elapsed * 0.65;
    paint();
    d.frame = requestAnimationFrame(tick);
  }
  function start() {
    const d = drag, heading = d.section.querySelector(".section-title"), r = heading.getBoundingClientRect();
    d.active = suppressClick = true;
    d.ghost = heading.cloneNode(true);
    for (const el of [d.ghost, ...d.ghost.querySelectorAll("[id], [data-group-reorder]")]) el.removeAttribute("id"), el.removeAttribute("data-group-reorder");
    d.ghost.inert = true;
    d.ghost.classList.add("task-reorder-ghost", "task-reorder-lifted", "task-group-ghost", "drag-ghost");
    Object.assign(d.ghost.style, { left: `${r.left}px`, width: `${r.width}px` });
    d.grab = d.startY - r.top;
    d.marker = document.createElement("div");
    d.marker.className = "task-reorder-marker";
    for (const el of [d.ghost, d.marker]) el.setAttribute("aria-hidden", "true");
    d.section.classList.add("task-reorder-source");
    document.body.classList.add("task-group-reordering");
    (d.section.closest(".main") || document.body).append(d.ghost);
    document.body.append(d.marker);
    announce("Drag the group to its new position. Escape cancels.");
    paint();
    d.frame = requestAnimationFrame(tick);
  }
  function finish(commit) {
    const d = drag;
    if (!d) return;
    drag = null;
    state.taskReordering = false;
    cancelAnimationFrame(d.frame);
    if (d.button.hasPointerCapture(d.pointer)) d.button.releasePointerCapture(d.pointer);
    d.section.classList.remove("task-reorder-source");
    document.body.classList.remove("task-group-reordering");
    d.ghost?.remove();
    d.marker?.remove();
    if (d.active && commit && d.valid && d.changed) move(d.value, d.before);
    else if (d.active) announce("Group move cancelled.");
    setTimeout(() => { suppressClick = false; }, 0);
  }
  // On window, so it runs before the card drag's document listener: a second finger, on a card or
  // not, cancels a group drag, and a card drag or its save holds group moves.
  window.addEventListener("pointerdown", e => {
    if (drag && drag.pointer !== e.pointerId) return finish(false);
    const button = e.target.closest("[data-group-reorder]");
    if (!button || e.button !== 0 || state.view !== "list" || state.taskReordering) return;
    e.preventDefault(); e.stopImmediatePropagation();
    button.focus({ preventScroll: true });
    drag = { button, section: button.closest("section"), value: button.dataset.groupReorder, pointer: e.pointerId, project: state.project.id,
      scroll: document.querySelector("#view-content"), x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
    state.taskReordering = true; // Holds background repaints that would replace the heading.
    button.setPointerCapture(e.pointerId);
  }, true);
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 6) start();
    if (drag.active) { e.preventDefault(); paint(); }
  }, true);
  document.addEventListener("pointerup", e => { if (drag?.pointer === e.pointerId) { if (drag.active) paint(); finish(true); } }, true);
  for (const type of ["pointercancel", "lostpointercapture"]) document.addEventListener(type, e => { if (drag?.pointer === e.pointerId) finish(false); }, true);
  document.addEventListener("click", e => {
    if (suppressClick || e.target.closest("[data-group-reorder]")) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  document.addEventListener("keydown", e => {
    if (drag && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); return finish(false); }
    const button = e.target.closest("[data-group-reorder]");
    if (!button || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key) || state.view !== "list" || state.taskReordering) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const list = shown(), at = list.indexOf(button.closest("section")), up = e.key === "ArrowUp";
    if (up ? at > 0 : at < list.length - 1) move(button.dataset.groupReorder, up ? list[at - 1].dataset.taskDropValue : list[at + 2]?.dataset.taskDropValue ?? null);
    else announce(`This group is already ${up ? "first" : "last"}.`);
  }, true);
  window.addEventListener("blur", () => finish(false));
}
