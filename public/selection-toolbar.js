import { objectGeometryControls } from "./object-geometry.js";
import { textStyleControls } from "./object-text.js";
import { setStrokeWidth } from "./pen-model.js";
import {
  gridToolbar,
  gridCell,
  selectedCells,
  gridSelectionLabel,
} from "./board-grid.js";
import { framePresets, frameContents, frameSlides } from "./frame-model.js";
import {
  textAlignment,
  textAlignments,
  alignmentButtons,
} from "./text-alignment.js";
import { isTaskNote, nodeFill } from "./node-layout.js";
import { selectionFilter } from "./selection-filter.js";
import { connectorToolbar } from "./connector-toolbar.js";
// Shared, selection-aware controls; existing action handlers own edits and undo.
export function selectionToolbar(
  ctx,
  pick,
  replaceSelection,
  pickAll = pick,
  pickEdges = () => [],
) {
  const { $, esc, icon, state, changeBoard } = ctx;
  const filter = selectionFilter(ctx, pickAll, replaceSelection);
  const edge = () =>
    ctx.board()?.edges.find((e) => e.id === state.selectedEdge);
  let menuKey = null,
    selectionKey = "";
  function button(kind, key, label, glyph, disabled = false, extra = "") {
    const shortcut = {
      inline: "Enter",
      "zoom-selection": "Alt / Option + 2",
      duplicate: "Ctrl / ⌘ + D",
      group: "Ctrl / ⌘ + G",
      ungroup: "Ctrl / ⌘ + Shift + G",
      lock: "Ctrl / ⌘ + Shift + L",
      "selection-delete": "Delete",
    }[key];
    return `<button type="button" class="selection-action" data-${kind}="${key}" aria-label="${esc(label)}" title="${esc(label + (shortcut ? ` (${shortcut})` : ""))}" ${disabled ? "disabled" : ""} ${extra}>${icon(glyph)}<span class="selection-action-label">${esc(label)}</span></button>`;
  }
  function menu(key, label, glyph, body, disabled = false) {
    return `<details class="selection-menu" data-selection-menu="${key}"><summary aria-label="${label}" title="${label}" ${disabled ? 'aria-disabled="true"' : ""}>${glyph}${icon("chevron")}</summary><div class="selection-popover" role="group" aria-label="${label}">${body}</div></details>`;
  }
  const group = (name, body) =>
    `<div class="selection-group" role="group" aria-label="${name}">${body}</div>`;
  function html() {
    const arrows = pickEdges();
    if (arrows.length && !pick().length)
      return connectorToolbar(ctx, arrows[0], {
        menu,
        group,
        button,
        count: arrows.length,
        filter: filter.html(menu),
      });
    if (arrows.length)
      return `<div id="selection-tools" class="selection-tools" role="toolbar" aria-label="Selected objects">${group("Selection", filter.html(menu) || `<span>${pickAll().length} selected</span>`)}${group("Object actions", button("feature", "duplicate", "Duplicate", "duplicate") + button("feature", "selection-delete", "Delete", "trash"))}</div>`;
    const nodes = pick(),
      n = nodes[0],
      single = nodes.length === 1;
    const locked = nodes.every((n) => n.locked),
      editable = nodes.filter((n) => !n.locked);
    const pro = (key, label, glyph, disabled = false) =>
      button("pro", key, label, glyph, disabled);
    const feature = (key, label, glyph, disabled = false, extra = "") =>
      button("feature", key, label, glyph, disabled, extra);
    const cell =
      single && n.type === "grid"
        ? n.grid.cells[gridCell(state, n).row][gridCell(state, n).column]
        : null;
    const fill = cell?.color || nodeFill(n);
    const mixed = cell
      ? selectedCells(state, n).some(
          ([r, c]) => (n.grid.cells[r][c].color || nodeFill(n)) !== fill,
        )
      : nodes.some((node) => nodeFill(node) !== fill);
    const color =
      ctx.colorPicker({
        value: fill,
        label: cell ? "Cell colour" : "Object colour",
        mixed,
        disabled: locked,
        selection: true,
      }) +
      (single && n.type === "grid"
        ? ctx.colorPicker({
            value: n.color || "#ffffff",
            label: "Grid background",
            name: "grid-background",
            menuKey: "grid-background",
            disabled: locked,
          })
        : "");
    const alignment = cell?.align || textAlignment(n);
    const textMenu = menu(
      "text-align",
      cell ? "Text formatting" : "Text alignment",
      icon(cell ? "text" : `text-${alignment}`),
      (cell
        ? `<strong>${gridSelectionLabel(state, n)} · ${selectedCells(state, n).length} cells</strong>`
        : "") +
        alignmentButtons(
          icon,
          (
            cell
              ? selectedCells(state, n).every(
                  ([r, c]) =>
                    (n.grid.cells[r][c].align || textAlignment(n)) ===
                    alignment,
                )
              : nodes.every((node) => textAlignment(node) === alignment)
          )
            ? alignment
            : null,
          locked,
        ) +
        textStyleControls(n, { ...ctx, textNodes: nodes }) +
        '<div class="text-format-actions" role="group" aria-label="Formatting clipboard">' +
        button("object-style", "copy", "Copy formatting", "duplicate") +
        button("object-style", "paste", "Paste formatting", "pencil", locked) +
        "</div>",
      locked,
    );
    const arrange = menu(
      "arrange",
      "Arrange objects",
      icon("arrange"),
      `<button type="button" data-layout-tool="match-width">Match width</button><button type="button" data-layout-tool="match-height">Match height</button><label class="field">Tidy columns<input id="tidy-columns" type="number" min="1" max="20" value="3"></label><label class="field">Gap<input id="tidy-gap" type="number" min="0" max="1000" value="24"></label><button type="button" data-layout-tool="tidy">Tidy selection</button><hr><strong>Align</strong><div class="selection-align-grid">${[
        ["align-left", "Align left", "align-left"],
        ["align-center", "Align centres horizontally", "align-center"],
        ["align-right", "Align right", "align-right"],
        ["align-top", "Align top", "align-top"],
        ["align-middle", "Align centres vertically", "align-middle"],
        ["align-bottom", "Align bottom", "align-bottom"],
      ]
        .map(([key, label, glyph]) =>
          feature(key, label, glyph, nodes.length < 2 || locked),
        )
        .join(
          "",
        )}</div>${feature("distribute", "Space evenly horizontally", "distribute", editable.length < 3)}${feature("distribute-vertical", "Space evenly vertically", "distribute-vertical", editable.length < 3)}<hr>${feature("group", "Group", "group", nodes.length < 2 || locked)}${feature("ungroup", "Ungroup", "ungroup", !nodes.some((n) => n.group && !n.locked))}${feature("frame-selection", "Create frame around selection", "frame", locked)}${feature("frames-pdf", "Export selected frames as PDF", "file", !nodes.some((n) => n.type === "frame"))}`,
    );
    const extraActions =
      single && n.type === "query"
        ? pro("query-edit", "Edit live task view", "table", locked)
        : "";
    const more = extraActions
      ? menu("more", "More object actions", icon("more"), extraActions)
      : "";
    const contents =
      single && n.type === "frame" ? frameContents(ctx.board().nodes, n) : [];
    const frameTools =
      single && n.type === "frame"
        ? group(
            "Frame controls",
            pro("frame-link", "Copy frame link", "connect") +
              menu(
                "frame-size",
                "Frame size",
                icon("frame"),
                `<strong>${Math.round(n.w)} × ${Math.round(n.h)}</strong>${framePresets.map((p) => feature("frame-preset", p.label, "frame", locked, `data-preset="${p.id}"`)).join("")}`,
                locked,
              ) +
              feature(
                "frame-fit",
                "Fit frame to contents",
                "fit",
                locked || !contents.length,
              ) +
              feature(
                "frame-contents",
                "Select frame contents",
                "group",
                !contents.length,
              ) +
              pro(
                "collapse",
                n.collapsed ? "Expand frame" : "Collapse frame",
                n.collapsed ? "plus" : "minus",
                locked,
              ) +
              pro(
                "frame-present",
                "Present from this frame",
                "play",
                !frameSlides(ctx.board()).includes(n.id),
              ),
          )
        : "";
    const note = n.type === "sticky" || n.displayAs === "note";
    const filterMenu = filter.html(menu);
    const kind =
      single && ["sticky", "task", "draft"].includes(n.type)
        ? menu(
            "convert",
            "Convert " +
              (n.type === "draft" ? "Draft task" : note ? "Note" : "Task"),
            `${icon(n.type === "draft" ? "pencil" : note ? "sticky" : "task")}<span>${n.type === "draft" ? "Draft task" : note ? "Note" : "Task"}</span>`,
            `${pro("convert", n.type === "draft" ? "Finalise task" : n.type === "sticky" ? "Draft task" : "Task", "task", locked || (!note && n.type !== "draft"))}${pro("convert-note", "Note", "sticky", locked || note)}<p class="conversion-hint">${n.type === "draft" ? "Finalise this draft to create a project task and assign its ID." : n.type === "sticky" ? "Turn this note into a draft task. Finalise it when ready." : "Task details stay linked when shown as a note."}</p>`,
            locked,
          )
        : `<span class="selection-kind" title="${nodes.length} selected">${icon(single ? { grid: "table", frame: "frame", query: "table", draw: "pencil", image: "image" }[n.type] || n.type : "group")}<span>${single ? esc((n.projectFrame ? "Project frame" : { sticky: "Note", query: "Live view", draw: "Drawing" }[n.type] || n.type).replace(/^./, (c) => c.toUpperCase())) : `${nodes.length} objects`}</span></span>`;
    return `<div id="selection-tools" class="selection-tools" role="toolbar" aria-label="Selected objects">${single ? kind + filterMenu : filterMenu || kind}${group("Edit and appearance", `${single && !n.projectFrame ? pro("inline", n.type === "frame" ? "Rename frame" : "Edit", "pencil", locked) : ""}${color}${single ? objectGeometryControls(n, ctx) || pro("object-style", "Appearance and parent frame", "settings", locked) : ""}`)}${single && n.projectFrame ? feature("project-frame-update", "Update plan", "refresh", locked) : ""}${frameTools}${single && n.type === "draw" ? group("Stroke style", `<label class="pen-width" title="Stroke thickness">${icon("stroke-width")}<select data-stroke-width aria-label="Stroke thickness" ${locked ? "disabled" : ""}>${[1, 2, 3, 3.5, 5, 8, 12, 18, 24, 32].map((w) => `<option value="${w}" ${w === (n.strokeWidth || 3.5) ? "selected" : ""}>${w} px</option>`).join("")}</select></label>`) : ""}${single && n.type === "grid" ? gridToolbar(n, state, { button, menu, group, icon }) : ""}${group("Text alignment", textMenu)}${group("Collaboration", single && n.type !== "draft" && !(n.type === "task" && !isTaskNote(n)) ? pro("comments", "Comment", "comment") : "")}${group("Organise", arrange + pro("zoom-selection", "Focus selection", "fit"))}${group("Layer order", feature("bring-front", "Bring to front", "front", locked) + feature("send-back", "Send to back", "back", locked))}${group("Object actions", feature("duplicate", "Duplicate", "duplicate") + feature("lock", locked ? "Unlock selection" : "Lock selection", locked ? "unlock" : "local", false, `aria-pressed="${locked}"`) + more)}${group("Delete", feature("selection-delete", single && n.type === "frame" ? "Delete frame (keep contents)" : "Delete", "trash", locked))}</div>`;
  }
  function render() {
    filter.sync();
    const key = pickAll()
      .map((n) => n.id)
      .sort()
      .join(",");
    if (key !== selectionKey) menuKey = null;
    selectionKey = key;
    $(".board-selection")?.remove();
    $("#selection-tools")?.remove();
    if (key) $("#canvas")?.insertAdjacentHTML("beforeend", html());
    const open =
      menuKey && $(`#selection-tools [data-selection-menu="${menuKey}"]`);
    if (open) open.open = true;
    state.selectionToolbarOpen = !!open;
    requestAnimationFrame(positionMenus);
  }
  function close(focus = false) {
    menuKey = null;
    const open = $("#selection-tools details[open]");
    if (open) {
      open.open = false;
      if (focus) open.querySelector("summary").focus();
    }
    state.selectionToolbarOpen = false;
  }
  document.addEventListener("color-picker-resize", () => positionMenus());
  function positionMenus() {
    const canvas = $("#canvas"),
      menu = $("#selection-tools details[open]");
    if (!canvas || !menu) return;
    const panel = menu.querySelector(".selection-popover");
    positionToolbarPopover(panel, menu, canvas);
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target.closest("#selection-tools")) e.stopImmediatePropagation();
      else close();
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const root = e.target.closest("#selection-tools");
      if (!root) {
        close();
        return;
      }
      const align = e.target.closest("[data-text-align]");
      if (
        align &&
        !align.disabled &&
        textAlignments.includes(align.dataset.textAlign)
      ) {
        e.preventDefault();
        close();
        if (
          pick().length === 1 &&
          pick()[0].type === "grid" &&
          !pick()[0].locked
        ) {
          const n = pick()[0],
            s = gridCell(state, n);
          changeBoard(() =>
            selectedCells(state, n).forEach(
              ([r, c]) => (n.grid.cells[r][c].align = align.dataset.textAlign),
            ),
          );
          return;
        }
        const nodes = pick().filter(
          (n) => !n.locked && textAlignment(n) !== align.dataset.textAlign,
        );
        if (nodes.length)
          changeBoard(() =>
            nodes.forEach((n) => (n.textAlign = align.dataset.textAlign)),
          );
        return;
      }
      const summary = e.target.closest("summary");
      if (summary) {
        if (summary.getAttribute("aria-disabled") === "true") {
          e.preventDefault();
          return;
        }
        const menu = summary.parentElement,
          opening = !menu.open;
        close();
        // Toggle explicitly so replacing a filtered toolbar during a click
        // cannot leave the disclosure out of sync with its remembered state.
        e.preventDefault();
        menu.open = opening;
        menuKey = opening ? menu.dataset.selectionMenu : null;
        state.selectionToolbarOpen = opening;
        requestAnimationFrame(positionMenus);
      } else if (e.target.closest("button")) close();
    },
    true,
  );
  function setColor(color) {
    if (!/^#[\da-f]{6}$/i.test(color)) return;
    if (pickEdges().length && !pick().length) {
      changeBoard(() => {
        pickEdges().forEach((e) => (e.color = color));
      });
      return;
    }
    if (pick().length === 1 && pick()[0].type === "grid" && !pick()[0].locked) {
      const n = pick()[0],
        s = gridCell(state, n);
      changeBoard(() =>
        selectedCells(state, n).forEach(
          ([r, c]) => (n.grid.cells[r][c].color = color),
        ),
      );
      return;
    }
    changeBoard(() =>
      pick()
        .filter((n) => !n.locked)
        .forEach((n) => (n.color = color)),
    );
  }
  document.addEventListener(
    "change",
    (e) => {
      if (e.target.name === "grid-background") {
        const n = pick()[0];
        if (pick().length === 1 && n.type === "grid" && !n.locked) {
          close();
          changeBoard(() => {
            n.color = e.target.value;
            for (const row of n.grid.cells)
              for (const cell of row) delete cell.color;
          });
        }
        return;
      }
      if (e.target.matches("[data-stroke-width]")) {
        const width = Number(e.target.value);
        if (Number.isFinite(width) && width >= 1 && width <= 32)
          changeBoard(() =>
            pick()
              .filter((n) => n.type === "draw" && !n.locked)
              .forEach((n) => setStrokeWidth(n, width)),
          );
        return;
      }
      if (e.target.matches("[data-selection-custom-color]")) {
        e.stopImmediatePropagation();
        close();
        setColor(e.target.value);
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const root = $("#selection-tools");
      if (
        !root ||
        e.target.closest(".board-task-editor") ||
        state.dialog ||
        state.canvasEditing ||
        $("#canvas")?.classList.contains("presenting")
      )
        return;
      if (e.key === "Escape" && root.querySelector("details[open]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(true);
        return;
      }
      if (!e.target.closest("#selection-tools")) return;
      if (e.key === "Escape" || e.ctrlKey || e.metaKey) return;
      e.stopImmediatePropagation();
      if (e.target.matches("input,select,textarea")) {
        if (
          e.key === "Enter" &&
          e.target.matches('[data-edge-field="label"]')
        ) {
          e.preventDefault();
          updateEdge("label", e.target.value);
          close(true);
        }
        return;
      }
      if (
        [
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
        ].includes(e.key)
      ) {
        e.preventDefault();
        const host = e.target.closest(".selection-popover") || root;
        const items = [
          ...host.querySelectorAll(
            "button:not(:disabled),summary:not([aria-disabled=true])",
          ),
        ].filter((el) => el.getClientRects().length);
        const i = items.indexOf(e.target),
          next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : (i +
                    (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1) +
                    items.length) %
                  items.length;
        items[next]?.focus();
      }
    },
    true,
  );
  function editLabel() {
    render();
    const menu = $('#selection-tools [data-selection-menu="label"]');
    if (!menu) return;
    menuKey = "label";
    menu.open = true;
    state.selectionToolbarOpen = true;
    requestAnimationFrame(() => {
      positionMenus();
      menu.querySelector("input")?.focus();
    });
  }
  function updateEdge(key, value) {
    const edges = pickEdges();
    if (!edges.length) return;
    if (key === "width") value = Number(value);
    if (edges.every((e) => e[key] === value)) return;
    changeBoard(() =>
      edges.forEach((e) => {
        if (["fromSide", "toSide"].includes(key) && value === "auto")
          delete e[key];
        else e[key] = value;
      }),
    );
  }
  document.addEventListener("change", (e) => {
    if (
      e.target.closest(".connector-tools") &&
      e.target.matches("[data-edge-field]")
    )
      updateEdge(
        e.target.dataset.edgeField,
        e.target.type === "checkbox" ? e.target.checked : e.target.value,
      );
  });
  document.addEventListener("click", (e) => {
    const choice = e.target.closest(
      ".connector-tools [data-edge-head], .connector-tools [data-edge-choice]",
    );
    if (choice) {
      const key = choice.dataset.edgeHead || choice.dataset.edgeChoice;
      updateEdge(key, choice.dataset.value);
      $(`#selection-tools [data-selection-menu="${key}"] > summary`)?.focus();
    }
  });
  return {
    render,
    positionMenus,
    close,
    editLabel,
    filterActive: filter.active,
  };
}

export function positionToolbarPopover(panel, menu, canvas) {
  const c = canvas.getBoundingClientRect(),
    m = menu.getBoundingClientRect();
  panel.style.left = `${Math.max(Math.max(0, c.left) + 8, Math.min(m.left, Math.min(window.innerWidth, c.right) - panel.offsetWidth - 8)) - m.left}px`;
  const below = Math.min(window.innerHeight, c.bottom) - m.bottom - 12,
    above = m.top - Math.max(0, c.top) - 12;
  const up = below < Math.min(panel.scrollHeight, 320) && above > below;
  panel.style.top = up ? "auto" : "calc(100% + 8px)";
  panel.style.bottom = up ? "calc(100% + 8px)" : "auto";
  panel.style.maxHeight = `${Math.max(80, up ? above : below)}px`;
}
