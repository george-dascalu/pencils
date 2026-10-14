import { canTransition } from "./workflow-model.js";
export function kanbanDrag(ctx) {
  const { state, task, patchTask, renderView, storage, toast } = ctx;
  let drag = null,
    frame = null;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  function clean() {
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
    const permitted =
      column &&
      canTransition(
        state.config,
        task(drag.id)?.status,
        column.dataset.dropStatus,
      );
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
    const vertical = speed(drag.y, 0, innerHeight);
    if (drag.y >= r.top && drag.y <= r.bottom) board.scrollLeft += horizontal;
    if (drag.x >= r.left && drag.x <= r.right) window.scrollBy(0, vertical);
    if (horizontal || vertical) update(drag.x, drag.y);
    frame = requestAnimationFrame(scroll);
  }
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest("[data-drag-task]");
    if (!card || state.view !== "kanban") return;
    clean();
    const r = card.getBoundingClientRect(),
      ghost = card.cloneNode(true),
      placeholder = document.createElement("div");
    ghost.removeAttribute("data-drag-task");
    ghost.removeAttribute("draggable");
    ghost.classList.add("kanban-drag-image");
    ghost.style.width = `${r.width}px`;
    ghost.setAttribute("aria-hidden", "true");
    document.body.append(ghost);
    placeholder.className = "kanban-drop-placeholder";
    placeholder.style.height = `${r.height}px`;
    placeholder.textContent = "Drop here";
    placeholder.setAttribute("aria-hidden", "true");
    e.dataTransfer.setData("text/plain", card.dataset.dragTask);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setDragImage(
      ghost,
      Math.max(12, Math.min(r.width - 12, e.clientX - r.left)),
      Math.max(12, Math.min(r.height - 12, e.clientY - r.top)),
    );
    for (const col of document.querySelectorAll("[data-drop-status]")) {
      if (
        !canTransition(
          state.config,
          task(card.dataset.dragTask)?.status,
          col.dataset.dropStatus,
        )
      ) {
        col.classList.add("workflow-blocked");
        col.title = "This move is not allowed by the project workflow.";
      }
    }
    drag = {
      card,
      id: card.dataset.dragTask,
      ghost,
      placeholder,
      x: e.clientX,
      y: e.clientY,
    };
    state.kanbanDragging = true;
    document.body.classList.add("kanban-dragging");
    requestAnimationFrame(() => {
      if (!drag) return;
      ghost.remove();
      card.classList.add("kanban-drag-source");
      update(drag.x, drag.y);
      scroll();
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
  document.addEventListener("drop", async (e) => {
    if (!drag) return;
    e.preventDefault();
    update(e.clientX, e.clientY);
    const { id, column, before, card, placeholder } = drag;
    if (!column) {
      clean();
      return;
    }
    const status = column.dataset.dropStatus;
    // Keep the visible order even when the view was sorted by another field.
    // Hidden cards retain their relative order after the visible cards.
    const visible = [...column.querySelectorAll("[data-drag-task]")]
      .map((el) => el.dataset.dragTask)
      .filter((key) => key !== id);
    const hidden = state.tasks
      .filter(
        (t) => t.status === status && t.id !== id && !visible.includes(t.id),
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
          return t && (t.order !== order || t.status !== status)
            ? [patchTask(key, { status, order }, false)]
            : [];
        }),
      );
      renderView();
      await saving;
    } catch (error) {
      toast(error.message, true);
      renderView();
    }
  });
  document.addEventListener("dragend", clean);
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") clean();
    },
    true,
  );
  window.addEventListener("blur", clean);
  return { cancel: clean };
}
