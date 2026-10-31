import { newGrid, GRID_DEFAULT_SIZE } from "./grid-model.js";

// Drag a tool onto the canvas without creating anything until a valid drop.
export function canvasToolDrag(ctx, place, placeTask) {
  const { state, $, task, board, esc, icon, label, statusNames } = ctx;
  let drag = null,
    suppressClickUntil = 0;
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  function valid(x, y) {
    const target = document.elementFromPoint(x, y);
    return (
      target?.closest("#canvas") &&
      !target.closest(
        ".board-tools,.board-controls,.canvas-panel,.canvas-find,.canvas-filters,#selection-tools,#canvas-minimap",
      )
    );
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6)
      return;
    const canvas = $("#canvas");
    if (!canvas || board()?.id !== drag.board || !drag.button.isConnected) {
      cancel();
      return;
    }
    if (
      !drag.active &&
      drag.taskId &&
      e.pointerType === "touch" &&
      Math.abs(e.clientY - drag.y) > Math.abs(e.clientX - drag.x)
    ) {
      cancel();
      return;
    }
    stop(e);
    drag.active = true;
    drag.button.classList.add("drag-source");
    if (drag.taskId) canvas.classList.add("dragging-project-task");
    state.toolDragging = true;
    if (!drag.preview) {
      drag.preview = document.createElement("div");
      drag.preview.className = drag.taskId
        ? "task-drop-preview"
        : drag.tool === "grid"
          ? "grid-drop-preview"
          : "sticky-drop-preview";
      if (drag.taskId) {
        const t = task(drag.taskId);
        if (!t || t.archived) {
          cancel();
          return;
        }
        drag.preview.innerHTML = `<div class="task-drop-heading">${icon(t.type)} ${esc(label(t.type))}<span>${esc(t.key || "")}</span></div><strong>${esc(t.title)}</strong><div class="task-drop-meta">${esc(statusNames[t.status] || t.status)}${t.assignee ? ` · ${esc(t.assignee)}` : ""}</div><small>Drop to place task</small>`;
      } else if (drag.tool === "grid") {
        const grid = newGrid();
        drag.preview.innerHTML = `<div class="grid-grip">${icon("table")}<span>Drop to add a grid</span></div><div class="grid-cells" style="grid-template-columns:${grid.columns.map((v) => `${v}fr`).join(" ")};grid-template-rows:${grid.rows.map((v) => `${v}fr`).join(" ")}">${grid.cells.map((row, r) => row.map(() => `<div class="grid-cell ${grid.header && r === 0 ? "grid-header" : ""}"></div>`).join("")).join("")}</div>`;
      } else drag.preview.textContent = "Drop to add a note";
      drag.preview.setAttribute("aria-hidden", "true");
      canvas.append(drag.preview);
    }
    const r = canvas.getBoundingClientRect(),
      z = state.camera.z;
    drag.offsetX = 30 * z;
    drag.offsetY = 24 * z;
    Object.assign(drag.preview.style, {
      left: `${e.clientX - r.left - drag.offsetX}px`,
      top: `${e.clientY - r.top - drag.offsetY}px`,
      width: `${drag.taskId ? 280 : drag.tool === "grid" ? GRID_DEFAULT_SIZE.w : 220 * z}px`,
      height: `${drag.taskId ? 180 : drag.tool === "grid" ? GRID_DEFAULT_SIZE.h : 180 * z}px`,
      ...(drag.taskId || drag.tool === "grid"
        ? { transform: `scale(${z})` }
        : {}),
    });
    drag.preview.classList.toggle("invalid", !valid(e.clientX, e.clientY));
  }
  function cancel() {
    const old = drag;
    drag = null;
    state.toolDragging = false;
    old?.preview?.remove();
    old?.button.classList.remove("drag-source");
    $("#canvas")?.classList.remove("dragging-project-task");
    if (old?.button.hasPointerCapture(old.id))
      old.button.releasePointerCapture(old.id);
    if (old?.active) suppressClickUntil = Date.now() + 500;
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      suppressClickUntil = 0;
      const button = e.target.closest(
        ".board-tools :is([data-tool=sticky],[data-tool=grid]),#board-task-panel [data-action=board-pick]",
      );
      if (
        !button ||
        e.button !== 0 ||
        !e.isPrimary ||
        state.canvasEditing ||
        state.dialog ||
        state.boardConflict
      )
        return;
      if (drag) cancel();
      e.stopImmediatePropagation();
      drag = {
        id: e.pointerId,
        tool: button.dataset.tool,
        taskId:
          button.dataset.action === "board-pick" ? button.dataset.id : null,
        board: board()?.id,
        button,
        x: e.clientX,
        y: e.clientY,
        active: false,
      };
      button.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener("pointermove", move, true);
  document.addEventListener(
    "dragstart",
    (e) => {
      if (drag) e.preventDefault();
    },
    true,
  );
  document.addEventListener(
    "pointerup",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const old = drag,
        drop = old.active && valid(e.clientX, e.clientY);
      if (old.active) stop(e);
      cancel();
      if (drop) {
        const point = {
          clientX: e.clientX - old.offsetX,
          clientY: e.clientY - old.offsetY,
        };
        if (old.taskId) {
          if (
            board()?.id === old.board &&
            task(old.taskId) &&
            !task(old.taskId).archived
          )
            placeTask(old.taskId, point);
        } else {
          state.tool = old.tool;
          place(point);
        }
      }
    },
    true,
  );
  for (const name of ["pointercancel", "lostpointercapture"])
    document.addEventListener(
      name,
      (e) => {
        if (drag?.id === e.pointerId) cancel();
      },
      true,
    );
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        stop(e);
        cancel();
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (Date.now() < suppressClickUntil && e.target.closest("#canvas")) {
        stop(e);
        suppressClickUntil = 0;
      }
    },
    true,
  );
  window.addEventListener("blur", cancel);
  return { busy: () => !!drag?.active };
}
