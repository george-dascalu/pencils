import { gridReorderPreview } from "./grid-reorder.js";
import { mergedCell, mergeGrid, unmergeGrid } from "./grid-merge.js";
import {
  editGrid,
  gridTracks,
  resizeGrid,
  gridCSV,
  pasteGrid,
  syncGrid,
  cellAt,
  moveGridTrack,
  movedTrackIndex,
} from "./grid-model.js";
import { reflowGridContents } from "./frame-model.js";
const columnName = (index) =>
  index < 26
    ? String.fromCharCode(65 + index)
    : "A" + String.fromCharCode(65 + index - 26);
export function gridCell(state, n) {
  const s = state.gridCell;
  return s?.id === n.id && n.grid?.cells[s.row]?.[s.column]
    ? s
    : { id: n.id, row: 0, column: 0 };
}
export function selectedCells(state, n) {
  const s = gridCell(state, n),
    keys =
      state.gridSelection?.id === n.id
        ? state.gridSelection.cells
        : [`${s.row}:${s.column}`];
  const valid = keys
    .map((key) => key.split(":").map(Number))
    .filter(([r, c]) => n.grid.cells[r]?.[c]);
  return valid.length ? valid : [[s.row, s.column]];
}
export function gridHTML(n, { esc, markdown, state, icon }) {
  const g = n.grid,
    selected = new Set(selectedCells(state, n).map(([r, c]) => `${r}:${c}`));
  let x = 0,
    y = 24;
  const tracks = gridTracks(n);
  const handles =
    tracks.columns
      .map((w, i) => {
        x += w;
        return `<div class="grid-track-handle column ${i === tracks.columns.length - 1 ? "last-track" : ""}" data-grid-track="columns" data-track="${i}" style="left:${x}px" title="Resize column ${columnName(i)}"></div>`;
      })
      .join("") +
    tracks.rows
      .map((h, i) => {
        y += h;
        return `<div class="grid-track-handle row ${i === tracks.rows.length - 1 ? "last-track" : ""}" data-grid-track="rows" data-track="${i}" style="top:${y}px" title="Resize row ${i + 1}"></div>`;
      })
      .join("");
  const edges = ["left", "right", "top", "bottom"]
    .map(
      (edge) =>
        `<div class="grid-edge-handle ${edge}" data-grid-edge="${edge}" data-grid-track="${edge === "left" || edge === "right" ? "columns" : "rows"}" title="Resize all ${edge === "left" || edge === "right" ? "columns" : "rows"}"></div>`,
    )
    .join("");
  let hx = 0,
    hy = 24;
  const headers =
    tracks.columns
      .map((w, i) => {
        const left = hx;
        hx += w;
        return `<button class="grid-axis-label column" data-grid-axis="columns" data-track="${i}" style="left:${left}px;width:${w}px" aria-label="Select column ${columnName(i)}" aria-pressed="${tracks.rows.every((_, r) => selected.has(`${r}:${i}`))}" title="Drag to move column ${columnName(i)} · Alt + Left/Right to reorder"><span class="grid-axis-grip" aria-hidden="true">⠿</span><span>${columnName(i)}</span></button>`;
      })
      .join("") +
    tracks.rows
      .map((h, i) => {
        const top = hy;
        hy += h;
        return `<button class="grid-axis-label row" data-grid-axis="rows" data-track="${i}" style="top:${top}px;height:${h}px" aria-label="Select row ${i + 1}" aria-pressed="${tracks.columns.every((_, c) => selected.has(`${i}:${c}`))}" title="Drag to move row ${i + 1} · Alt + Up/Down to reorder"><span class="grid-axis-grip" aria-hidden="true">⠿</span><span>${i + 1}</span></button>`;
      })
      .join("");
  return `<div class="grid-grip" title="Drag to move grid · Double-click the title to edit"><span aria-hidden="true">⠿</span><span class="grid-title ${g.title ? "" : "is-placeholder"}" title="${esc(g.title || "Double-click to add a title")}">${esc(g.title || "Add a title…")}</span><button type="button" class="grid-title-edit" data-pro="grid-title" aria-label="Edit grid title" title="Edit grid title" ${n.locked ? "disabled" : ""}>${icon("pencil")}</button></div><div class="grid-cells" role="grid" aria-label="Board grid" aria-multiselectable="true" style="grid-template-columns:${g.columns.map((v) => `${v}fr`).join(" ")};grid-template-rows:${g.rows.map((v) => `${v}fr`).join(" ")}">${g.cells
    .map((row, r) =>
      row
        .map(
          (cell, c) =>
            `<div role="gridcell" aria-selected="${selected.has(`${r}:${c}`)}" tabindex="-1" aria-label="Row ${r + 1}, column ${c + 1}" data-grid-row="${r}" data-grid-column="${c}" class="grid-cell ${g.header && r === 0 ? "grid-header" : ""} ${selected.has(`${r}:${c}`) ? "active-cell" : ""}" style="${(() => {
              const m = mergedCell(g, r, c);
              return m
                ? m.row === r && m.column === c
                  ? `grid-row:${r + 1}/span ${m.rows};grid-column:${c + 1}/span ${m.columns};`
                  : "display:none;"
                : `grid-row:${r + 1};grid-column:${c + 1};`;
            })()}${cell.color || n.color ? `background:${esc(cell.color || n.color)};color:#263c34;` : ""}--node-text-align:${esc(cell.align || n.textAlign || "left")};text-align:${esc(cell.align || n.textAlign || "left")}"><div class="grid-cell-text canvas-markdown">${cell.text ? markdown(cell.text) : ""}</div></div>`,
        )
        .join(""),
    )
    .join(
      "",
    )}</div>${handles}${headers}${edges}<button class="grid-insert column" data-grid-action="columns:append" data-track-index="${g.columns.length - 1}" title="Add column" aria-label="Add column">+</button><button class="grid-insert row" data-grid-action="rows:append" data-track-index="${g.rows.length - 1}" title="Add row" aria-label="Add row">+</button>`;
}
export function updateGridControls(root, n) {
  if (!root) return;
  const tracks = gridTracks(n);
  for (const axis of ["columns", "rows"]) {
    let offset = axis === "rows" ? 24 : 0;
    tracks[axis].forEach((size, i) => {
      const label = root.querySelector(
          `[data-grid-axis="${axis}"][data-track="${i}"]`,
        ),
        handle = root.querySelector(
          `[data-grid-track="${axis}"][data-track="${i}"]`,
        ),
        position = axis === "columns" ? "left" : "top";
      if (label) {
        label.style[position] = `${offset}px`;
        label.style[axis === "columns" ? "width" : "height"] = `${size}px`;
      }
      offset += size;
      if (handle) handle.style[position] = `${offset}px`;
    });
  }
}
export function gridToolbar(n, state, { button, menu, group, icon }) {
  const s = gridCell(state, n),
    disabled = !!n.locked;
  const b = (axis, action, label, glyph) =>
    button(
      "grid-action",
      `${axis}:${action}`,
      label,
      glyph,
      disabled ||
        (action === "remove" && n.grid[axis].length === 1) ||
        (action === "add" && n.grid[axis].length >= 30) ||
        (action === "previous" && (axis === "rows" ? s.row : s.column) === 0) ||
        (action === "next" &&
          (axis === "rows" ? s.row : s.column) === n.grid[axis].length - 1),
    );
  return group(
    "Grid controls",
    `<span class="grid-cell-address" title="Selected cell">${selectedCells(state, n).length > 1 ? `${selectedCells(state, n).length} cells` : `${columnName(s.column)}${s.row + 1}`}</span>` +
      [
        ["rows", "row", "down"],
        ["columns", "column", "right"],
      ]
        .map(([axis, label, glyph]) =>
          menu(
            `grid-${axis}`,
            `${label[0].toUpperCase() + label.slice(1)} controls`,
            `${icon("table")}<span>${label === "row" ? "Rows" : "Columns"}</span>`,
            `<strong>${label === "row" ? `Row ${s.row + 1}` : `Column ${s.column + 1}`}</strong>${b(axis, "add", `Add ${label} after`, "plus")}${b(axis, "previous", `Move ${label} ${label === "row" ? "up" : "left"}`, "back")}${b(axis, "next", `Move ${label} ${label === "row" ? "down" : "right"}`, "front")}${b(axis, "remove", `Delete ${label}`, "trash")}`,
            disabled,
          ),
        )
        .join("") +
      button(
        "grid-action",
        "header",
        n.grid.header ? "Remove header styling" : "Style first row as header",
        "text",
        disabled,
      ) +
      menu(
        "grid-cells",
        "Cell controls",
        icon("table"),
        button(
          "grid-action",
          "merge",
          "Merge selected cells",
          "group",
          disabled || selectedCells(state, n).length < 2,
        ) +
          button(
            "grid-action",
            "unmerge",
            "Unmerge cells",
            "ungroup",
            disabled || !n.grid.merges?.length,
          ) +
          button(
            "grid-action",
            "fit",
            "Fit cells to content",
            "fit",
            disabled,
          ) +
          `<label class="field">Cell resizing<select data-grid-sizing aria-label="Cell resizing" ${disabled ? "disabled" : ""}><option value="auto" ${n.grid.resizeMode !== "manual" ? "selected" : ""}>Automatic</option><option value="manual" ${n.grid.resizeMode === "manual" ? "selected" : ""}>Manual</option></select></label><small>Track changes unmerge cells. Original cell text is retained.</small>`,
        disabled,
      ) +
      button("grid-action", "csv", "Export grid as CSV", "download"),
  );
}
export function boardGrid(ctx, basic) {
  const { state, board, $, changeBoard, renderView, toast } = ctx;
  const current = () =>
    basic.pick().length === 1 && basic.pick()[0].type === "grid"
      ? basic.pick()[0]
      : null;
  let drag = null;
  const key = (r, c) => `${r}:${c}`;
  function choose(
    n,
    row,
    column,
    keys = [key(row, column)],
    anchor = { row, column },
  ) {
    if (!keys.includes(key(row, column)))
      [row, column] = keys[0].split(":").map(Number);
    state.gridCell = { id: n.id, row, column };
    state.gridSelection = { id: n.id, cells: keys, anchor };
    document
      .querySelectorAll(`[data-node="${CSS.escape(n.id)}"] .grid-cell`)
      .forEach((el) => {
        const selected = keys.includes(
          key(+el.dataset.gridRow, +el.dataset.gridColumn),
        );
        el.classList.toggle("active-cell", selected);
        el.setAttribute("aria-selected", String(selected));
      });
    document
      .querySelectorAll(`[data-node="${CSS.escape(n.id)}"] [data-grid-axis]`)
      .forEach((el) => {
        const row = el.dataset.gridAxis === "rows",
          at = +el.dataset.track;
        const all = row
          ? n.grid.columns.every((_, c) => keys.includes(key(at, c)))
          : n.grid.rows.every((_, r) => keys.includes(key(r, at)));
        el.setAttribute("aria-pressed", String(all));
      });
    basic.selection();
  }
  const range = (a, b) => {
    const out = [];
    for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
      for (
        let c = Math.min(a.column, b.column);
        c <= Math.max(a.column, b.column);
        c++
      )
        out.push(key(r, c));
    return out;
  };
  function selectAxis(n, axis, at) {
    const keys = [];
    n.grid.cells.forEach((row, r) =>
      row.forEach((_, c) => {
        if ((axis === "rows" ? r : c) === at) keys.push(key(r, c));
      }),
    );
    choose(n, axis === "rows" ? at : 0, axis === "columns" ? at : 0, keys);
  }
  const consume = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        state.view !== "board" ||
        state.tool !== "cursor" ||
        e.button !== 0 ||
        state.canvasEditing
      )
        return;
      if (drag) {
        consume(e);
        return;
      }
      const el = e.target.closest(".board-node.grid"),
        n = board()?.nodes.find((n) => n.id === el?.dataset.node);
      if (!n || n.locked) return;
      if (current()?.id !== n.id) {
        if (
          e.shiftKey ||
          e.ctrlKey ||
          e.metaKey ||
          !e.target.closest(".grid-cell")
        )
          return;
        basic.select(n);
      }
      const handle = e.target.closest("[data-grid-track]"),
        axisLabel = e.target.closest("[data-grid-axis]"),
        cell = e.target.closest(".grid-cell");
      if (!handle && !axisLabel && !cell) return;
      consume(e);
      const common = {
        id: n.id,
        pointerId: e.pointerId,
        start: basic.point(e),
        before: ctx.boardSnapshot(),
      };
      if (handle) {
        drag = {
          ...common,
          type: "resize",
          axis: handle.dataset.gridTrack,
          at: +handle.dataset.track,
          edge: handle.dataset.gridEdge,
          original: structuredClone(n),
        };
        state.gridResizing = true;
        handle.classList.add("resizing");
        el.classList.add("grid-resizing");
      } else if (axisLabel) {
        const axis = axisLabel.dataset.gridAxis,
          at = +axisLabel.dataset.track;
        selectAxis(n, axis, at);
        axisLabel.focus({ preventScroll: true });
        drag = { ...common, type: "reorder", axis, at, to: at };
        state.toolDragging = true;
      } else {
        const row = +cell.dataset.gridRow,
          column = +cell.dataset.gridColumn;
        const anchor =
          e.shiftKey && state.gridSelection?.id === n.id
            ? state.gridSelection.anchor
            : { row, column };
        const keys =
          e.ctrlKey || e.metaKey
            ? new Set(selectedCells(state, n).map(([r, c]) => key(r, c)))
            : null;
        if (keys) {
          const k = key(row, column);
          keys.has(k) ? keys.delete(k) : keys.add(k);
          if (!keys.size) keys.add(k);
        }
        choose(
          n,
          row,
          column,
          keys ? [...keys] : range(anchor, { row, column }),
          anchor,
        );
        drag = {
          ...common,
          type: "select",
          anchor,
          add: keys ? [...keys] : null,
        };
        cell.focus({ preventScroll: true });
      }
      drag.capture = drag.type === "select" ? cell : $("#canvas");
      drag.capture.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      consume(e);
      const n = board()?.nodes.find((n) => n.id === drag.id);
      if (!n) return;
      const p = basic.point(e),
        hit = cellAt(n, p.x, p.y);
      if (drag.type === "select") {
        if (
          hit &&
          Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * state.camera.z >
            3
        )
          choose(
            n,
            hit.row,
            hit.column,
            [...new Set([...(drag.add || []), ...range(drag.anchor, hit)])],
            drag.anchor,
          );
        return;
      }
      if (drag.type === "reorder") {
        if (
          !drag.moved &&
          Math.hypot(p.x - drag.start.x, p.y - drag.start.y) * state.camera.z <
            5
        )
          return;
        drag.moved = true;
        drag.preview ||= gridReorderPreview(
          ctx,
          n,
          drag.axis,
          drag.at,
          drag.start,
        );
        drag.to = drag.preview.move(p, e);
        return;
      }
      const { axis, at, original, edge } = drag;
      const d = axis === "columns" ? p.x - drag.start.x : p.y - drag.start.y;
      resizeGrid(n, original, axis, at, d, edge, drag.before.nodes);
      reflowGridContents(board().nodes, n, drag.before.nodes);
      basic.moveDOM();
      let label = $(".grid-resize-dimensions");
      if (!label) {
        label = document.createElement("output");
        label.className = "resize-dimensions grid-resize-dimensions";
        label.setAttribute("aria-label", "Grid dimensions");
        $("#canvas").append(label);
      }
      const sizes = gridTracks(n)[axis];
      label.textContent = edge
        ? `${Math.round(n.w)} × ${Math.round(n.h)}`
        : `${axis === "columns" ? `Column ${columnName(at)}` : `Row ${at + 1}`} · ${Math.round(sizes[at])} px`;
      const canvas = $("#canvas"),
        rect = canvas.getBoundingClientRect();
      label.style.left = `${Math.max(8, Math.min(e.clientX - rect.left + 16, canvas.clientWidth - label.offsetWidth - 8))}px`;
      label.style.top = `${Math.max(8, Math.min(e.clientY - rect.top + 16, canvas.clientHeight - label.offsetHeight - 8))}px`;
      drag.moved = true;
    },
    true,
  );
  function finish(cancel = false) {
    if (!drag) return;
    const d = drag,
      n = board()?.nodes.find((n) => n.id === d.id);
    drag = null;
    state.gridResizing = false;
    if (d.type === "reorder") state.toolDragging = false;
    if (d.preview && !d.preview.valid) cancel = true;
    d.preview?.dispose();
    $(".grid-resize-dimensions")?.remove();
    if (d.capture?.hasPointerCapture(d.pointerId))
      d.capture.releasePointerCapture(d.pointerId);
    if (n && d.type !== "select") {
      if (cancel) Object.assign(board(), d.before);
      else if (d.moved && (d.type !== "reorder" || d.to !== d.at)) {
        if (d.type === "reorder") {
          moveGridTrack(n, d.axis, d.at, d.to);
          reflowGridContents(board().nodes, n, d.before.nodes, (c) => ({
            ...c,
            [d.axis === "rows" ? "row" : "column"]: movedTrackIndex(
              c[d.axis === "rows" ? "row" : "column"],
              d.at,
              d.to,
            ),
          }));
          selectAxis(n, d.axis, d.to);
        } else reflowGridContents(board().nodes, n, d.before.nodes);
        ctx.remember(d.before);
        ctx.saveBoard();
      }
      renderView();
      if (d.type === "reorder")
        requestAnimationFrame(() => {
          $(
            `[data-node="${CSS.escape(n.id)}"] [data-grid-axis="${d.axis}"][data-track="${cancel ? d.at : d.to}"]`,
          )?.focus({ preventScroll: true });
        });
    }
  }
  document.addEventListener(
    "pointerup",
    (e) => {
      if (drag && e.pointerId === drag.pointerId) {
        consume(e);
        if (drag.preview) drag.to = drag.preview.move(basic.point(e), e);
        finish();
      }
    },
    true,
  );
  document.addEventListener(
    "pointercancel",
    (e) => {
      if (drag && e.pointerId === drag.pointerId) finish(true);
    },
    true,
  );
  document.addEventListener(
    "lostpointercapture",
    (e) => {
      if (drag && e.pointerId === drag.pointerId) finish(true);
    },
    true,
  );
  window.addEventListener("blur", () => finish(true));
  document.addEventListener(
    "click",
    (e) => {
      const action = e.target.closest("[data-grid-action]");
      if (!action || action.disabled) return;
      const n = current();
      if (!n) return;
      const s = gridCell(state, n),
        key = action.dataset.gridAction;
      if (key === "csv") {
        basic.saveFile("grid.csv", gridCSV(n.grid), "text/csv;charset=utf-8");
        return;
      }
      if (n.locked) return;
      try {
        const before = structuredClone(board().nodes),
          updated = structuredClone(n);
        let next = s,
          map = (c) => c;
        if (key === "header") updated.grid.header = !updated.grid.header;
        else if (key === "merge")
          mergeGrid(updated.grid, selectedCells(state, n));
        else if (key === "unmerge")
          unmergeGrid(updated.grid, selectedCells(state, n));
        else if (key === "fit") {
          const tracks = gridTracks(updated),
            measure = document.createElement("canvas").getContext("2d");
          updated.grid.cells.forEach((row, r) =>
            row.forEach((cell, c) => {
              measure.font = `${cell.fontSize || updated.fontSize || 14}px ${cell.fontFamily || "sans-serif"}`;
              const lines = cell.text.split("\n");
              tracks.columns[c] = Math.max(
                tracks.columns[c],
                Math.min(
                  800,
                  Math.max(
                    ...lines.map(
                      (line) => measure.measureText(line).width + 32,
                    ),
                  ),
                ),
              );
              tracks.rows[r] = Math.max(
                tracks.rows[r],
                32 +
                  lines.reduce(
                    (total, line) =>
                      total +
                      Math.max(
                        1,
                        Math.ceil(
                          measure.measureText(line).width /
                            (tracks.columns[c] - 32),
                        ),
                      ),
                    0,
                  ) *
                    (cell.fontSize || updated.fontSize || 14) *
                    1.5,
              );
            }),
          );
          updated.grid.columns = tracks.columns;
          updated.grid.rows = tracks.rows;
          updated.w = tracks.columns.reduce((a, b) => a + b, 0);
          updated.h = 24 + tracks.rows.reduce((a, b) => a + b, 0);
        } else {
          const [axis, operation] = key.split(":"),
            op = operation === "append" ? "add" : operation,
            coord = axis === "rows" ? "row" : "column",
            at =
              action.dataset.trackIndex == null
                ? s[coord]
                : +action.dataset.trackIndex;
          const to = editGrid(updated, axis, op, at);
          next = {
            ...s,
            [coord]: Math.min(updated.grid[axis].length - 1, to ?? at),
          };
          map = (c) =>
            op === "remove"
              ? c[coord] === at
                ? null
                : { ...c, [coord]: c[coord] - (c[coord] > at ? 1 : 0) }
              : op === "add"
                ? { ...c, [coord]: c[coord] + (c[coord] > at ? 1 : 0) }
                : { ...c, [coord]: movedTrackIndex(c[coord], at, to ?? at) };
        }
        syncGrid(updated);
        if (updated.w > 100000 || updated.h > 100000)
          throw Error("Resize the grid smaller before adding more tracks.");
        changeBoard(() => {
          Object.assign(n, updated);
          reflowGridContents(board().nodes, n, before, map);
          state.gridCell = next;
          state.gridSelection = null;
        });
      } catch (err) {
        toast(err.message, true);
      }
    },
    true,
  );
  document.addEventListener("change", (e) => {
    if (!e.target.matches("[data-grid-sizing]")) return;
    const n = current();
    if (!n || n.locked) return;
    changeBoard(() => (n.grid.resizeMode = e.target.value));
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        consume(e);
        finish(true);
        return;
      }
      const cell = e.target.closest(".grid-cell,[data-grid-axis]"),
        n = current();
      if (!cell || !n || state.canvasEditing || n.locked) return;
      const axisLabel = e.target.closest("[data-grid-axis]");
      if (
        axisLabel &&
        e.altKey &&
        !e.shiftKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        consume(e);
        const axis = axisLabel.dataset.gridAxis,
          at = +axisLabel.dataset.track;
        const keys =
          axis === "columns"
            ? ["ArrowLeft", "ArrowRight"]
            : ["ArrowUp", "ArrowDown"];
        if (!keys.includes(e.key)) return;
        const to = at + (e.key === keys[0] ? -1 : 1);
        if (to < 0 || to >= n.grid[axis].length) return;
        const before = structuredClone(board().nodes);
        changeBoard(() => {
          moveGridTrack(n, axis, at, to);
          reflowGridContents(board().nodes, n, before, (c) => ({
            ...c,
            [axis === "rows" ? "row" : "column"]: movedTrackIndex(
              c[axis === "rows" ? "row" : "column"],
              at,
              to,
            ),
          }));
          selectAxis(n, axis, to);
        });
        $(
          `[data-node="${CSS.escape(n.id)}"] [data-grid-axis="${axis}"][data-track="${to}"]`,
        )?.focus({ preventScroll: true });
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "v", "x"].includes(e.key.toLowerCase())
      ) {
        e.stopImmediatePropagation();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        consume(e);
        choose(
          n,
          0,
          0,
          range(
            { row: 0, column: 0 },
            { row: n.grid.rows.length - 1, column: n.grid.columns.length - 1 },
          ),
        );
        return;
      }
      const s = gridCell(state, n),
        moves = {
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
          Tab: [0, e.shiftKey ? -1 : 1],
        };
      if (moves[e.key]) {
        consume(e);
        let [r, c] = [s.row + moves[e.key][0], s.column + moves[e.key][1]];
        if (e.key === "Tab") {
          if (c >= n.grid.columns.length) {
            c = 0;
            r++;
          }
          if (c < 0) {
            c = n.grid.columns.length - 1;
            r--;
          }
        }
        r = Math.max(0, Math.min(n.grid.rows.length - 1, r));
        c = Math.max(0, Math.min(n.grid.columns.length - 1, c));
        const anchor = state.gridSelection?.anchor || s;
        choose(
          n,
          r,
          c,
          e.shiftKey && e.key !== "Tab"
            ? range(anchor, { row: r, column: c })
            : undefined,
          e.shiftKey ? anchor : undefined,
        );
        $(
          `[data-node="${CSS.escape(n.id)}"] [data-grid-row="${r}"][data-grid-column="${c}"]`,
        )?.focus({ preventScroll: true });
      } else if (e.key === "Enter") {
        consume(e);
        basic.edit();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        consume(e);
        changeBoard(() => {
          selectedCells(state, n).forEach(
            ([r, c]) => (n.grid.cells[r][c].text = ""),
          );
          syncGrid(n);
        });
      }
    },
    true,
  );
  for (const type of ["copy", "cut"])
    document.addEventListener(
      type,
      (e) => {
        const n = current();
        if (
          !n ||
          state.canvasEditing ||
          !e.target.closest(".grid-cell,[data-grid-axis]")
        )
          return;
        consume(e);
        const cells = selectedCells(state, n),
          keys = new Set(cells.map(([r, c]) => key(r, c))),
          rs = cells.map((c) => c[0]),
          cs = cells.map((c) => c[1]),
          lines = [];
        for (let r = Math.min(...rs); r <= Math.max(...rs); r++) {
          const line = [];
          for (let c = Math.min(...cs); c <= Math.max(...cs); c++) {
            const text = keys.has(key(r, c)) ? n.grid.cells[r][c].text : "";
            line.push(
              /[\t\n"]/.test(text)
                ? '"' + text.replaceAll('"', '""') + '"'
                : text,
            );
          }
          lines.push(line.join("\t"));
        }
        e.clipboardData.setData("text/plain", lines.join("\n"));
        if (type === "cut" && !n.locked)
          changeBoard(() => {
            cells.forEach(([r, c]) => (n.grid.cells[r][c].text = ""));
            syncGrid(n);
          });
      },
      true,
    );
  document.addEventListener(
    "paste",
    (e) => {
      const n = current();
      if (
        !n ||
        n.locked ||
        state.canvasEditing ||
        !e.target.closest(".grid-cell")
      )
        return;
      consume(e);
      const s = gridCell(state, n);
      try {
        const copy = structuredClone(n),
          before = structuredClone(board().nodes);
        pasteGrid(copy, e.clipboardData.getData("text/plain"), s.row, s.column);
        changeBoard(() => {
          Object.assign(n, copy);
          reflowGridContents(board().nodes, n, before);
        });
      } catch (err) {
        toast(err.message, true);
      }
    },
    true,
  );
}
