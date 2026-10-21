import { bounds, frameParents, hiddenByFrame } from "./canvas-geometry.js";
import { withFrameContents, reflowGridContents } from "./frame-model.js";
import { nodeMinimum } from "./node-layout.js";
export function boardLayoutTools(ctx, basic) {
  const {
    state,
    board,
    $,
    esc,
    changeBoard,
    showDialog,
    dialogHead,
    closeDialog,
    boardSnapshot,
    remember,
    saveBoard,
    renderView,
    toast,
  } = ctx;
  let drag = null;
  const choose = (nodes) => {
    basic.selected.clear();
    nodes.forEach((n) => basic.selected.add(n.id));
    state.selectedNode = nodes[0]?.id || null;
    {
      state.selectedEdge = null;
      state.selectedEdges?.clear();
    }
    basic.focusSelection();
  };
  function render() {
    const outline = $(".multi-resize-box");
    const nodes = basic.pick();
    if (nodes.length < 2 || nodes.some((n) => n.locked) || !$("#canvas-world")) {
      outline?.remove();
      return;
    }
    const box = bounds(nodes);
    if (!outline) $("#canvas-world").insertAdjacentHTML(
      "beforeend",
      `<div class="multi-resize-box" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px">${["nw", "ne", "sw", "se"].map((c) => `<span class="resize-handle" data-group-resize="${c}" data-resize-corner="${c}" aria-label="Resize selection from ${c}"></span>`).join("")}</div>`,
    );
    else for (const [property, value] of Object.entries({ left: box.x, top: box.y, width: box.w, height: box.h }))
      if (outline.style[property] !== `${value}px`) outline.style[property] = `${value}px`;
  }
  function layers() {
    const b = board();
    showDialog(
      `<dialog class="dialog"><form id="board-layers-form">${dialogHead("Layers")}<div class="dialog-body"><p>Assign selected objects to a layer. Containers carry their contents.</p><label class="field">New layer<input name="name" maxlength="80" required></label><button class="button" type="submit">Create layer</button>${(b.layers || []).map((l) => `<div class="layer-row"><strong>${esc(l.name)}</strong><button type="button" data-layer-action="assign" data-layer="${esc(l.id)}">Assign selection</button><button type="button" data-layer-action="hide" data-layer="${esc(l.id)}" aria-pressed="${!!l.hidden}">${l.hidden ? "Show" : "Hide"}</button><button type="button" data-layer-action="lock" data-layer="${esc(l.id)}" aria-pressed="${!!l.locked}">${l.locked ? "Unlock" : "Lock"}</button><button type="button" data-layer-action="remove" data-layer="${esc(l.id)}">Remove layer</button></div>`).join("")}<button type="button" data-layer-action="assign" data-layer="">Move selection out of layers</button></div></form></dialog>`,
      "board-layers",
    );
  }
  function layerState(n, l) {
    n.layerHidden = !!l?.hidden;
    if (l?.locked && n.layerLocked !== true) {
      n.beforeLayerLocked = !!n.locked;
      n.locked = true;
      n.layerLocked = true;
    }
    if (!l?.locked && n.layerLocked) {
      n.locked = !!n.beforeLayerLocked;
      delete n.beforeLayerLocked;
      delete n.layerLocked;
    }
  }
  document.addEventListener("submit", (e) => {
    if (e.target.id === "board-layers-form") {
      e.preventDefault();
      const name = new FormData(e.target).get("name").trim();
      if (!name) return;
      changeBoard((b) => {
        (b.layers ||= []).push({ id: basic.uid("layer"), name });
      });
      layers();
    }
    if (e.target.id === "bulk-stickies-form") {
      e.preventDefault();
      const texts = new FormData(e.target)
        .get("text")
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      if (texts.length > 100) return toast("Paste up to 100 lines at a time.");
      const r = $("#canvas").getBoundingClientRect(),
        p = basic.point({ clientX: r.left + 160, clientY: r.top + 120 }),
        nodes = texts.map((text, i) => ({
          id: basic.uid("n"),
          type: "sticky",
          text,
          x: p.x + (i % 5) * 260,
          y: p.y + Math.floor(i / 5) * 200,
          w: 240,
          h: 180,
          color: "#f5e7a2",
        }));
      closeDialog(true);
      changeBoard((b) => b.nodes.push(...nodes));
      choose(nodes);
    }
  });
  document.addEventListener("click", (e) => {
    const action = e.target.closest("[data-layout-tool]")?.dataset.layoutTool;
    if (action === "layers") layers();
    if (action === "bulk-notes")
      showDialog(
        `<dialog class="dialog"><form id="bulk-stickies-form">${dialogHead("Create sticky notes")}<div class="dialog-body"><label class="field">One note per line<textarea name="text" rows="10" required maxlength="60000"></textarea></label></div><div class="dialog-foot"><button class="button primary">Create notes</button></div></form></dialog>`,
        "bulk-stickies",
      );
    if (["match-width", "match-height", "tidy"].includes(action)) {
      const nodes = basic.pick().filter((n) => !n.locked);
      if (nodes.length < 2) return;
      const columns = Math.max(
          1,
          Math.min(
            20,
            +$("#tidy-columns")?.value || Math.ceil(Math.sqrt(nodes.length)),
          ),
        ),
        gap = Math.max(0, Math.min(1000, +$("#tidy-gap")?.value || 24));
      changeBoard((b) => {
        const before = structuredClone(b.nodes),
          box = bounds(nodes),
          w = Math.max(...nodes.map((n) => n.w)),
          h = Math.max(...nodes.map((n) => n.h));
        nodes.forEach((n, i) => {
          if (action === "match-width") n.w = w;
          if (action === "match-height") n.h = h;
          if (action === "tidy") {
            n.x = box.x + (i % columns) * (w + gap);
            n.y = box.y + Math.floor(i / columns) * (h + gap);
          }
        });
        const parents = frameParents(before),
          selected = new Set(nodes.map((n) => n.id));
        for (const n of b.nodes) {
          if (selected.has(n.id)) continue;
          let p = parents.get(n.id),
            seen = new Set();
          while (p && !seen.has(p)) {
            seen.add(p);
            if (selected.has(p)) {
              const a = b.nodes.find((x) => x.id === p),
                old = before.find((x) => x.id === p);
              n.x += a.x - old.x;
              n.y += a.y - old.y;
              break;
            }
            p = parents.get(p);
          }
        }
        for (const grid of b.nodes.filter((n) => n.type === "grid"))
          reflowGridContents(b.nodes, grid, before);
      });
    }
    const button = e.target.closest("[data-layer-action]");
    if (!button) return;
    changeBoard((b) => {
      const l = b.layers?.find((l) => l.id === button.dataset.layer),
        op = button.dataset.layerAction;
      if (op === "assign")
        for (const n of withFrameContents(b.nodes, basic.pick())) {
          layerState(n, null);
          n.layer = l?.id;
          layerState(n, l);
        }
      else if (l) {
        if (op === "hide") l.hidden = !l.hidden;
        if (op === "lock") l.locked = !l.locked;
        for (const n of b.nodes.filter((n) => n.layer === l.id)) {
          layerState(n, op === "remove" ? null : l);
          if (op === "remove") delete n.layer;
        }
        if (op === "remove") b.layers = b.layers.filter((x) => x !== l);
      }
    });
    layers();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      const h = e.target.closest("[data-group-resize]");
      if (!h || e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const nodes = withFrameContents(board().nodes, basic.pick());
      if (nodes.some((n) => n.locked)) return;
      drag = {
        pointer: e.pointerId,
        capture: $("#canvas"),
        start: basic.point(e),
        corner: h.dataset.groupResize,
        nodes,
        old: structuredClone(nodes),
        box: bounds(basic.pick()),
        before: boardSnapshot(),
      };
      state.toolDragging = true;
      drag.capture.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || drag.pointer !== e.pointerId) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const d = drag,
        p = basic.point(e),
        west = d.corner.includes("w"),
        north = d.corner.includes("n"),
        dx = (p.x - d.start.x) * (west ? -1 : 1),
        dy = (p.y - d.start.y) * (north ? -1 : 1);
      let sx = Math.max(0.05, (d.box.w + dx) / d.box.w),
        sy = Math.max(0.05, (d.box.h + dy) / d.box.h);
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) sy = 1;
        else sx = 1;
      }
      sx = Math.max(sx, ...d.old.map((n) => nodeMinimum(n).w / n.w));
      sy = Math.max(sy, ...d.old.map((n) => nodeMinimum(n).h / n.h));
      const ax = d.box.x + (west ? d.box.w : 0),
        ay = d.box.y + (north ? d.box.h : 0);
      d.nodes.forEach((n, i) => {
        const o = d.old[i];
        Object.assign(n, {
          x: ax + (o.x - ax) * sx,
          y: ay + (o.y - ay) * sy,
          w: o.w * sx,
          h: o.h * sy,
        });
        if (n.type === "draw")
          n.points = o.points.map((p) => [p[0] * sx, p[1] * sy]);
      });
      basic.moveDOM();
      render();
    },
    true,
  );
  function finish(e, cancel = false) {
    if (!drag || (e?.pointerId != null && e.pointerId !== drag.pointer)) return;
    e?.stopImmediatePropagation();
    const d = drag;
    drag = null;
    state.toolDragging = false;
    if (d.capture?.hasPointerCapture(d.pointer))
      d.capture.releasePointerCapture(d.pointer);
    if (cancel) d.nodes.forEach((n, i) => Object.assign(n, d.old[i]));
    else {
      remember(d.before);
      saveBoard();
    }
    renderView();
  }
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", (e) => finish(e, true), true);
  window.addEventListener("blur", () => finish(null, true));
  window.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        e.preventDefault();
        finish(e, true);
        return;
      }
      if (
        !["board", "drawing"].includes(state.view) ||
        state.dialog ||
        (e.key === "Tab" && (e.ctrlKey || e.metaKey || e.altKey)) ||
        e.target.closest('input,textarea,select,[contenteditable="true"]')
      )
        return;
      if (
        e.target.closest("[data-grid-axis]") &&
        e.altKey &&
        !e.shiftKey &&
        e.key.startsWith("Arrow")
      )
        return;
      const prefs = window.PencilsAppearance.read();
      if (
        prefs.singleKeys === false &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key !== " "
      ) {
        e.stopImmediatePropagation();
        return;
      }
      const nodes = board()?.nodes || [],
        hidden = hiddenByFrame(nodes, frameParents(nodes)),
        visible = nodes.filter((n) => !hidden.has(n.id));
      const current = basic.pick()[0];
      if (
        e.key === "Tab" &&
        (e.target.closest(".board-node") || e.target.id === "canvas")
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const i = visible.findIndex((n) => n.id === current?.id);
        choose(
          [
            visible[
              (i + (e.shiftKey ? -1 : 1) + visible.length) % visible.length
            ],
          ].filter(Boolean),
        );
      }
      if (e.altKey && !e.shiftKey && e.key === "ArrowUp" && current?.frame) {
        e.preventDefault();
        e.stopImmediatePropagation();
        choose(nodes.filter((n) => n.id === current.frame));
      }
      if (e.altKey && !e.shiftKey && e.key === "ArrowDown" && current) {
        const child = nodes.find(
          (n) => n.frame === current.id && !hidden.has(n.id),
        );
        if (child) {
          e.preventDefault();
          e.stopImmediatePropagation();
          choose([child]);
        }
      }
      if (
        e.altKey &&
        e.shiftKey &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        changeBoard((b) => {
          const before = structuredClone(b.nodes);
          for (const n of basic.pick().filter((n) => !n.locked)) {
            const min = nodeMinimum(n);
            n.w = Math.max(
              min.w,
              n.w +
                (e.key === "ArrowRight" ? 10 : e.key === "ArrowLeft" ? -10 : 0),
            );
            n.h = Math.max(
              min.h,
              n.h +
                (e.key === "ArrowDown" ? 10 : e.key === "ArrowUp" ? -10 : 0),
            );
          }
          for (const grid of b.nodes.filter((n) => n.type === "grid"))
            reflowGridContents(b.nodes, grid, before);
        });
      }
    },
    true,
  );
  return { render };
}
