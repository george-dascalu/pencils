import { kanbanDropChanges, kanbanDropError, laneValue } from "./kanban-model.js";
import { reorderTasks } from "./task-order-model.js";
import { snapKanbanColumns } from "./kanban-layout.js";
// A light tick: Android vibrates; Safari on iOS 18 ticks when a switch toggles, here a hidden one.
function haptic() {
  if (navigator.vibrate) {
    navigator.vibrate(10);
    return;
  }
  const label = document.createElement("label"),
    input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.style.display = "none";
  label.append(input);
  // The switch's own events stay out of the app's listeners.
  for (const type of ["click", "input", "change"]) label.addEventListener(type, (event) => event.stopPropagation());
  document.head.append(label);
  label.click();
  label.remove();
}
export function kanbanDrag(ctx) {
  const { state, task, patchTask, renderView, storage, toast } = ctx;
  let drag = null,
    frame = null,
    press = null;
  function changesFor(t, column) {
    return kanbanDropChanges(t, column.dataset.dropStatus, column.dataset.kanbanField, column.dataset.kanbanValue);
  }
  function dropError(t, column) {
    return t ? kanbanDropError(state.config, t, changesFor(t, column), state.tasks) : "This task is no longer available.";
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  function clean() {
    const board = drag?.card.closest(".kanban");
    cancelAnimationFrame(frame);
    frame = null;
    drag?.card.classList.remove("kanban-drag-source");
    drag?.placeholder.remove();
    drag?.ghost.remove();
    document
      .querySelectorAll(".kanban-column.over")
      .forEach((el) => el.classList.remove("over"));
    document.querySelectorAll(".workflow-blocked").forEach((el) => {
      el.classList.remove("workflow-blocked");
      el.removeAttribute("title");
    });
    snapKanbanColumns(board);
    document.body.classList.remove("kanban-dragging");
    state.kanbanDragging = false;
    drag = null;
  }
  function update(x, y) {
    if (!drag) return;
    drag.x = x;
    drag.y = y;
    const column = document
      .elementFromPoint(x, y)
      ?.closest("[data-drop-status]");
    const permitted = column && !dropError(task(drag.id), column);
    document.querySelectorAll(".kanban-column.over").forEach((el) => {
      if (el !== column) el.classList.remove("over");
    });
    if (!permitted) {
      drag.placeholder.remove();
      drag.column = null;
      return;
    }
    column.classList.add("over");
    drag.column = column;
    const cards = [...column.querySelectorAll("[data-drag-task]")].filter(
      (el) => el !== drag.card,
    );
    const before = cards.find((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    const anchor = before || column.querySelector(".add-row");
    drag.before = before?.dataset.dragTask || null;
    if (
      drag.placeholder.parentElement !== column ||
      drag.placeholder.nextElementSibling !== anchor
    ) {
      const boxes = new Map(
        cards.map((el) => [el, el.getBoundingClientRect().top]),
      );
      column.insertBefore(drag.placeholder, anchor);
      if (!reduce.matches)
        for (const [el, top] of boxes) {
          const delta = top - el.getBoundingClientRect().top;
          if (delta)
            el.animate(
              [
                { transform: `translateY(${delta}px)` },
                { transform: "translateY(0)" },
              ],
              { duration: 140, easing: "ease-out" },
            );
        }
    }
  }
  function scroll() {
    if (!drag) return;
    const board = drag.card.closest(".kanban"),
      r = board.getBoundingClientRect();
    const speed = (p, start, end) =>
      p < start + 60
        ? -Math.min(18, (start + 60 - p) / 3)
        : p > end - 60
          ? Math.min(18, (p - end + 60) / 3)
          : 0;
    const horizontal = speed(drag.x, r.left, Math.min(innerWidth, r.right));
    if (drag.y >= r.top && drag.y <= r.bottom) board.scrollLeft += horizontal;
    // Swimlanes share one scroll surface; ungrouped columns scroll independently.
    const column = drag.column;
    const grouped = board.classList.contains("kanban-swimlanes");
    const scroller = grouped ? board : column;
    const bounds = scroller?.getBoundingClientRect();
    const headerHeight = grouped ? board.querySelector(".kanban-lanes-header").offsetHeight : column?.querySelector(".column-header")?.offsetHeight || 0;
    const vertical = bounds && drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom
      ? speed(drag.y, bounds.top + headerHeight, Math.min(innerHeight, bounds.bottom)) : 0;
    if (vertical) scroller.scrollTop += vertical;
    if (horizontal || vertical) update(drag.x, drag.y);
    frame = requestAnimationFrame(scroll);
  }
  // Mouse (native drag and drop) and touch (a long press) start a drag the same way: a copy of the
  // card to drag, a placeholder where it will land, and the columns it can't enter marked.
  function begin(card, x, y) {
    clean();
    const r = card.getBoundingClientRect(),
      ghost = card.cloneNode(true),
      placeholder = document.createElement("div");
    ghost.removeAttribute("data-drag-task");
    ghost.removeAttribute("draggable");
    ghost.classList.add("kanban-drag-image");
    ghost.style.width = `${r.width}px`;
    ghost.setAttribute("aria-hidden", "true");
    // In the page, so its styles (such as touch text sizes) still apply to the copy, but outside
    // the scrolling columns, whose drag images Safari can draw wrongly.
    (card.closest(".main") || document.body).append(ghost);
    placeholder.className = "kanban-drop-placeholder";
    placeholder.style.height = `${r.height}px`;
    placeholder.textContent = "Drop here";
    placeholder.setAttribute("aria-hidden", "true");
    for (const col of document.querySelectorAll("[data-drop-status]")) {
      const error = dropError(task(card.dataset.dragTask), col);
      if (error) {
        col.classList.add("workflow-blocked");
        col.title = error;
      }
    }
    drag = { card, id: card.dataset.dragTask, ghost, placeholder, x, y, dx: x - r.left, dy: y - r.top };
    state.kanbanDragging = true;
    document.body.classList.add("kanban-dragging");
  }
  // The card leaves its place for the placeholder, and the board scrolls near its edges.
  function lift() {
    drag.card.classList.add("kanban-drag-source");
    update(drag.x, drag.y);
    scroll();
  }
  async function drop(x, y) {
    update(x, y);
    const { id, column, before, card, placeholder } = drag;
    if (!column) {
      clean();
      return;
    }
    const status = column.dataset.dropStatus;
    const changes = changesFor(task(id), column);
    const field = column.dataset.kanbanField, value = column.dataset.kanbanValue;
    // Keep the visible order even when the view was sorted by another field.
    // Hidden cards retain their relative order after the visible cards.
    const visible = [...column.querySelectorAll("[data-drag-task]")]
      .map((el) => el.dataset.dragTask)
      .filter((key) => key !== id);
    const hidden = state.tasks
      .filter(
        (t) => t.status === status && (!field || laneValue(t, field) === value) && t.id !== id && !visible.includes(t.id),
      )
      .sort(
        (a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id),
      )
      .map((t) => t.id);
    const ordered = [...visible];
    ordered.splice(before ? visible.indexOf(before) : visible.length, 0, id);
    ordered.push(...hidden);
    column.insertBefore(card, placeholder);
    clean();
    state.sort = "order";
    state.sortDir = 1;
    storage.set(`sort:${state.project.id}`, "order");
    try {
      // patchTask updates local state before awaiting its persistent save queue.
      const saving = Promise.all(
        ordered.flatMap((key, order) => {
          const t = task(key);
          const patch = { ...(t?.order !== order ? { order } : {}), ...(key === id ? changes : {}) };
          return t && Object.keys(patch).length ? [patchTask(key, patch, false)] : [];
        }),
      );
      renderView(true);
      await saving;
    } catch (error) {
      toast(error.message, true);
      renderView();
    }
  }
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest("[data-drag-task]");
    if (!card || e.defaultPrevented || state.view !== "kanban") return;
    begin(card, e.clientX, e.clientY);
    const { ghost, dx, dy } = drag;
    e.dataTransfer.setData("text/plain", card.dataset.dragTask);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(
      ghost,
      Math.max(12, Math.min(ghost.offsetWidth - 12, dx)),
      Math.max(12, Math.min(card.offsetHeight - 12, dy)),
    );
    requestAnimationFrame(() => {
      if (!drag) return;
      ghost.remove();
      lift();
    });
  });
  document.addEventListener("dragenter", (e) => {
    if (drag && e.target.closest("[data-drop-status]")) e.preventDefault();
  });
  document.addEventListener("dragover", (e) => {
    if (!drag) return;
    e.preventDefault();
    update(e.clientX, e.clientY);
    e.dataTransfer.dropEffect = drag.column ? "move" : "none";
  });
  document.addEventListener("drop", (e) => {
    if (!drag) return;
    e.preventDefault();
    void drop(e.clientX, e.clientY);
  });
  document.addEventListener("dragend", clean);
  // Touch: a long press lifts the card, which then follows the finger and lands where it is let
  // go; moving first scrolls as usual. Native drag and drop is off for touches, as iOS draws a tiny
  // framed copy and drops unreliably.
  const follow = () => {
    drag.ghost.style.transform = `translate(${drag.x - drag.dx}px, ${drag.y - drag.dy}px)`;
  };
  // Only the finger that pressed the card moves and drops it.
  const ours = (touches) => [...touches].find((touch) => touch.identifier === press?.id);
  function move(e) {
    const touch = ours(e.touches);
    if (!touch) return;
    if (!press.lifted) {
      if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > 8) wait();
      return;
    }
    if (!drag) return; // Escape or a lost window ended it
    e.preventDefault(); // the card moves, not the page
    drag.moved = true;
    update(touch.clientX, touch.clientY);
    follow();
  }
  // A moving finger scrolls instead; the card stays out of native drag until that finger lifts.
  function wait() {
    clearTimeout(press?.timer);
    document.removeEventListener("touchmove", move);
  }
  function release() {
    if (!press) return;
    wait();
    press.card.draggable = true;
    press = null;
  }
  document.addEventListener("touchstart", (e) => {
    if (press && e.touches.length > 1) return; // another finger doesn't start or end a drag
    if (press) { // a press whose end never arrived (its card was redrawn)
      if (press.lifted) clean();
      release();
    }
    const card = e.target.closest?.("[data-drag-task]");
    if (!card || e.touches.length > 1 || state.view !== "kanban") return;
    const touch = e.changedTouches[0];
    card.draggable = false;
    press = { card, id: touch.identifier, x: touch.clientX, y: touch.clientY };
    press.timer = setTimeout(() => {
      // A refresh may have redrawn the board under the finger.
      if (!card.isConnected || state.view !== "kanban") return wait();
      press.lifted = true;
      begin(card, press.x, press.y);
      drag.ghost.classList.add("kanban-touch-lift");
      follow();
      lift();
      haptic();
    }, 350);
    // Added for this touch only, so scrolling elsewhere never waits on it.
    document.addEventListener("touchmove", move, { passive: false });
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    const touch = ours(e.changedTouches);
    if (!touch) return;
    const lifted = press.lifted && drag;
    release();
    if (!lifted) return;
    e.preventDefault(); // no click on the card after a drop
    haptic();
    // Let go where it was lifted, nothing changes (not even the sort).
    if (!lifted.moved) return clean();
    void drop(touch.clientX, touch.clientY);
  });
  document.addEventListener("touchcancel", (e) => {
    if (!ours(e.changedTouches)) return;
    if (press.lifted) clean();
    release();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") clean();
      const card = e.target.closest("[data-drag-task]");
      if (!card || state.view !== "kanban" || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const ids = [...card.parentElement.querySelectorAll("[data-drag-task]")].map(el => el.dataset.dragTask);
      const id = card.dataset.dragTask;
      const after = e.key === "ArrowDown";
      const target = ids[ids.indexOf(id) + (after ? 1 : -1)];
      if (!target) return;
      const changes = reorderTasks(state.tasks, ids, id, target, after);
      state.sort = "order";
      state.sortDir = 1;
      storage.set(`sort:${state.project.id}`, "order");
      const saving = Promise.all(changes.map(({ id, order }) => patchTask(id, { order }, false)));
      renderView(true);
      document.querySelector(`[data-drag-task="${CSS.escape(id)}"] [data-action="task-open"]`)?.focus({ preventScroll: true });
      toast(`${task(id).title} moved ${after ? "down" : "up"} in ${card.parentElement?.getAttribute("aria-label") || "its column"}.`);
      saving.catch(error => toast(error.message, true));
    },
    true,
  );
  window.addEventListener("blur", () => {
    release();
    clean();
  });
  return { cancel: clean };
}
