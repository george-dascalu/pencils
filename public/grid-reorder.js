import { gridTracks, movedTrackIndex } from "./grid-model.js";
import { withFrameContents } from "./frame-model.js";

// Compare the lifted track's centre with its neighbours, independent of zoom
// and where on the handle the user grabbed it.
export function trackDropIndex(sizes, from, delta) {
  const start = sizes.slice(0, from).reduce((a, b) => a + b, 0);
  const centre = start + sizes[from] / 2 + delta;
  let offset = 0,
    to = 0;
  sizes.forEach((size, i) => {
    if (i !== from && centre >= offset + size / 2) to++;
    offset += size;
  });
  return to;
}

export function gridReorderPreview(ctx, n, axis, from, start) {
  const { $, state, board } = ctx;
  const root = $(`[data-node="${CSS.escape(n.id)}"]`),
    canvas = $("#canvas");
  const horizontal = axis === "columns",
    sizes = gridTracks(n)[axis];
  const offsets = sizes.map((_, i) =>
    sizes.slice(0, i).reduce((a, b) => a + b, 0),
  );
  const origin = {
    x: n.x + (horizontal ? offsets[from] : 0),
    y: n.y + 24 + (horizontal ? 0 : offsets[from]),
  };
  const width = horizontal ? sizes[from] : n.w,
    height = horizontal ? n.h - 24 : sizes[from];
  const ghost = document.createElement("div");
  ghost.className = "grid-drag-preview";
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    width: `${width}px`,
    height: `${height}px`,
  });
  const cells = root.querySelector(".grid-cells").cloneNode(true);
  Object.assign(cells.style, {
    position: "absolute",
    left: `${horizontal ? -offsets[from] : 0}px`,
    top: `${horizontal ? 0 : -offsets[from]}px`,
    width: `${n.w}px`,
    height: `${n.h - 24}px`,
  });
  cells
    .querySelectorAll(".active-cell")
    .forEach((el) => el.classList.remove("active-cell"));
  ghost.append(cells);
  const items = [];
  const register = (el, index) => {
    if (!el) return;
    items.push({
      el,
      index,
      translate: el.style.translate,
      transition: el.style.transition,
      opacity: el.style.opacity,
    });
    el.classList.add("grid-reorder-item");
    if (index === from) el.style.opacity = ".16";
  };
  root
    .querySelectorAll(".grid-cell")
    .forEach((el) =>
      register(
        el,
        Number(horizontal ? el.dataset.gridColumn : el.dataset.gridRow),
      ),
    );
  for (const child of board().nodes.filter(
    (child) => child.frame === n.id && child.gridCell,
  )) {
    const index = child.gridCell[horizontal ? "column" : "row"];
    for (const nested of withFrameContents(board().nodes, [child])) {
      const el = $(`[data-node="${CSS.escape(nested.id)}"]`);
      if (index === from && el) {
        const copy = el.cloneNode(true);
        copy.classList.remove("selected");
        copy
          .querySelectorAll(
            ".resize-handle,.connection-port,.grid-axis-label,.grid-track-handle,.grid-edge-handle,.grid-insert",
          )
          .forEach((el) => el.remove());
        Object.assign(copy.style, {
          left: `${nested.x - origin.x}px`,
          top: `${nested.y - origin.y}px`,
          margin: "0",
        });
        ghost.append(copy);
      }
      register(el, index);
    }
  }
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  // Preview nodes must not be mistaken for live board objects by other tools.
  ghost
    .querySelectorAll("[data-node]")
    .forEach((el) => el.removeAttribute("data-node"));
  $("#canvas-world").append(ghost);
  const gap = document.createElement("div");
  gap.className = `grid-reorder-marker grid-reorder-gap ${axis}`;
  Object.assign(gap.style, { width: `${width}px`, height: `${height}px` });
  root.append(gap);
  const status = document.createElement("output");
  status.className = "grid-drag-status";
  status.setAttribute("aria-live", "polite");
  canvas.append(status);
  canvas.classList.add("grid-reordering");
  root.classList.add("grid-reorder-source");
  let frame = 0,
    latest,
    to = from,
    valid = true;
  const name = (i) =>
    horizontal
      ? `Column ${i < 26 ? String.fromCharCode(65 + i) : "A" + String.fromCharCode(65 + i - 26)}`
      : `Row ${i + 1}`;
  function paint() {
    frame = 0;
    if (!latest) return;
    const { delta, clientX, clientY } = latest;
    const order = sizes.map((_, i) => i);
    order.splice(to, 0, order.splice(from, 1)[0]);
    const positions = order.map((_, i) =>
      order.slice(0, i).reduce((sum, index) => sum + sizes[index], 0),
    );
    for (const { el, index } of items) {
      const shift =
        index === from
          ? 0
          : positions[movedTrackIndex(index, from, to)] - offsets[index];
      el.style.translate = horizontal ? `${shift}px 0` : `0 ${shift}px`;
    }
    ghost.style.translate = horizontal
      ? `${delta}px ${-6 / state.camera.z}px`
      : `${6 / state.camera.z}px ${delta}px`;
    ghost.classList.toggle("invalid", !valid);
    gap.hidden = !valid;
    gap.style.left = `${horizontal ? positions[to] : 0}px`;
    gap.style.top = `${24 + (horizontal ? 0 : positions[to])}px`;
    const text = !valid
      ? "Release outside to cancel"
      : to === from
        ? `${name(from)} · Drag to reorder`
        : `${name(from)} → ${name(to)} · Release to move`;
    if (status.textContent !== text) status.textContent = text;
    const rect = canvas.getBoundingClientRect();
    status.style.left = `${Math.max(8, Math.min(clientX - rect.left + 18, canvas.clientWidth - status.offsetWidth - 8))}px`;
    status.style.top = `${Math.max(8, Math.min(clientY - rect.top + 20, canvas.clientHeight - status.offsetHeight - 8))}px`;
  }
  return {
    move(p, event) {
      const delta = horizontal ? p.x - start.x : p.y - start.y;
      const rect = canvas.getBoundingClientRect();
      valid =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      to = valid ? trackDropIndex(sizes, from, delta) : from;
      latest = { delta, clientX: event.clientX, clientY: event.clientY };
      if (!frame) frame = requestAnimationFrame(paint);
      return to;
    },
    get valid() {
      return valid;
    },
    dispose() {
      cancelAnimationFrame(frame);
      for (const { el, translate, transition, opacity } of items) {
        el.classList.remove("grid-reorder-item");
        Object.assign(el.style, { translate, transition, opacity });
      }
      ghost.remove();
      gap.remove();
      status.remove();
      root.classList.remove("grid-reorder-source");
      canvas.classList.remove("grid-reordering");
    },
  };
}
