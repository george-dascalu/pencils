import { readableText } from "./node-layout.js";
import { inkPreview } from "./ink-preview.js";
import { boardImages } from "./board-images.js";
import { drawingInput, canvasPointerTool } from "./drawing-input.js";
import { isNote, noteStyleSVG } from "./note-style.js";
import { updateProjectFrame } from "./project-frame.js";
import { hiddenByFrame, frameParents } from "./canvas-geometry.js";
import { partialErase, recogniseStroke, lassoTool } from "./pen-advanced.js";
import {
  objectGeometry,
  paintObjectGeometry,
  shapeSVG,
} from "./object-geometry.js";
import { boardLayoutTools } from "./board-layout-tools.js";
import { framesPDF } from "./frame-export.js";
import { connectorEdit } from "./connector-edit.js";
import { objectText, paintTextStyle } from "./object-text.js";
import { cellBounds } from "./grid-model.js";
import { penTools, penActive } from "./pen-tools.js";
import { strokeMarkup, makeStroke, hitsStroke } from "./pen-model.js";
import { boardGrid, updateGridControls } from "./board-grid.js";
import { gridSVG } from "./grid-model.js";
import {
  framePaintOrder,
  reflowGridContents,
  gridDropTarget,
  framePresets,
  withFrameContents,
  frameContents,
  fitFrame,
  adoptFrameContents,
  updateFrameMembership,
} from "./frame-model.js";
import { textAlignment } from "./text-alignment.js";
import {
  alignmentTargets,
  snapTranslation,
  snapResize,
  paintAlignmentGuides,
} from "./alignment-guides.js";
import { markNodeOverflow, nodeFill, isTaskNote } from "./node-layout.js";
import { boardSettings } from "./board-background.js";
import { selectionToolbar } from "./selection-toolbar.js";
import { arrangeSelection, arrangementActions } from "./selection-arrange.js";
import { canvasControls } from "./canvas-controls.js";
import { canvasPro } from "./canvas-pro.js";
import { encodeCanvas, markdownSlice } from "./canvas-format.js";
import { miroImport } from "./miro-import.js";
export function canvasFeatures(ctx) {
  const {
    state,
    board,
    task,
    esc,
    icon,
    $,
    $$,
    changeBoard,
    renderView,
    boardSnapshot,
    remember,
    saveBoard,
    updateEdges,
    updateCamera,
    toast,
    api,
    route,
    showDialog,
    dialogHead,
    closeDialog,
  } = ctx;
  const { layout } = ctx;
  const miro = miroImport(ctx);
  const selected = new Set();
  const selectedEdges = (state.selectedEdges = new Set());
  const pickEdges = () =>
    board()?.edges.filter(
      (e) => selectedEdges.has(e.id) || e.id === state.selectedEdge,
    ) || [];
  const pickAll = () => [
    ...pick(),
    ...pickEdges().map((e) => ({ ...e, id: `edge:${e.id}`, type: "edge" })),
  ];
  function selectEdge(id, additive = false) {
    if (!additive) {
      selected.clear();
      selectedEdges.clear();
      state.selectedNode = null;
    }
    if (additive && selectedEdges.has(id)) selectedEdges.delete(id);
    else selectedEdges.add(id);
    state.selectedEdge =
      !selected.size && selectedEdges.size === 1 ? [...selectedEdges][0] : null;
    selection();
    updateEdges();
  }
  let drag = null,
    space = false;
  const drawing = drawingInput(ctx, {
    clearSelection,
    place: (event) => controls.place(event),
    cancel: () => { gridControls.cancel(); lasso.cancel(); pro.cancelPointer(); end(null, true, true); },
    action: (action) => {
      if (action === "toggle-eraser") pen.toggleEraser();
      else $(action === "fit" ? '[data-action="board-fit"]' : `[data-action="board-${action}"]`)?.click();
    },
  });
  const snapEnabled = () => board()?.settings?.snap !== false;
  const uid = (prefix) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const pick = () =>
    board()?.nodes.filter(
      (n) => selected.has(n.id) || n.id === state.selectedNode,
    ) || [];
  const point = (event) => {
    const r = $("#canvas").getBoundingClientRect();
    return {
      x: (event.clientX - r.left - state.camera.x) / state.camera.z,
      y: (event.clientY - r.top - state.camera.y) / state.camera.z,
    };
  };
  const bounds = (nodes) => ({
    x: Math.min(...nodes.map((n) => n.x)),
    y: Math.min(...nodes.map((n) => n.y)),
    right: Math.max(...nodes.map((n) => n.x + n.w)),
    bottom: Math.max(...nodes.map((n) => n.y + n.h)),
  });
  const saveFile = (name, content, type) => {
    const link = document.createElement("a"),
      url = URL.createObjectURL(new Blob([content], { type }));
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const gridControls = boardGrid(ctx, {
    moveDOM,
    select(n) {
      selected.clear();
      selected.add(n.id);
      selectedEdges.clear();
      state.selectedNode = n.id;
      state.selectedEdge = null;
      selection();
    },
    pick,
    point,
    selection,
    saveFile,
    edit: () => pro.click("inline"),
  });
  objectText(ctx, pick);
  objectGeometry(ctx, pick);
  connectorEdit(ctx, point, selectEdge);
  const lasso = lassoTool(ctx, { point, selected, focusSelection });
  const layoutTools = boardLayoutTools(ctx, {
    pick,
    point,
    selected,
    focusSelection,
    uid,
    moveDOM,
  });
  const toolbar = selectionToolbar(
    ctx,
    pick,
    (ids) => {
      selected.clear();
      selectedEdges.clear();
      ids.forEach((id) =>
        id.startsWith("edge:")
          ? selectedEdges.add(id.slice(5))
          : selected.add(id),
      );
      state.selectedNode = [...selected][0] || null;
      state.selectedEdge = null;
      selection();
      updateEdges();
    },
    pickAll,
    pickEdges,
  );
  const controls = canvasControls(ctx, {
    pickEdges,
    selected,
    clearSelection,
    focusSelection,
    pick,
    point,
    uid,
    click,
    positionMenus: toolbar.positionMenus,
    cancel: () => end(null, true),
    action: (action) => pro.click(action),
  });
  const pen = penTools(ctx);
  const settings = boardSettings(ctx, {
    ...controls,
    rememberDisplay: (...args) => pro.rememberDisplay(...args),
  });
  const pro = canvasPro(ctx, {
    pickEdges,
    selectedEdges,
    selectEdge,
    filterActive: toolbar.filterActive,
    selectionContents: (nodes = pick()) =>
      toolbar.filterActive() ? nodes : withFrameContents(board().nodes, nodes),
    selected,
    clearSelection,
    focusSelection,
    pick,
    point,
    focusNode,
    uid,
    selection,
    click,
    enhanceBase,
    moveDOM,
    flush: async () => {
      settings.flush();
      await ctx.flushBoard();
    },
    setDisplay: controls.setDisplay,
    busy: ({ allowNavigation = false } = {}) =>
      !!drag ||
      drawing.busy() ||
      pen.busy() ||
      controls.busy({ allowNavigation }) ||
      (!allowNavigation && state.cameraAnimating) ||
      state.gridResizing ||
      state.toolDragging,
    cancel: () => end(null, true),
    place: controls.place,
    positionToolbar: controls.position,
    editConnectorLabel: toolbar.editLabel,
  });
  const images = boardImages(ctx, {
    point,
    uid,
    finishEditing: pro.finishEditing,
    select(nodes) {
      selected.clear();
      selectedEdges.clear();
      nodes.forEach((n) => selected.add(n.id));
      state.selectedNode = nodes[0].id;
      state.selectedEdge = null;
      focusSelection();
    },
  });
  function enhanceBase(only = null) {
    const nodes = new Map((board()?.nodes || []).map((n) => [n.id, n]));
    for (const el of $$(".board-node")) {
      const n = nodes.get(el.dataset.node);
      if (
        !n ||
        (only && !(only instanceof Set ? only.has(n.id) : n.id === only))
      )
        continue;
      if (n.type === "image")
        el.innerHTML = `<img draggable="false" src="/api/projects/${state.project.id}/${esc(n.src)}" alt="${esc(n.text || "Board image")}">`;
      if (n.type === "draw")
        el.innerHTML = `<svg viewBox="0 0 ${n.w} ${n.h}" preserveAspectRatio="none" aria-label="${n.brush === "highlighter" ? "Highlighter stroke" : "Pen drawing"}">${strokeMarkup(n)}</svg>`;
      el.classList.toggle("locked", !!n.locked);
    }
  }
  function focusSelection() {
    selection();
    const element =
      state.selectedNode &&
      $(`[data-node="${CSS.escape(state.selectedNode)}"]`);
    (element || $("#canvas"))?.focus({ preventScroll: true });
  }
  function clearSelection() {
    selected.clear();
    selectedEdges.clear();
    state.selectedNode = null;
    state.selectedEdge = null;
    state.connectFrom = null;
    selection();
  }
  function selection() {
    if (state.selectedEdge && !selectedEdges.has(state.selectedEdge)) {
      selectedEdges.clear();
      selectedEdges.add(state.selectedEdge);
    }
    for (const id of selectedEdges)
      if (!board()?.edges.some((e) => e.id === id)) selectedEdges.delete(id);
    state.selectedEdge =
      !pick().length && selectedEdges.size === 1 ? [...selectedEdges][0] : null;
    if (state.selectedNode && !selected.has(state.selectedNode)) {
      selected.clear();
      selected.add(state.selectedNode);
    }
    for (const id of selected)
      if (!board()?.nodes.some((n) => n.id === id)) selected.delete(id);
    $$(".board-node").forEach((el) => {
      el.classList.toggle("selected", selected.has(el.dataset.node));
      el.querySelectorAll(".resize-handle").forEach((handle) =>
        handle.remove(),
      );
      if (
        selected.has(el.dataset.node) &&
        !el.classList.contains("locked") &&
        !el.classList.contains("collapsed-frame") &&
        !el.classList.contains("inline-editing")
      )
        el.insertAdjacentHTML(
          "beforeend",
          [
            ["nw", "top left"],
            ["ne", "top right"],
            ["sw", "bottom left"],
            ["se", "bottom right"],
          ]
            .map(
              ([corner, label]) =>
                `<span class="resize-handle" data-resize-corner="${corner}" aria-label="Resize from ${label}" title="Resize from ${label} · Hold Shift to lock width or height" role="separator"></span>`,
            )
            .join(""),
        );
    });
    toolbar.render();
    pro.selection();
    layoutTools.render();
    controls.position();
  }
  function render() {
    miro.position();
    if (!board() || !$("#canvas")) return;
    $("#canvas-extras")?.remove();
    $(".board-toolbar")?.insertAdjacentHTML(
      "afterend",
      `<div id="canvas-extras" class="canvas-extra-tools"><button class="button small" data-layout-tool="layers">Layers</button><button class="button small" data-layout-tool="bulk-notes">Bulk notes</button><button class="button small" data-feature="grid-add">Grid</button><button class="button small" data-feature="frame-add">Frame</button><button class="button small" data-feature="project-frame-add">Project frame</button><button class="button small ${state.tool === "draw" ? "primary" : ""}" data-feature="draw-tool">Pen</button><button class="button small" data-feature="image-add" title="PNG, JPG, WebP or GIF · Up to 10 MB each">Images / GIFs</button><select id="frame-nav" aria-label="Jump to frame"><option value="">Jump to frame…</option>${board()
        .nodes.filter((n) => n.type === "frame")
        .map(
          (n) =>
            `<option value="${esc(n.id)}">${esc(n.text || "Untitled frame")}</option>`,
        )
        .join(
          "",
        )}</select><button class="button small" data-feature="canvas-svg">Export SVG</button><button class="button small" data-feature="canvas-png">Export PNG</button><button class="button small" data-feature="canvas-json">Obsidian .canvas</button><button class="button small" data-feature="canvas-import">Import .canvas</button><button class="button small" data-feature="canvas-history">History</button><button class="button small danger" data-feature="canvas-delete">Delete canvas</button></div>`,
    );
    enhanceBase();
    selection();
    pro.render();
    controls.render();
    pen.render();
    layout.render();
    settings.sync();
  }
  // Keep measurement feedback outside the zoomed world so it remains readable.
  function resizeDimensions(node) {
    const canvas = $("#canvas");
    if (!canvas || !node) return;
    let label = canvas.querySelector(".resize-dimensions");
    if (!label) {
      label = document.createElement("output");
      label.className = "resize-dimensions";
      label.setAttribute("aria-label", "Object dimensions: width × height");
      label.setAttribute("aria-live", "off");
      canvas.append(label);
    }
    label.textContent = `${Math.round(node.w)} × ${Math.round(node.h)}`;
    const { x, y, z } = state.camera;
    const width = label.offsetWidth,
      height = label.offsetHeight;
    const left = (node.x + node.w / 2) * z + x - width / 2;
    const bottom = (node.y + (node.collapsed ? 48 : node.h)) * z + y;
    const top =
      bottom + height + 20 <= canvas.clientHeight
        ? bottom + 12
        : node.y * z + y - height - 12;
    label.style.left = `${Math.max(8, Math.min(left, canvas.clientWidth - width - 8))}px`;
    label.style.top = `${Math.max(8, Math.min(top, canvas.clientHeight - height - 8))}px`;
  }
  function moveDOM() {
    const nodes = new Map(board().nodes.map((n) => [n.id, n]));
    for (const el of $$(".board-node")) {
      const n = nodes.get(el.dataset.node);
      if (!n) continue;
      if (el) {
        el.style.left = `${n.x}px`;
        el.style.top = `${n.y}px`;
        el.style.width = `${n.w}px`;
        el.style.height = `${n.collapsed ? 48 : n.h}px`;
        paintTextStyle(el, n);
        paintObjectGeometry(el, n, esc);
        if (n.type === "grid") {
          updateGridControls(el, n);
          const cells = el.querySelector(".grid-cells");
          if (cells) {
            cells.style.gridTemplateColumns = n.grid.columns
              .map((v) => `${v}fr`)
              .join(" ");
            cells.style.gridTemplateRows = n.grid.rows
              .map((v) => `${v}fr`)
              .join(" ");
          }
        }
      }
    }
    updateEdges();
    controls.position();
  }
  function drawingSamples() {
    return drag.straight && drag.samples.length > 1
      ? [drag.samples[0], drag.samples.at(-1)]
      : drag.samples;
  }
  function paintStroke() {
    if (drag?.type !== "draw") return;
    drag.paintFrame = null;
    drag.ink?.(drawingSamples(),drag.style,state.camera,drag.straight);

  }
  function eraseAt(point) {
    if (pen.partial()) {
      for (const n of drag.targets) {
        const old = drag.fragments.get(n.id) || [n],
          parts = old.flatMap((part) =>
            partialErase(part, drag.last, point, 10 / state.camera.z, uid),
          );
        if (
          parts.length !== old.length ||
          parts.some((part, i) => part !== old[i])
        ) {
          drag.erased.add(n.id);
          drag.fragments.set(n.id, parts);
          const svg = $(`[data-node="${CSS.escape(n.id)}"] svg`);
          if (svg)
            svg.innerHTML = parts
              .map(
                (part) =>
                  `<g transform="translate(${part.x - n.x} ${part.y - n.y})">${strokeMarkup(part)}</g>`,
              )
              .join("");
        }
      }
      drag.last = point;
      return;
    }
    for (const n of drag.targets)
      if (
        !drag.erased.has(n.id) &&
        hitsStroke(n, drag.last, point, 10 / state.camera.z)
      ) {
        drag.erased.add(n.id);
        $(`[data-node="${CSS.escape(n.id)}"]`)?.classList.add("pen-erased");
      }
    drag.last = point;
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      const canvas = event.target.closest("#canvas") && $("#canvas");
      const tool = canvasPointerTool(state.tool, event.pointerType);
      if (
        !canvas ||
        event.button !== 0 ||
        event.target.closest(
          "button,input,select,textarea,a,[contenteditable],.board-tools,.inline-editing,.inline-floating-tools,.canvas-panel,.canvas-find,.canvas-filters,#pen-tools",
        ) ||
        space ||
        tool === "hand" ||
        (tool === "connect" && event.target.closest("[data-node]"))
      )
        return;
      let el = event.target.closest("[data-node]");
      let frameInterior = false;
      if (
        el?.classList.contains("frame") &&
        !el.classList.contains("collapsed-frame") &&
        !event.target.closest(".frame-title,.resize-handle,.connection-port")
      ) {
        const r = el.getBoundingClientRect();
        if (
          event.clientX > r.left + 8 &&
          event.clientX < r.right - 8 &&
          event.clientY > r.top + 8 &&
          event.clientY < r.bottom - 8
        )
          frameInterior = true;
      }
      if (
        !["frame", "project-frame"].includes(tool) &&
        !penActive(tool) &&
        event.target.closest("[data-edge]")
      )
        return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const p = point(event);
      if (["frame", "project-frame"].includes(tool)) {
        clearSelection();
        drag = {
          type: "frame",
          projectFrame: state.tool === "project-frame",
          start: p,
          before: boardSnapshot(),
        };
        canvas.insertAdjacentHTML(
          "beforeend",
          '<div class="marquee frame-preview"></div>',
        );
      } else if (penActive(tool)) {
        clearSelection();
        pen.render();
        if (state.tool === "erase") {
          drag = {
            type: "erase",
            start: p,
            before: boardSnapshot(),
            last: p,
            erased: new Set(),
            fragments: new Map(),
            targets: pro
              .visible(board(), { limit: false })
              .filter((n) => n.type === "draw" && !n.locked),
          };
          eraseAt(p);
        } else {
          drag = {
            type: "draw",
            start: p,
            before: boardSnapshot(),
            samples: [
              {
                ...p,
                pressure: event.pointerType === "pen" ? event.pressure : 0.5,
                time: event.timeStamp, tiltX:event.tiltX || 0, tiltY:event.tiltY || 0,
              },
            ],
            style: {
              ...pen.style(),
              pressure: event.pointerType === "pen" && pen.style().pressure,
            },
            straight: event.shiftKey,
          };
          canvas.insertAdjacentHTML(
            "beforeend",
            '<div class="drawing-preview" aria-hidden="true"></div>',
          );
          drag.ink=inkPreview($(".drawing-preview"));
          paintStroke();
        }
        el = null;
      } else if (
        frameInterior &&
        (!selected.has(el.dataset.node) ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey)
      ) {
        // An empty frame surface is both a click target and a marquee origin.
        // Once selected, use the normal move path to carry its contents.
        drag = {
          type: "frame-select",
          id: el.dataset.node,
          start: p,
          additive: event.shiftKey || event.ctrlKey || event.metaKey,
          nodes: [...selected],
          edges: [...selectedEdges],
        };
      } else if (el) {
        const n = board().nodes.find((n) => n.id === el.dataset.node);
        if (
          (event.shiftKey || event.ctrlKey || event.metaKey) &&
          !event.target.closest(".resize-handle")
        ) {
          selected.has(n.id) ? selected.delete(n.id) : selected.add(n.id);
          state.selectedNode = [...selected][0] || null;
          state.selectedEdge = null;
          selection();
          return;
        }
        if (!selected.has(n.id)) {
          selectedEdges.clear();
          selected.clear();
          selected.add(n.id);
          if (n.group)
            for (const sibling of board().nodes.filter(
              (x) => x.group === n.group,
            ))
              selected.add(sibling.id);
        }
        state.selectedNode = n.id;
        state.selectedEdge = null;
        selection();
        if (n.locked) return;
        const ids = new Set(
          (toolbar.filterActive()
            ? pick()
            : withFrameContents(board().nodes, pick())
          ).map((n) => n.id),
        );
        drag = {
          type: event.target.closest(".resize-handle") ? "resize" : "move",
          corner:
            event.target.closest(".resize-handle")?.dataset.resizeCorner ||
            "se",
          id: n.id,
          start: p,
          before: boardSnapshot(),
          ids,
          moved: false,
          targets: alignmentTargets(board().nodes, ids),
          duplicate: event.altKey && !event.target.closest(".resize-handle"),
        };
        if (drag.type === "resize") resizeDimensions(n);
      } else {
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        if (!additive) clearSelection();
        drag = {
          type: "marquee",
          start: p,
          nodes: [...selected],
          edges: [...selectedEdges],
        };
        canvas.insertAdjacentHTML("beforeend", '<div class="marquee"></div>');
      }
      drag.pointerId = event.pointerId;
      drag.touch = event.pointerType === "touch";
      // Keep title double-clicks targeted at the grid header after capture.
      drag.capture =
        el?.querySelector(".grid-grip") && event.target.closest(".grid-grip")
          ? el.querySelector(".grid-grip")
          : el || canvas;
      drag.capture.setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopImmediatePropagation();
      const p = point(event),
        dx = p.x - drag.start.x,
        dy = p.y - drag.start.y;
      if (drag.type === "frame-select") {
        if (Math.hypot(dx, dy) * state.camera.z < 5) return;
        if (!drag.additive) {
          clearSelection();
          drag.nodes = [];
          drag.edges = [];
        }
        drag.type = "marquee";
        $("#canvas").insertAdjacentHTML(
          "beforeend",
          '<div class="marquee"></div>',
        );
      }
      if (drag.type === "move" || drag.type === "resize") {
        if (Math.hypot(dx, dy) * state.camera.z > (drag.touch ? 8 : 3)) drag.moved = true;
        if (!drag.moved) return;
        $("#canvas").classList.add("object-dragging");
        if (drag.moved && drag.duplicate) {
          drag.duplicate = false;
          drag.duplicated = true;
          const source = board().nodes.filter((n) => drag.ids.has(n.id));
          const ids = new Map(source.map((n) => [n.id, uid("n")])),
            groups = new Map();
          const copies = source.map((n) => {
            const copy = structuredClone(n);
            copy.id = ids.get(n.id);
            if (n.group) {
              if (!groups.has(n.group)) groups.set(n.group, uid("g"));
              copy.group = groups.get(n.group);
            }
            if (ids.has(copy.frame)) copy.frame = ids.get(copy.frame);
            if (copy.projectFrameOwner)
              copy.projectFrameOwner = ids.get(copy.projectFrameOwner);
            return copy;
          });
          board().nodes.push(...copies);
          board().edges.push(
            ...board()
              .edges.filter((e) => ids.has(e.from) && ids.has(e.to))
              .map((e) => ({
                ...structuredClone(e),
                id: uid("e"),
                projectFrameOwner: ids.get(e.projectFrameOwner),
                from: ids.get(e.from),
                to: ids.get(e.to),
              })),
          );
          const copiedIds = new Set(ids.values());
          drag.edgeOrigins = structuredClone(
            board().edges.filter(
              (e) => copiedIds.has(e.from) && copiedIds.has(e.to),
            ),
          );
          selectedEdges.clear();
          drag.edgeOrigins.forEach((e) => selectedEdges.add(e.id));
          state.selectedEdge = null;
          drag.origins = structuredClone(copies);
          drag.ids = new Set(ids.values());
          drag.targets = alignmentTargets(board().nodes, drag.ids);
          selected.clear();
          for (const id of drag.ids) selected.add(id);
          state.selectedNode = ids.get(drag.id);
          drag.id = state.selectedNode;
          $("#canvas-world").insertAdjacentHTML(
            "beforeend",
            copies.map(ctx.nodeHTML).join(""),
          );
          enhanceBase();
          pro.enhance();
          selection();
        }
        const moving = (drag.origins || drag.before.nodes).filter(
          (n) =>
            drag.ids.has(n.id) &&
            (!n.locked || drag.duplicated || !selected.has(n.id)),
        );
        let translation;
        if (drag.type === "move") {
          translation = snapTranslation(moving, drag.targets, dx, dy, {
            zoom: state.camera.z,
            grid: snapEnabled() && !event.altKey,
            align: board()?.settings?.alignObjects !== false && !event.altKey,
            previous: drag.locks,
            primary: moving.find((n) => n.id === drag.id),
          });
          drag.locks = translation.locks;
          paintAlignmentGuides($("#canvas"), translation.guides, state.camera);
        }
        for (const n of board().nodes.filter(
          (n) =>
            drag.ids.has(n.id) &&
            (!n.locked || drag.duplicated || !selected.has(n.id)),
        )) {
          const old = (drag.origins || drag.before.nodes).find(
            (x) => x.id === n.id,
          );
          if (drag.type === "resize" && n.id === drag.id) {
            if (!event.shiftKey) drag.axis = null;
            else if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 3)
              drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
            const resized = snapResize(n, old, drag.targets, dx, dy, {
              corner: drag.corner,
              axis: event.shiftKey ? drag.axis : null,
              zoom: state.camera.z,
              grid: snapEnabled() && !event.altKey,
              align: board()?.settings?.alignObjects !== false && !event.altKey,
              previous: drag.locks,
            });
            n.x = resized.x;
            n.y = resized.y;
            n.w = resized.w;
            n.h = resized.h;
            drag.locks = resized.locks;
            paintAlignmentGuides($("#canvas"), resized.guides, state.camera);
            if (n.type === "draw")
              n.points = old.points.map(([x, y]) => [
                (x * n.w) / old.w,
                (y * n.h) / old.h,
              ]);
          } else if (drag.type === "move") {
            n.x = old.x + translation.dx;
            n.y = old.y + translation.dy;
          }
        }
        if (drag.type === "resize") {
          const grid = board().nodes.find(
            (n) => n.id === drag.id && n.type === "grid",
          );
          if (grid) reflowGridContents(board().nodes, grid, drag.before.nodes);
        }
        if (drag.type === "move") {
          const movingIds = new Set(moving.map((n) => n.id));
          for (const edge of drag.edgeOrigins || drag.before.edges) {
            if (
              !edge.bends ||
              !movingIds.has(edge.from) ||
              !movingIds.has(edge.to)
            )
              continue;
            const live = board().edges.find((e) => e.id === edge.id);
            if (live)
              live.bends = edge.bends.map((p) => ({
                x: p.x + translation.dx,
                y: p.y + translation.dy,
              }));
          }
        }
        $(".container-drop-preview")?.remove();
        if (drag.type === "move") {
          const primary = board().nodes.find((n) => n.id === drag.id),
            target = gridDropTarget(board().nodes, primary, drag.ids);
          const frame =
            !target &&
            board()
              .nodes.filter(
                (n) =>
                  n.type === "frame" &&
                  !n.collapsed &&
                  !drag.ids.has(n.id) &&
                  primary.x >= n.x &&
                  primary.y >= n.y &&
                  primary.x + primary.w <= n.x + n.w &&
                  primary.y + primary.h <= n.y + n.h,
              )
              .sort((a, b) => a.w * a.h - b.w * b.h)[0];
          const box = target
            ? cellBounds(target.grid, target.cell.row, target.cell.column)
            : frame;
          if (box) {
            const c = state.camera;
            $("#canvas").insertAdjacentHTML(
              "beforeend",
              `<div class="container-drop-preview" style="left:${box.x * c.z + c.x}px;top:${box.y * c.z + c.y}px;width:${box.w * c.z}px;height:${box.h * c.z}px">${target ? "" : "<span>Place in frame</span>"}</div>`,
            );
          }
        }
        moveDOM();
        if (drag.type === "resize")
          resizeDimensions(board().nodes.find((n) => n.id === drag.id));
        markNodeOverflow();
      } else if (drag.type === "marquee" || drag.type === "frame") {
        const box = $(".marquee"),
          x = Math.min(p.x, drag.start.x),
          y = Math.min(p.y, drag.start.y),
          w = Math.abs(dx),
          h = Math.abs(dy);
        Object.assign(box.style, {
          left: `${x * state.camera.z + state.camera.x}px`,
          top: `${y * state.camera.z + state.camera.y}px`,
          width: `${w * state.camera.z}px`,
          height: `${h * state.camera.z}px`,
        });
        if (drag.type === "frame") {
          drag.box = { x, y, w, h };
          box.textContent = `${Math.round(w)} × ${Math.round(h)}`;
          return;
        }
        selected.clear();
        drag.nodes.forEach((id) => selected.add(id));
        selectedEdges.clear();
        drag.edges.forEach((id) => selectedEdges.add(id));
        state.selectedEdge = null;
        for (const path of $$("path.canvas-edge")) {
          const box = path.getBBox();
          if (
            box.x >= x &&
            box.y >= y &&
            box.x + box.width <= x + w &&
            box.y + box.height <= y + h
          )
            selectedEdges.add(path.dataset.edge);
        }
        $$("path.canvas-edge").forEach((el) =>
          el.classList.toggle("selected", selectedEdges.has(el.dataset.edge)),
        );
        for (const n of board().nodes)
          if (
            $(`[data-node="${CSS.escape(n.id)}"]`) &&
            n.x >= x &&
            n.y >= y &&
            n.x + n.w <= x + w &&
            n.y + n.h <= y + h
          )
            selected.add(n.id);
        state.selectedNode = [...selected][0] || null;
        $$(".board-node").forEach((el) =>
          el.classList.toggle("selected", selected.has(el.dataset.node)),
        );
      } else if (drag.type === "draw") {
        const events = event.getCoalescedEvents?.();
        for (const sample of events?.length ? events : [event]) {
          const q = point(sample),
            last = drag.samples.at(-1);
          if (
            drag.samples.length < 10000 &&
            Math.hypot(q.x - last.x, q.y - last.y) * state.camera.z >= 0.5
          )
            drag.samples.push({
              ...q,
              pressure: sample.pointerType === "pen" ? sample.pressure : 0.5,
              time:sample.timeStamp,tiltX:sample.tiltX || 0,tiltY:sample.tiltY || 0,
            });
        }
        drag.straight = event.shiftKey;
        if (!drag.paintFrame)
          drag.paintFrame = requestAnimationFrame(paintStroke);
      } else if (drag.type === "erase") {
        eraseAt(p);
      }
    },
    true,
  );
  function end(event, cancel = false, preserveTouchTarget = false) {
    if (
      !drag ||
      (event?.pointerId != null && event.pointerId !== drag.pointerId)
    )
      return;
    if (event?.type === "lostpointercapture" && event.target !== drag.capture)
      return;
    event?.stopImmediatePropagation();
    if (cancel && drag.before) Object.assign(board(), drag.before);
    else if (!cancel && drag.type === "frame-select") {
      const node = board().nodes.find((n) => n.id === drag.id);
      if (node) {
        if (drag.additive) {
          selected.has(node.id)
            ? selected.delete(node.id)
            : selected.add(node.id);
          state.selectedNode = [...selected][0] || null;
        } else {
          if (!selected.has(node.id)) {
            selected.clear();
            selectedEdges.clear();
            selected.add(node.id);
            if (node.group)
              for (const sibling of board().nodes.filter(
                (n) => n.group === node.group,
              ))
                selected.add(sibling.id);
          }
          state.selectedNode = node.id;
        }
        state.selectedEdge = null;
      }
    } else if (drag.type === "frame") {
      const box =
        drag.box && Math.max(drag.box.w, drag.box.h) * state.camera.z > 4
          ? drag.box
          : { ...drag.start, w: 960, h: 540 };
      const frame = {
        id: uid("n"),
        type: "frame",
        text: drag.projectFrame ? state.project.title : "",
        ...(drag.projectFrame ? { projectFrame: true } : {}),
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.max(160, Math.round(box.w)),
        h: Math.max(100, Math.round(box.h)),
      };
      remember(drag.before);
      board().nodes.unshift(frame);
      adoptFrameContents(board().nodes, frame);
      selected.add(frame.id);
      state.selectedNode = frame.id;
      state.tool = "cursor";
      saveBoard();
    } else if (drag.type === "draw") {
      remember(drag.before);
      const raw = makeStroke(drawingSamples(), drag.style, uid("n")),
        stroke = pen.recognise() ? recogniseStroke(raw) : raw;
      board().nodes.push(stroke);
      updateFrameMembership(
        board().nodes,
        new Set([stroke.id]),
        drag.before.nodes,
      );
      saveBoard();
    } else if (drag.type === "erase" && drag.erased.size) {
      remember(drag.before);
      board().nodes = board().nodes.filter((n) => !drag.erased.has(n.id));
      for (const parts of drag.fragments.values()) board().nodes.push(...parts);
      const ids = new Set(board().nodes.map((n) => n.id));
      board().edges = board().edges.filter(
        (e) => ids.has(e.from) && ids.has(e.to),
      );
      saveBoard();
    } else if (drag.moved) {
      if (drag.type === "move")
        updateFrameMembership(
          board().nodes,
          drag.ids,
          drag.origins || drag.before.nodes,
          { adopt: !toolbar.filterActive() },
        );
      if (drag.type === "resize") {
        const frame = board().nodes.find(
          (n) => n.id === drag.id && n.type === "frame",
        );
        if (frame) adoptFrameContents(board().nodes, frame);
        const node = board().nodes.find((n) => n.id === drag.id),
          parent = board().nodes.find(
            (n) => n.id === node?.frame && n.type === "grid",
          );
        if (parent)
          reflowGridContents(board().nodes, parent, drag.before.nodes);
      }
      remember(drag.before);
      saveBoard();
    }
    const focusCopy = !cancel && (drag.duplicated || drag.type === "frame");
    const redraw =
      cancel || drag.moved || ["draw", "erase", "frame"].includes(drag.type);
    if (drag.paintFrame) cancelAnimationFrame(drag.paintFrame);
    drag = null;
    $("#canvas")?.classList.remove("object-dragging");
    $(".container-drop-preview")?.remove();
    $(".marquee")?.remove();
    $(".drawing-preview")?.remove();
    $(".alignment-guides")?.remove();
    $(".resize-dimensions")?.remove();
    // Replacing the touched DOM node interrupts the browser's remaining fingers.
    // A pinch takeover restores geometry in place until all contacts lift.
    if (cancel && preserveTouchTarget) {
      moveDOM();
      selection();
    } else if (redraw) renderView(true);
    else {
      selection();
      updateEdges();
    }
    if (focusCopy) focusSelection();
  }
  document.addEventListener("pointerup", (event) => end(event), true);
  document.addEventListener("pointercancel", (event) => end(event, true), true);
  document.addEventListener(
    "lostpointercapture",
    (event) => end(event, true),
    true,
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (drag && event.key === "Escape") {
        event.preventDefault();
        end(event, true);
      }
    },
    true,
  );
  window.addEventListener("blur", () => {
    space = false;
    if (drag) end(null, true);
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        !["board", "drawing"].includes(state.view) ||
        state.dialog ||
        event.target.closest(
          "input,textarea,select,[contenteditable],.board-task-editor",
        )
      )
        return;
      if (event.code === "Space") space = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.selectedEdge = null;
        selected.clear();
        selectedEdges.clear();
        const hidden = hiddenByFrame(
          board().nodes,
          frameParents(board().nodes),
        );
        for (const n of board().nodes)
          if (!hidden.has(n.id)) selected.add(n.id);
        for (const e of board().edges)
          if (!hidden.has(e.from) && !hidden.has(e.to)) selectedEdges.add(e.id);
        state.selectedNode = [...selected][0];
        selection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        event.stopImmediatePropagation();
        click("duplicate");
      }
      if (
        ["Delete", "Backspace"].includes(event.key) &&
        (selected.size > 0 || pickEdges().length > 0)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        click("selection-delete");
      }
    },
    true,
  );
  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") space = false;
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "frame-nav") {
      const n = board().nodes.find((n) => n.id === e.target.value);
      if (n) focusNode(n);
    }
  });
  function focusNode(n) {
    const canvas = $("#canvas"),
      z = Math.min(
        1.5,
        (canvas.clientWidth - 140) / n.w,
        (canvas.clientHeight - 100) / n.h,
      );
    state.camera = {
      z,
      x: (canvas.clientWidth - n.w * z) / 2 - n.x * z,
      y: (canvas.clientHeight - n.h * z) / 2 - n.y * z,
    };
    updateCamera();
  }
  function chooseFile(accept, callback) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      if (input.files[0])
        callback(input.files[0]).catch((e) => toast(e.message, true));
    };
    input.click();
  }
  async function svg(frame = null) {
    const b = board();
    if (!b.nodes.length) throw new Error("Add objects before exporting.");
    const box = frame
        ? {
            x: frame.x + 40,
            y: frame.y + 40,
            right: frame.x + frame.w - 40,
            bottom: frame.y + frame.h - 40,
          }
        : bounds(b.nodes),
      w = box.right - box.x + 80,
      h = box.bottom - box.y + 80;
    let content = "",
      drewEdges = false;
    for (const n of framePaintOrder(b.nodes)) {
      if (n.type !== "frame" && !drewEdges) {
        content += pro.edges(b, true);
        drewEdges = true;
      }
      let inside = "";
      if (n.type === "grid") inside = gridSVG(n, esc);
      else if (n.type === "image") {
        const response = await fetch(
          `/api/projects/${state.project.id}/${n.src}`,
        );
        if (!response.ok) throw new Error("An image could not be loaded.");
        const blob = await response.blob(),
          data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        const [l, t, r, b] = n.crop || [0, 0, 0, 0];
        inside = `<clipPath id="crop-${esc(n.id)}"><rect width="${n.w}" height="${n.h}"/></clipPath><image clip-path="url(#crop-${esc(n.id)})" x="${(-l * n.w) / (1 - l - r)}" y="${(-t * n.h) / (1 - t - b)}" width="${n.w / (1 - l - r)}" height="${n.h / (1 - t - b)}" preserveAspectRatio="none" href="${data}"/>`;
      } else if (n.type === "draw") inside = strokeMarkup(n);
      else {
        const text =
            n.type === "task"
              ? isTaskNote(n)
                ? [
                    task(n.task)?.title,
                    markdownSlice(task(n.task)?.body || "", n.subpath || "")
                      ?.text,
                  ]
                    .filter(Boolean)
                    .join("\n\n")
                : task(n.task)?.title || "Removed task"
              : n.type === "draft"
                ? `${n.draft?.title || "Draft task"}\n\n${n.text || ""}`
                : n.text || "",
          lines = text.split("\n").flatMap((paragraph) => {
            const wrapped = paragraph.match(/.{1,32}(?:\s|$)|.{1,32}/g) || [""];
            return wrapped.map((line, i) => ({
              text: line.trimEnd(),
              justify: i < wrapped.length - 1,
            }));
          }),
          align = textAlignment(n),
          anchor =
            align === "center" ? "middle" : align === "right" ? "end" : "start",
          textX =
            align === "center" ? n.w / 2 : align === "right" ? n.w - 16 : 16;
        inside = `${n.type === "shape" ? shapeSVG(n, esc) : isNote(n) && n.noteStyle ? noteStyleSVG(n, esc) : `<rect width="${n.w}" height="${n.h}" rx="6" fill="${n.type === "frame" ? nodeFill(n, "#ffffff") : nodeFill(n)}" stroke="#82937d"/>`}${lines
          .slice(0, Math.max(1, Math.floor(n.h / 22) - 1))
          .map(
            (line, i) =>
              `<text x="${textX}" y="${30 + i * 22}" text-anchor="${anchor}" ${align === "justify" && line.justify && /\s/.test(line.text) ? `textLength="${Math.max(1, n.w - 32)}" lengthAdjust="spacing"` : ""} font-size="16" fill="${readableText(nodeFill(n))}">${esc(line.text)}</text>`,
          )
          .join("")}`;
      }
      content += `<g transform="translate(${n.x} ${n.y}) rotate(${n.rotation || 0} ${n.w / 2} ${n.h / 2})">${inside}</g>`;
    }
    if (!drewEdges) content += pro.edges(b, true);
    return {
      text: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${box.x - 40} ${box.y - 40} ${w} ${h}" font-family="sans-serif"><rect x="${box.x - 40}" y="${box.y - 40}" width="${w}" height="${h}" fill="#fafbf7"/>${content}</svg>`,
      w,
      h,
    };
  }
  async function click(action, el) {
    if (action === "miro-import") {
      settings.close();
      await miro.open(document.querySelector('[data-feature="board-settings"]'));
      return true;
    }
    if (action === "board-settings") {
      settings.open(el);
      return true;
    }
    const selectionActions = [
      "duplicate",
      "group",
      "ungroup",
      "frame-selection",
      ...arrangementActions,
      "lock",
      "selection-delete",
    ];
    if (selectionActions.includes(action)) {
      const nodes =
        action === "duplicate" && !toolbar.filterActive()
          ? withFrameContents(board().nodes, pick())
          : pick();
      const edges = pickEdges();
      if (!nodes.length && !edges.length) return true;
      changeBoard((b) => {
        if (action === "duplicate") {
          const map = new Map(nodes.map((n) => [n.id, uid("n")])),
            groupMap = new Map();
          for (const n of nodes) {
            const copy = structuredClone(n);
            copy.id = map.get(n.id);
            copy.x += 40;
            copy.y += 40;
            if (n.group) {
              if (!groupMap.has(n.group)) groupMap.set(n.group, uid("g"));
              copy.group = groupMap.get(n.group);
            }
            if (copy.frame && map.has(copy.frame))
              copy.frame = map.get(copy.frame);
            if (copy.projectFrameOwner)
              copy.projectFrameOwner = map.get(copy.projectFrameOwner);
            b.nodes.push(copy);
          }
          const copies = b.edges
            .filter(
              (e) =>
                (map.has(e.from) && map.has(e.to)) ||
                edges.some((x) => x.id === e.id),
            )
            .map((e) => ({
              ...structuredClone(e),
              id: uid("e"),
              projectFrameOwner: map.get(e.projectFrameOwner),
              from: map.get(e.from) || e.from,
              to: map.get(e.to) || e.to,
              ...(e.bends && map.has(e.from) && map.has(e.to)
                ? { bends: e.bends.map((p) => ({ x: p.x + 40, y: p.y + 40 })) }
                : {}),
            }));
          b.edges.push(...copies);
          selectedEdges.clear();
          copies.forEach((e) => selectedEdges.add(e.id));
          state.selectedEdge = null;
          selected.clear();
          for (const id of map.values()) selected.add(id);
          state.selectedNode = [...selected][0];
        }
        if (action === "group") {
          const group = uid("g");
          nodes.filter((n) => !n.locked).forEach((n) => (n.group = group));
        }
        if (action === "ungroup")
          nodes.filter((n) => !n.locked).forEach((n) => delete n.group);
        if (action === "lock") {
          const locked = !nodes.every((n) => n.locked);
          nodes.forEach((n) => {
            if (!n.layerLocked) n.locked = locked;
          });
        }
        if (action === "selection-delete") {
          const ids = new Set(nodes.filter((n) => !n.locked).map((n) => n.id));
          b.nodes = b.nodes.filter((n) => !ids.has(n.id));
          for (const n of b.nodes)
            if (ids.has(n.frame)) {
              delete n.frame;
              delete n.gridCell;
            }
          if (b.presentation)
            b.presentation = b.presentation.filter((id) => !ids.has(id));
          b.edges = b.edges.filter(
            (e) =>
              !ids.has(e.from) &&
              !ids.has(e.to) &&
              !edges.some((x) => x.id === e.id),
          );
          selectedEdges.clear();
          state.selectedEdge = null;
          selected.clear();
          state.selectedNode = null;
        }
        if (arrangementActions.includes(action))
          arrangeSelection(b, nodes, action, {
            carryContents: !toolbar.filterActive(),
          });
        if (action === "frame-selection") {
          const movable = nodes.filter((n) => !n.locked);
          if (!movable.length) return;
          const box = bounds(movable),
            frameId = uid("n");
          movable.forEach((n) => {
            n.frame = frameId;
            delete n.gridCell;
          });
          b.nodes.unshift({
            id: frameId,
            type: "frame",
            text: "",
            x: box.x - 40,
            y: box.y - 60,
            w: box.right - box.x + 80,
            h: box.bottom - box.y + 100,
          });
          selected.clear();
          selected.add(frameId);
          selectedEdges.clear();
          state.selectedNode = frameId;
          state.selectedEdge = null;
        }
      });
      if (action === "duplicate") focusSelection();
      return true;
    }
    if (action === "grid-add") {
      state.tool = "grid";
      state.headerMenu = null;
      renderView();
      return true;
    }
    if (action === "project-frame-add") {
      state.tool = state.tool === "project-frame" ? "cursor" : "project-frame";
      clearSelection();
      renderView(true);
      return true;
    }
    if (action === "project-frame-update") {
      const frame = board().nodes.find(
        (n) =>
          n.id === (el?.dataset.id || state.selectedNode) && n.projectFrame,
      );
      if (!frame || frame.locked) return true;
      // Refresh task data without replacing pending local board edits.
      const projectId = state.project.id,
        boardId = board().id;
      const snapshot = await api(route());
      if (
        state.project?.id !== projectId ||
        board()?.id !== boardId ||
        !["board", "drawing"].includes(state.view)
      )
        return true;
      state.tasks = snapshot.tasks;
      const signature = (b) => JSON.stringify([b.nodes, b.edges]);
      const original = structuredClone(board()),
        base = signature(original);
      let next;
      const preview = () => {
        next = structuredClone(original);
        updateProjectFrame(
          next,
          next.nodes.find((n) => n.id === frame.id),
          snapshot.tasks,
          snapshot.project.title,
          {
            preservePlacement:
              !panel.querySelector("#frame-relayout").checked,
          },
        );
      };
      showDialog(
        `<dialog class="board-comments board-object-panel frame-update-panel" aria-label="Update project frame"><div class="board-comments-head"><strong>Update project frame</strong><button type="button" class="icon-button" data-action="dialog-close" aria-label="Close frame update">${icon("close")}</button></div><div class="dialog-body"><label class="frame-update-option"><input type="checkbox" id="frame-relayout" aria-describedby="frame-relayout-hint"> Rearrange generated cards</label><p id="frame-relayout-hint">Leave unchecked to keep card positions and sizes.</p><p data-frame-error role="alert"></p></div><div class="dialog-foot"><button type="button" class="button primary" id="frame-apply">Update frame</button></div></dialog>`,
        "frame-update",
        { nodeId: frame.id },
      );
      const panel = document.querySelector(".frame-update-panel");
      const relayout = panel.querySelector("#frame-relayout");
      const apply = panel.querySelector("#frame-apply");
      const isCurrent = () =>
        panel.isConnected &&
        state.project?.id === projectId &&
        board()?.id === boardId &&
        ["board", "drawing"].includes(state.view);
      preview();
      relayout.onchange = preview;
      apply.onclick = async () => {
        apply.disabled = true;
        relayout.disabled = true;
        try {
          if (!isCurrent()) return;
          if (signature(board()) !== base)
            throw Error(
              "The board changed. Close and preview the update again.",
            );
          const current = await api(route());
          // A contextual panel can be dismissed while the refresh is pending.
          // Never apply its plan to a different board or close a newer panel.
          if (!isCurrent()) return;
          if (
            JSON.stringify(current.tasks.map((t) => [t.id, t.revision])) !==
            JSON.stringify(snapshot.tasks.map((t) => [t.id, t.revision]))
          )
            throw Error("Tasks changed. Close and preview the update again.");
          if (signature(board()) !== base)
            throw Error("The board changed. Preview again.");
          changeBoard((b) => {
            b.nodes = next.nodes;
            b.edges = next.edges;
            clearSelection();
            selected.add(frame.id);
            state.selectedNode = frame.id;
            state.tool = "cursor";
          });
          closeDialog(true);
        } catch (error) {
          if (isCurrent())
            panel.querySelector("[data-frame-error]").textContent = error.message;
        } finally {
          apply.disabled = false;
          relayout.disabled = false;
        }
      };

      return true;
    }
    if (action === "frame-add") {
      state.tool = state.tool === "frame" ? "cursor" : "frame";
      clearSelection();
      renderView(true);
      return true;
    }
    if (["frame-preset", "frame-fit", "frame-contents"].includes(action)) {
      const n = pick()[0];
      if (!n || n.type !== "frame") return true;
      if (action === "frame-contents") {
        selected.clear();
        selectedEdges.clear();
        frameContents(board().nodes, n).forEach((child) =>
          selected.add(child.id),
        );
        state.selectedNode = [...selected][0] || null;
        state.selectedEdge = null;
        focusSelection();
      } else if (!n.locked) {
        const preset = framePresets.find((p) => p.id === el?.dataset.preset);
        if (action === "frame-fit" && !frameContents(board().nodes, n).length)
          return true;
        if (action === "frame-preset" && !preset) return true;
        changeBoard((b) => {
          if (preset)
            Object.assign(n, { w: preset.w, h: preset.h, collapsed: false });
          else fitFrame(b.nodes, n);
          adoptFrameContents(b.nodes, n);
        });
      }
      return true;
    }
    if (action === "draw-tool") {
      state.tool = penActive(state.tool) ? "cursor" : "draw";
      state.headerMenu = null;
      renderView(true);
      return true;
    }
    if (action === "image-add") {
      images.choose();
      return true;
    }
    if (action === "edge-label") {
      const edge = board().edges.find((e) => e.id === state.selectedEdge);
      if (edge) pro.editConnector(edge);
      return true;
    }
    if (action === "frames-pdf") {
      const frames = pick().filter((n) => n.type === "frame");
      if (!frames.length) {
        toast("Select frames to export.");
        return true;
      }
      saveFile(
        `${board().title}-frames.pdf`,
        await framesPDF(frames, svg),
        "application/pdf",
      );
      return true;
    }
    if (action === "canvas-svg" || action === "canvas-png") {
      const result = await svg();
      if (action === "canvas-svg")
        saveFile(`${board().title}.svg`, result.text, "image/svg+xml");
      else {
        const url = URL.createObjectURL(
            new Blob([result.text], { type: "image/svg+xml" }),
          ),
          image = new Image();
        try {
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas"),
            scale = Math.min(2, 8192 / result.w, 8192 / result.h);
          canvas.width = Math.ceil(result.w * scale);
          canvas.height = Math.ceil(result.h * scale);
          canvas
            .getContext("2d")
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise((resolve) => canvas.toBlob(resolve));
          saveFile(`${board().title}.png`, blob, "image/png");
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      return true;
    }
    if (action === "canvas-json") {
      saveFile(
        `${board().title}.canvas`,
        JSON.stringify(encodeCanvas(board()), null, 2),
        "application/json",
      );
      return true;
    }
    if (action === "canvas-import") {
      chooseFile(".canvas,application/json", async (file) => {
        if (file.size > 12000000) throw new Error("Use a canvas under 12 MB.");
        const created = await api(route("boards"), {
          method: "POST",
          body: {
            title: file.name.replace(/\.canvas$/, ""),
            canvas: JSON.parse(await file.text()),
          },
        });
        state.selectedBoard = created.id;
        await ctx.refresh();
        toast("Native canvas imported.");
      });
      return true;
    }
    return false;
  }
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "edge-form") return;
    event.preventDefault();
    const form = event.target,
      value = new FormData(form).get("label");
    changeBoard(
      (b) => (b.edges.find((e) => e.id === form.dataset.id).label = value),
    );
    closeDialog(true);
  });
  document.addEventListener(
    "dblclick",
    (event) => {
      if (event.target.closest("[data-edge]")) {
        state.selectedEdge = event.target.closest("[data-edge]").dataset.edge;
        click("edge-label");
      }
    },
    true,
  );
  return {
    render,
    beforeRender: pro.beforeRender,
    saved: pro.updateUndo,
    nodeSaved: (id) => { pro.enhance(new Set([id])); updateEdges(); },
    taskSaved: (id) => {
      pro.enhance(
        new Set(
          (board()?.nodes || [])
            .filter((n) => n.task === id || n.type === "query")
            .map((n) => n.id),
        ),
      );
      updateEdges();
    },
    finaliseDraft: (id) => pro.click("convert", { dataset: { id } }),
    edit: pro.edit,
    selection,
    click,
    visible: pro.visible,
    edges: pro.edges,
    camera: pro.camera,
    busy: () =>
      !!drag ||
      drawing.busy() ||
      pen.busy() ||
      controls.busy() ||
      pro.busy() ||
      state.cameraAnimating ||
      state.gridResizing ||
      state.toolDragging,
  };
}
