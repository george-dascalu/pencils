// Reordering shares the column configuration used by Columns and saved views.
export function tableColumnDrag({ state, renderView }, fieldName) {
  let drag = null;
  let suppressClick = false;
  const headers = table => [...table.querySelectorAll("thead th[data-column-key]")];
  const announce = text => {
    const status = document.querySelector("[data-table-reorder-status]");
    if (status) status.textContent = text;
  };

  function move(key, beforeKey, scroll) {
    const columns = [...state.tableColumns];
    const index = columns.findIndex(c => c.key === key);
    if (index < 0) return;
    const [column] = columns.splice(index, 1);
    const before = columns.findIndex(c => c.key === beforeKey);
    columns.splice(before < 0 ? columns.length : before, 0, column);
    if (columns.every((c, i) => c === state.tableColumns[i])) return;
    state.tableColumns = columns;
    renderView(true);
    const scroller = document.querySelector(".spreadsheet")?.closest(".table-scroll");
    if (scroller) {
      scroller.scrollLeft = scroll.left;
      scroller.scrollTop = scroll.top;
    }
    document.querySelector(`[data-table-sort-column="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    const position = columns.filter(c => c.visible !== false).findIndex(c => c.key === key) + 1;
    announce(`${fieldName(key)} moved to column ${position}.`);
  }

  function paint() {
    const d = drag;
    if (!d?.active) return;
    const bounds = d.scroller.getBoundingClientRect();
    const top = Math.max(0, bounds.top), bottom = Math.min(innerHeight, bounds.bottom);
    const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
    d.valid = d.x >= left && d.x <= right && d.y >= top && d.y <= bottom;
    const remaining = headers(d.table).filter(h => h.dataset.columnKey !== d.key);
    const before = remaining.find(h => {
      const rect = h.getBoundingClientRect();
      return d.x < rect.left + rect.width / 2;
    });
    d.beforeKey = before?.dataset.columnKey ?? null;
    const markerX = before?.getBoundingClientRect().left ?? remaining.at(-1)?.getBoundingClientRect().right;
    d.marker.hidden = !d.valid || markerX == null || markerX < left || markerX > right;
    Object.assign(d.marker.style, {
      left: `${markerX}px`, top: `${top}px`, height: `${bottom - top}px`,
    });
    Object.assign(d.ghost.style, {
      left: `${Math.max(8, Math.min(innerWidth - d.ghost.offsetWidth - 8, d.x + 12))}px`,
      top: `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y + 16))}px`,
    });
    d.ghost.classList.toggle("invalid", !d.valid);
    if (d.valid && d.announced !== d.beforeKey) {
      d.announced = d.beforeKey;
      announce(`Move ${fieldName(d.key)} ${d.beforeKey ? `before ${fieldName(d.beforeKey)}` : "to the end"}.`);
    }
  }

  function frame(time) {
    const d = drag;
    if (!d?.active) return;
    if (!d.table.isConnected || state.view !== "table") return finish(false);
    const bounds = d.scroller.getBoundingClientRect();
    const left = Math.max(0, bounds.left), right = Math.min(innerWidth, bounds.right);
    const elapsed = Math.min(32, time - (d.time ?? time));
    d.time = time;
    if (d.valid) {
      const speed = d.x < left + 48 ? -Math.min(1, (left + 48 - d.x) / 48)
        : d.x > right - 48 ? Math.min(1, (d.x - right + 48) / 48) : 0;
      d.scroller.scrollLeft += speed * elapsed * 0.8;
    }
    paint();
    d.frame = requestAnimationFrame(frame);
  }

  function start() {
    const d = drag;
    d.active = true;
    suppressClick = true;
    d.table.classList.add("table-reordering");
    d.button.closest("th").classList.add("table-column-drag-source");
    document.body.classList.add("table-column-dragging");
    d.ghost = document.createElement("div");
    d.ghost.className = "table-column-drag-ghost";
    d.ghost.textContent = fieldName(d.key);
    d.ghost.setAttribute("aria-hidden", "true");
    d.marker = document.createElement("div");
    d.marker.className = "table-column-drop-marker";
    d.marker.setAttribute("aria-hidden", "true");
    document.body.append(d.ghost, d.marker);
    paint();
    d.frame = requestAnimationFrame(frame);
  }

  function finish(commit) {
    const d = drag;
    if (!d) return;
    drag = null;
    state.toolDragging = false;
    cancelAnimationFrame(d.frame);
    if (d.button.hasPointerCapture(d.id)) d.button.releasePointerCapture(d.id);
    d.table.classList.remove("table-reordering");
    d.button.closest("th").classList.remove("table-column-drag-source");
    document.body.classList.remove("table-column-dragging");
    d.ghost?.remove();
    d.marker?.remove();
    if (!d.active) return;
    suppressClick = true;
    if (commit && d.valid && d.table.isConnected && state.view === "table") {
      move(d.key, d.beforeKey, { left: d.scroller.scrollLeft, top: d.scroller.scrollTop });
    } else {
      d.scroller.scrollLeft = d.scroll.left;
      d.scroller.scrollTop = d.scroll.top;
      announce("Column move cancelled.");
    }
  }

  document.addEventListener("pointerdown", event => {
    suppressClick = false;
    if (drag) return finish(false); // A second finger cancels, rather than moving a column.
    const button = event.target.closest(".spreadsheet [data-table-sort-column]");
    if (!button || state.view !== "table" || state.dialog || state.toolDragging ||
        !event.isPrimary || event.button !== 0) return;
    const table = button.closest("table"), scroller = table.closest(".table-scroll");
    drag = {
      button, table, scroller, key: button.dataset.tableSortColumn, id: event.pointerId,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      threshold: event.pointerType === "touch" ? 8 : 6,
      scroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
    };
    state.toolDragging = true; // Prevent presence refreshes replacing the pointer target.
    button.setPointerCapture(event.pointerId);
  });
  document.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= drag.threshold) start();
    if (drag.active) {
      event.preventDefault();
      paint();
    }
  }, { passive: false });
  document.addEventListener("pointerup", event => {
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    paint();
    finish(true);
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    document.addEventListener(type, event => {
      if (drag?.id === event.pointerId) finish(false);
    });
  window.addEventListener("blur", () => finish(false));
  window.addEventListener("click", event => {
    if (!suppressClick || !event.detail) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener("dragstart", event => {
    if (drag) event.preventDefault();
  });
  document.addEventListener("keydown", event => {
    if (drag && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish(false);
      return;
    }
    const button = event.target.closest(".spreadsheet [data-table-sort-column]");
    if (!button || state.view !== "table" || state.dialog || !event.altKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const visible = state.tableColumns.filter(c => c.visible !== false);
    const key = button.dataset.tableSortColumn, index = visible.findIndex(c => c.key === key);
    if ((event.key === "ArrowLeft" && index === 0) ||
        (event.key === "ArrowRight" && index === visible.length - 1)) return;
    const before = event.key === "ArrowLeft" ? visible[index - 1].key : visible[index + 2]?.key;
    const scroller = button.closest(".table-scroll");
    move(key, before, { left: scroller.scrollLeft, top: scroller.scrollTop });
  }, true);
}
