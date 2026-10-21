import { boardCapacity } from "./board-capacity.js";
import { setBoardExpanded } from "./view-layout.js";
import { newGrid, syncGrid, cellAt, GRID_DEFAULT_SIZE } from "./grid-model.js";
import { routeEdge } from "./canvas-geometry.js";
import { canvasToolDrag } from "./canvas-tool-drag.js";
// Navigation preferences belong to the browser, never to the shared board.
export function canvasControls(ctx, basic) {
  const {
    state,
    storage,
    board,
    $,
    $$,
    updateCamera,
    zoom,
    fitBoard,
    renderView,
    changeBoard,
    toast,
    icon,
  } = ctx;
  let space = false,
    pan = null,
    minimap = true,
    grid = true,
    expanded = false,
    nativeFull = false,
    displayKey = null;
  const preferenceKey = () => `board-display:${state.project.id}:${board().id}`;
  function saveDisplay() {
    if (board()) storage.set(preferenceKey(), { minimap, grid, expanded });
  }
  const capacity = boardCapacity();
  const placement = ["sticky", "text", "shape", "grid"];
  const editable = "input,textarea,select,[contenteditable],.inline-editing";
  const chrome = `${editable},.board-tools,#pen-tools,.inline-floating-tools,#selection-tools,button,a,.canvas-panel,.canvas-find,.canvas-filters,#canvas-presence,#presentation-controls`;
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const active = () => ["board", "drawing"].includes(state.view) && board() && $("#canvas");
  // Programmatic focus during a drag can retain the browser's keyboard ring.
  // Show the canvas indicator only after actual Tab navigation.
  window.addEventListener(
    "pointerdown",
    () => $("#canvas")?.classList.remove("keyboard-focus"),
    true,
  );
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Tab") $("#canvas")?.classList.add("keyboard-focus");
    },
    true,
  );
  const call = (action) =>
    Promise.resolve(basic.action(action)).catch((e) => toast(e.message, true));
  const toolDrag = canvasToolDrag(ctx, place, (taskId, event) => {
    basic.selected.clear();
    const node = ctx.addNode("task", taskId, basic.point(event));
    if (node)
      $(`[data-node="${CSS.escape(node.id)}"]`)?.focus({ preventScroll: true });
  });
  function render() {
    const canvas = $("#canvas");
    if (!canvas) return;
    const key = preferenceKey();
    if (displayKey !== key) {
      const saved = storage.get(key, {}) || {};
      minimap = saved.minimap !== false;
      grid = saved.grid !== false;
      expanded = saved.expanded === true;
      displayKey = key;
    }
    canvas.classList.toggle(
      "placing",
      placement.includes(state.tool) ||
        ["frame", "project-frame"].includes(state.tool),
    );
    canvas.classList.toggle(
      "pan-mode",
      space || state.tool === "hand" || !!pan,
    );
    canvas.classList.toggle("grid-hidden", !grid);
    $("#canvas-minimap")?.classList.toggle("hidden", !minimap);
    canvas.classList.toggle("board-expanded", expanded);
    setBoardExpanded(expanded);
    if (!$("#board-expand"))
      $(".board-controls")?.insertAdjacentHTML(
        "beforeend",
        '<button id="board-expand" type="button" class="icon-button" data-board-display="expand"></button><button class="button small" data-board-display="fullscreen" aria-label="Full screen">⛶</button>',
      );
    if (!$("#expanded-board-settings"))
      $(".board-controls")?.insertAdjacentHTML(
        "beforeend",
        `<button id="expanded-board-settings" type="button" class="button small" data-feature="board-settings" aria-label="Board settings" title="Board settings">${icon("settings")}</button>`,
      );
    const expandButton = $("#board-expand");
    const expandLabel = expanded ? "Exit expanded view" : "Expand board";
    expandButton.innerHTML = icon(expanded ? "shrink" : "expand");
    expandButton.setAttribute("aria-label", expandLabel);
    expandButton.setAttribute("aria-pressed", String(expanded));
    expandButton.title = expandLabel;
    position();
    const keys = {
      cursor: "V",
      hand: "H",
      sticky: "N",
      text: "T",
      shape: "S / R",
      connect: "L",
      draw: "P",
    };
    for (const el of $$(".board-tools [data-tool]")) {
      el.classList.toggle("active", el.dataset.tool === state.tool);
      el.title = `${el.getAttribute("aria-label") || el.dataset.tool}${keys[el.dataset.tool] ? ` (${keys[el.dataset.tool]})` : ""}`;
    }
    capacity.render(canvas, board().nodes.length);
    position();
  }
  function tool(value) {
    state.tool = value;
    state.connectFrom = null;
    renderView(true);
    $("#canvas")?.focus({ preventScroll: true });
  }
  function position() {
    const navigationHeight = $(".board-controls")?.offsetHeight;
    if (navigationHeight) $("#canvas")?.style.setProperty("--board-controls-height", `${navigationHeight}px`);
    capacity.position();
    // Grid handles need screen-sized targets; unrelated task cards do not.
    const gridHitSize = `${8 / state.camera.z}px`;
    for (const grid of $$(".board-node.grid"))
      if (grid.style.getPropertyValue("--grid-hit-size") !== gridHitSize)
        grid.style.setProperty("--grid-hit-size", gridHitSize);
    const toolbar = $("#selection-tools"),
      canvas = $("#canvas"),
      nodes = basic.pick();
    for (const edge of basic.pickEdges()) {
      const a = board().nodes.find((n) => n.id === edge.from),
        b = board().nodes.find((n) => n.id === edge.to);
      if (a && b) {
        const p = routeEdge(
          edge,
          a.collapsed ? { ...a, h: 48 } : a,
          b.collapsed ? { ...b, h: 48 } : b,
        );
        const box = $(
          `path.canvas-edge[data-edge="${CSS.escape(edge.id)}"]`,
        )?.getBBox();
        const points = [p.p, p.q, ...(edge.bends || [])];
        nodes.push(
          box
            ? { x: box.x, y: box.y, w: box.width, h: box.height }
            : {
                x: Math.min(...points.map((p) => p.x)),
                y: Math.min(...points.map((p) => p.y)),
                w:
                  Math.max(...points.map((p) => p.x)) -
                  Math.min(...points.map((p) => p.x)),
                h:
                  Math.max(...points.map((p) => p.y)) -
                  Math.min(...points.map((p) => p.y)),
              },
        );
      }
    }
    if (!toolbar || !canvas || !nodes.length) return;
    const left =
      Math.min(...nodes.map((n) => n.x)) * state.camera.z + state.camera.x;
    const right =
      Math.max(...nodes.map((n) => n.x + n.w)) * state.camera.z +
      state.camera.x;
    const top =
      Math.min(
        ...nodes.map(
          (n) =>
            n.y * state.camera.z +
            (n.type === "grid" ? Math.min(0, 24 * state.camera.z - 24) : 0),
        ),
      ) + state.camera.y;
    const bottom =
      Math.max(...nodes.map((n) => n.y + n.h)) * state.camera.z +
      state.camera.y;
    const width = toolbar.offsetWidth,
      height = toolbar.offsetHeight,
      handleGap = Math.max(
        12,
        (matchMedia("(pointer: coarse)").matches ? 18 : 13) * state.camera.z +
          4,
      );
    let y =
      top -
      height -
      handleGap -
      (nodes.some((n) => n.type === "grid") ? 26 : 0);
    const safeTop = canvas.clientWidth < 600 ? 160 : 110;
    if (y < safeTop) y = bottom + handleGap;
    toolbar.style.left = `${Math.max(12, Math.min(canvas.clientWidth - width - 12, (left + right - width) / 2))}px`;
    toolbar.style.top = `${Math.max(safeTop, Math.min(canvas.clientHeight - height - 70, y))}px`;
    basic.positionMenus?.();
  }
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-board-display]");
    if (!button || !active()) return;
    if (
      button.dataset.boardDisplay === "fullscreen" &&
      !document.fullscreenElement
    ) {
      expanded = true;
      saveDisplay();
      render();
      try {
        await document.documentElement.requestFullscreen();
        nativeFull = true;
      } catch {
        toast(
          "Expanded to fill the window. Browser full screen is unavailable here.",
        );
      }
    } else {
      expanded = !expanded;
      saveDisplay();
      if (document.fullscreenElement) await document.exitFullscreen();
      render();
    }
  });
  document.addEventListener("fullscreenchange", () => {
    if (nativeFull && !document.fullscreenElement) {
      nativeFull = false;
      expanded = false;
      saveDisplay();
    }
    if (active()) render();
  });
  window.addEventListener("resize", position);
  document.addEventListener(
    "click",
    (e) => {
      const add = e.target.closest('[data-action="board-add"]');
      if (active() && add) {
        stop(e);
        tool(add.dataset.tool);
      }
    },
    true,
  );
  document.addEventListener(
    "wheel",
    (e) => {
      if (!active() || !e.target.closest("#canvas")) return;
      // Scrolling an editor or panel must not move the board behind it.
      if (e.target.closest(chrome)) {
        e.stopImmediatePropagation();
        return;
      }
      // Let overflowing card content consume ordinary scrolling, including at
      // its edges. Pinch/Ctrl-wheel still belongs to board zoom.
      if (!e.ctrlKey && !e.metaKey && e.target.closest('.board-node')) {
        for (let el = e.target; el?.closest('.board-node'); el = el.parentElement) {
          const style = getComputedStyle(el);
          if ((/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
              (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1)) {
            e.stopImmediatePropagation();
            return;
          }
        }
      }
      stop(e);
      const line =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? $("#canvas").clientHeight
            : 1;
      const dx = e.deltaX * line,
        dy = e.deltaY * line;
      if (
        window.PencilsAppearance.read().navigation === "trackpad" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        state.camera.x -= dx;
        state.camera.y -= dy;
        updateCamera();
      } else if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Some platforms translate Shift-wheel into deltaX.
        state.camera.y -= dy || dx;
        updateCamera();
      } else {
        const r = $("#canvas").getBoundingClientRect();
        zoom(
          Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.002),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      }
    },
    { capture: true, passive: false },
  );
  function place(e) {
    if (!placement.includes(state.tool)) return;
    const p = basic.point(e),
      type = state.tool,
      id = basic.uid("n");
    basic.selected.clear();
    basic.selected.add(id);
    changeBoard((b) => {
      b.nodes.push({
        id,
        type,
        x: Math.round(p.x),
        y: Math.round(p.y),
        w: type === "grid" ? GRID_DEFAULT_SIZE.w : type === "text" ? 360 : 220,
        h: type === "grid" ? GRID_DEFAULT_SIZE.h : type === "text" ? 90 : 180,
        ...(type === "grid" ? { grid: newGrid() } : {}),
        text: "",
        ...(type === "sticky" ? { color: "#f5e7a2" } : {}),
      });
      if (type === "grid") syncGrid(b.nodes.at(-1));
      else {
        const target = b.nodes
          .filter((n) => n.type === "grid" && !n.locked)
          .sort((a, b) => a.w * a.h - b.w * b.h)
          .map((grid) => ({ grid, cell: cellAt(grid, p.x, p.y) }))
          .find((t) => t.cell);
        if (target) {
          b.nodes.at(-1).frame = target.grid.id;
          b.nodes.at(-1).gridCell = target.cell;
        }
      }
      state.selectedNode = id;
      {
        state.selectedEdge = null;
        state.selectedEdges?.clear();
      }
      state.tool = "cursor";
    });
    if (type !== "grid") call("inline");
  }
  document.addEventListener(
    "pointerdown",
    (e) => {
      const canvas = e.target.closest("#canvas");
      if (
        !active() ||
        !canvas ||
        e.target.closest(chrome) ||
        state.canvasEditing
      )
        return;
      if (
        e.pointerType !== "touch" &&
        (e.button === 2 ||
          e.button === 1 ||
          (e.button === 0 && (space || state.tool === "hand")))
      ) {
        stop(e);
        pan = {
          id: e.pointerId,
          x: e.clientX,
          y: e.clientY,
          camera: { ...state.camera },
          clearOnClick:
            e.button === 0 &&
            !space &&
            !e.target.closest("[data-node],[data-edge]"),
          moved: false,
        };
        canvas.setPointerCapture(e.pointerId);
        canvas.focus({ preventScroll: true });
        render();
      } else if (
        e.button === 0 &&
        e.pointerType !== "touch" &&
        placement.includes(state.tool)
      ) {
        stop(e);
        place(e);
      }
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!pan || pan.id !== e.pointerId) return;
      stop(e);
      if (Math.hypot(e.clientX - pan.x, e.clientY - pan.y) > 4)
        pan.moved = true;
      state.camera.x = pan.camera.x + e.clientX - pan.x;
      state.camera.y = pan.camera.y + e.clientY - pan.y;
      updateCamera();
    },
    true,
  );
  function end(e) {
    if (!pan || (e && pan.id !== e.pointerId)) return;
    if (e) stop(e);
    if (e?.type === "pointerup" && active()) {
      state.camera.x = pan.camera.x + e.clientX - pan.x;
      state.camera.y = pan.camera.y + e.clientY - pan.y;
      updateCamera();
      if (
        pan.clearOnClick &&
        !pan.moved &&
        Math.hypot(e.clientX - pan.x, e.clientY - pan.y) <= 4
      )
        basic.clearSelection();
    }
    pan = null;
    if (active()) render();
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    document.addEventListener(name, end, true);
  document.addEventListener("contextmenu", (e) => {
    if (active() && e.target.closest("#canvas") && !e.target.closest(chrome))
      e.preventDefault();
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        !active() ||
        state.dialog ||
        state.canvasEditing ||
        e.target.closest(editable + ",.board-task-editor")
      )
        return;
      if ($("#canvas").classList.contains("presenting")) return;
      const cmd = e.ctrlKey || e.metaKey,
        k = e.key.toLowerCase();
      let action = null;
      if (e.code === "Space" && !cmd && !e.altKey) {
        stop(e);
        space = true;
        render();
        return;
      }
      if (cmd && k === "g")
        action = () => basic.click(e.shiftKey ? "ungroup" : "group");
      else if (cmd && e.shiftKey && k === "l")
        action = () => basic.click("lock");
      else if (cmd && k === "f") action = () => call("search-open");
      else if (cmd && e.code === "Digit0")
        action = () => zoom(1 / state.camera.z);
      else if (cmd && ["+", "=", "-"].includes(k))
        action = () => zoom(k === "-" ? 1 / 1.2 : 1.2);
      else if (e.altKey && e.code === "Digit1") action = fitBoard;
      else if (e.altKey && e.code === "Digit2")
        action = () => call("zoom-selection");
      else if (e.key === "F1") action = () => call("shortcuts");
      else if (!cmd && !e.altKey) {
        const tools = {
          v: "cursor",
          h: "hand",
          n: "sticky",
          t: "text",
          s: "shape",
          r: "shape",
          l: "connect",
          p: "draw",
          e: "erase",
        };
        if (tools[k]) action = () => tool(tools[k]);
        else if (k === "f") action = () => basic.click("frame-add");
        else if (k === "d")
          action = () => $('[data-action="board-task"]')?.click();
        else if (k === "c" && basic.pick().length)
          action = () => call("comments");
        else if (k === "m")
          action = () => {
            minimap = !minimap;
            saveDisplay();
            render();
          };
        else if (k === "g")
          action = () => {
            grid = !grid;
            saveDisplay();
            render();
          };
        else if (e.key === "Escape")
          action = () => {
            basic.cancel();
            basic.selected.clear();
            state.selectedNode = null;
            {
              state.selectedEdge = null;
              state.selectedEdges?.clear();
            }
            tool("cursor");
          };
        else if (e.key.startsWith("Arrow") && !basic.pick().length)
          action = () => {
            const step = e.shiftKey ? 100 : 40;
            state.camera.x +=
              e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
            state.camera.y +=
              e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
            updateCamera();
          };
      }
      if (e.key === "Escape" && expanded)
        action = () => {
          expanded = false;
          saveDisplay();
          if (document.fullscreenElement) document.exitFullscreen();
          render();
        };
      if (action) {
        stop(e);
        if (!e.repeat || e.key.startsWith("Arrow")) action();
      }
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (e) => {
      if (e.code === "Space") {
        space = false;
        if (active()) render();
      }
    },
    true,
  );
  window.addEventListener("blur", () => {
    space = false;
    end();
    if (active()) render();
  });
  return {
    render,
    place,
    position,
    display: () => ({ grid, minimap }),
    setDisplay: (settings) => {
      grid = settings.grid;
      minimap = settings.minimap;
      saveDisplay();
      render();
    },
    busy: ({ allowNavigation = false } = {}) =>
      (!allowNavigation && !!pan) || toolDrag.busy(),
  };
}
