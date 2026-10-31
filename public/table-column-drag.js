// Reordering shares the column configuration used by Columns.
export function tableColumnDrag({ state, renderView }, fieldName) {
  let drag = null;
  let suppressClick = false;
  const headers = table => [...table.querySelectorAll("thead th[data-column-key]")];
  const keyFor = button => button.dataset.columnDrag || button.dataset.tableSortColumn;
  const controlSelector = ".spreadsheet :is([data-column-drag], [data-table-sort-column])";
  const announce = text => {
    const status = document.querySelector("[data-table-reorder-status]");
    if (status) status.textContent = text;
  };

  function move(key, beforeKey, scroll, grip = false) {
    const columns = [...state.tableColumns];
    const index = columns.findIndex(c => c.key === key);
    if (index < 0) return;
    const [column] = columns.splice(index, 1);
    const before = columns.findIndex(c => c.key === beforeKey);
    columns.splice(before < 0 ? columns.length : before, 0, column);
    const visible = columns.filter(c => c.visible !== false);
    const previous = state.tableColumns.filter(c => c.visible !== false);
    const changed = visible.some((c, i) => c.key !== previous[i].key);
    // Dropping back in the same visible slot must not move hidden fields.
    if (changed) {
      state.tableColumns = columns;
      renderView(true);
    }
    const scroller = document.querySelector(".spreadsheet")?.closest(".table-scroll");
    if (scroller) {
      scroller.scrollLeft = scroll.left;
      scroller.scrollTop = scroll.top;
    }
    const button = document.querySelector(`[${grip ? "data-column-drag" : "data-table-sort-column"}="${CSS.escape(key)}"]`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const position = visible.findIndex(c => c.key === key) + 1;
    announce(`${fieldName(key)} ${changed ? "moved to" : "kept at"} column ${position}.`);
  }

  function bounds(d) {
    const rect = d.scroller.getBoundingClientRect();
    return {
      top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom),
      left: Math.max(0, rect.left), right: Math.min(innerWidth, rect.right),
    };
  }
  function paint() {
    const d = drag;
    if (!d?.active) return;
    const { top, bottom, left, right } = bounds(d);
    d.valid = d.x >= left && d.x <= right && d.y >= top && d.y <= bottom;
    const remaining = headers(d.table).filter(h => h.dataset.columnKey !== d.key);
    const before = remaining.find(h => {
      const rect = h.getBoundingClientRect();
      return d.x < rect.left + rect.width / 2;
    });
    d.beforeKey = before?.dataset.columnKey ?? null;
    const index = before ? remaining.indexOf(before) : remaining.length;
    const unchanged = index === d.index;
    const markerX = before?.getBoundingClientRect().left ?? remaining.at(-1)?.getBoundingClientRect().right;
    d.marker.hidden = !d.valid || unchanged || markerX == null;
    Object.assign(d.marker.style, {
      left: `${Math.max(left + 2, Math.min(right - 2, markerX))}px`,
      top: `${top}px`, height: `${bottom - top}px`,
    });
    const ghostWidth = d.ghost.offsetWidth;
    const ghostX = d.x + 16 + ghostWidth < innerWidth - 8 ? d.x + 16 : d.x - ghostWidth - 16;
    Object.assign(d.ghost.style, {
      left: `${Math.max(8, Math.min(innerWidth - ghostWidth - 8, ghostX))}px`,
      top: `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y + 16))}px`,
    });
    d.ghost.classList.toggle("invalid", !d.valid);
    const placement = !d.valid ? "Outside table · release to cancel"
      : unchanged ? "Keep current position"
      : d.beforeKey ? `Before ${fieldName(d.beforeKey)}` : "After the last column";
    if (d.announced !== placement) {
      d.announced = placement;
      d.placement.textContent = placement;
      announce(`${fieldName(d.key)}: ${placement}. Column ${index + 1} of ${remaining.length + 1}.`);
    }
  }

  function frame(time) {
    const d = drag;
    if (!d?.active) return;
    if (!d.table.isConnected || state.view !== "table") return finish(false);
    const { left, right, top, bottom } = bounds(d);
    const elapsed = Math.min(32, time - (d.time ?? time));
    d.time = time;
    // A small overshoot still scrolls, but dropping outside always cancels.
    if (d.y >= top && d.y <= bottom && d.x >= left - 24 && d.x <= right + 24) {
      const zone = Math.min(64, (right - left) / 4);
      const speed = d.x < left + zone ? -Math.min(1, (left + zone - d.x) / zone)
        : d.x > right - zone ? Math.min(1, (d.x - right + zone) / zone) : 0;
      d.scroller.scrollLeft += speed * Math.abs(speed) * elapsed * 1.1;
    }
    paint();
    d.frame = requestAnimationFrame(frame);
  }

  function start() {
    const d = drag;
    d.active = true;
    suppressClick = true;
    d.index = headers(d.table).findIndex(h => h.dataset.columnKey === d.key);
    d.table.classList.add("table-reordering");
    d.source = [...d.table.querySelectorAll(`[data-column-key="${CSS.escape(d.key)}"]`)];
    d.source.forEach(cell => cell.classList.add("table-column-drag-source"));
    document.body.classList.add("table-column-dragging");
    d.ghost = document.createElement("div");
    d.ghost.className = "table-column-drag-ghost";
    d.ghost.style.width = `${Math.min(280, Math.max(144, d.button.closest("th").offsetWidth))}px`;
    const heading = document.createElement("strong");
    heading.textContent = fieldName(d.key);
    d.placement = document.createElement("small");
    d.ghost.append(heading, d.placement);
    // Preview a few actual values without duplicating interactive controls or IDs.
    for (const cell of d.source.filter(cell => cell.matches("td")).slice(0, 3)) {
      const sample = document.createElement("div");
      sample.className = "table-column-drag-sample";
      const value = cell.querySelector(".table-cell-value, .table-cell-readonly");
      if (value) sample.append(value.cloneNode(true));
      else sample.textContent = cell.querySelector("input")?.value || cell.textContent.trim() || "—";
      const colored = cell.querySelector("[data-task-color]");
      if (colored) {
        const css = getComputedStyle(colored);
        sample.style.background = css.backgroundColor;
        sample.style.color = css.color;
      }
      d.ghost.append(sample);
    }
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
    d.source?.forEach(cell => cell.classList.remove("table-column-drag-source"));
    document.body.classList.remove("table-column-dragging");
    d.ghost?.remove();
    d.marker?.remove();
    if (!d.active) return;
    suppressClick = true;
    if (commit && d.valid && d.table.isConnected && state.view === "table") {
      move(d.key, d.beforeKey, { left: d.scroller.scrollLeft, top: d.scroller.scrollTop }, d.grip);
    } else {
      d.scroller.scrollLeft = d.scroll.left;
      d.scroller.scrollTop = d.scroll.top;
      if (d.button.isConnected) d.button.focus({ preventScroll: true });
      announce("Column move cancelled.");
    }
  }

  document.addEventListener("pointerdown", event => {
    suppressClick = false;
    if (drag) return finish(false); // A second finger cancels, rather than moving a column.
    const button = event.target.closest(controlSelector);
    if (!button || state.view !== "table" || state.dialog || state.toolDragging ||
        !event.isPrimary || event.button !== 0) return;
    const grip = button.hasAttribute("data-column-drag");
    // Header labels remain available for touch scrolling and taps to sort.
    if (event.pointerType === "touch" && !grip) return;
    const table = button.closest("table"), scroller = table.closest(".table-scroll");
    drag = {
      button, table, scroller, grip, key: keyFor(button), id: event.pointerId,
      x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      threshold: event.pointerType === "touch" ? 8 : 6,
      scroll: { left: scroller.scrollLeft, top: scroller.scrollTop },
    };
    state.toolDragging = true; // Prevent presence refreshes replacing the pointer target.
    button.focus({ preventScroll: true });
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
    const button = event.target.closest(controlSelector);
    if (!button || state.view !== "table" || state.dialog || !event.altKey ||
        !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const visible = state.tableColumns.filter(c => c.visible !== false);
    const key = keyFor(button), index = visible.findIndex(c => c.key === key);
    if ((event.key === "ArrowLeft" && index === 0) ||
        (event.key === "ArrowRight" && index === visible.length - 1)) return;
    const before = event.key === "ArrowLeft" ? visible[index - 1].key : visible[index + 2]?.key;
    const scroller = button.closest(".table-scroll");
    move(key, before, { left: scroller.scrollLeft, top: scroller.scrollTop }, button.hasAttribute("data-column-drag"));
  }, true);
}
