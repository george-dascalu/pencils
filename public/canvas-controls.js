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
    storage.set(preferenceKey(), { minimap, grid, expanded });
  }
  const placement = ["sticky", "text", "shape"];
  const editable = "input,textarea,select,[contenteditable],.inline-editing";
  const chrome = `${editable},#selection-tools,button,a,.canvas-panel,.canvas-find,.canvas-filters,#canvas-presence,#presentation-controls`;
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const active = () => state.view === "board" && board() && $("#canvas");
  const call = (action) =>
    Promise.resolve(basic.action(action)).catch((e) => toast(e.message, true));
  const toolDrag = canvasToolDrag(ctx, place);
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
    canvas.classList.toggle("placing", placement.includes(state.tool));
    canvas.classList.toggle(
      "pan-mode",
      space || state.tool === "hand" || !!pan,
    );
    canvas.classList.toggle("grid-hidden", !grid);
    $("#canvas-minimap")?.classList.toggle("hidden", !minimap);
    canvas.classList.toggle("board-expanded", expanded);
    if (!$("#board-expand"))
      $(".board-controls")?.insertAdjacentHTML(
        "beforeend",
        '<button id="board-expand" class="button small" data-board-display="expand">Expand board</button><button class="button small" data-board-display="fullscreen" aria-label="Full screen">⛶</button>',
      );
    $("#board-expand").textContent = expanded
      ? "Exit expanded view"
      : "Expand board";
    position();
    const keys = {
      cursor: "V",
      hand: "H",
      sticky: "N",
      text: "T",
      shape: "S / R",
      connect: "L",
    };
    for (const el of $$(".board-tools [data-tool]")) {
      el.classList.toggle("active", el.dataset.tool === state.tool);
      el.title = `${el.getAttribute("aria-label") || el.dataset.tool} (${keys[el.dataset.tool] || ""})`;
    }
    const help = $(".board-help");
    if (help)
      help.textContent = placement.includes(state.tool)
        ? "Click to place · Esc to cancel"
        : "V select · H hand · Scroll zoom · Shift-scroll pan · F1 shortcuts";
  }
  function tool(value) {
    state.tool = value;
    state.connectFrom = null;
    renderView(true);
    $("#canvas")?.focus({ preventScroll: true });
  }
  function position() {
    const toolbar = $("#selection-tools"),
      canvas = $("#canvas"),
      nodes = basic.pick();
    if (!toolbar || !canvas || !nodes.length) return;
    const left =
      Math.min(...nodes.map((n) => n.x)) * state.camera.z + state.camera.x;
    const right =
      Math.max(...nodes.map((n) => n.x + n.w)) * state.camera.z +
      state.camera.x;
    const top =
      Math.min(...nodes.map((n) => n.y)) * state.camera.z + state.camera.y;
    const bottom =
      Math.max(...nodes.map((n) => n.y + n.h)) * state.camera.z +
      state.camera.y;
    const width = toolbar.offsetWidth,
      height = toolbar.offsetHeight;
    let y = top - height - 12;
    const safeTop = canvas.clientWidth < 600 ? 160 : 110;
    if (y < safeTop) y = bottom + 12;
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
      ((nativeFull = false), (displayKey = null));
      const preferenceKey = () =>
        `board-display:${state.project.id}:${board().id}`;
      function saveDisplay() {
        storage.set(preferenceKey(), { minimap, grid, expanded });
      }
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
      stop(e);
      const line =
        e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? $("#canvas").clientHeight
            : 1;
      const dx = e.deltaX * line,
        dy = e.deltaY * line;
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Some platforms translate Shift-wheel into deltaX.
        state.camera.y -= dy || dx;
        updateCamera();
      } else {
        const r = $("#canvas").getBoundingClientRect();
        zoom(
          Math.exp(-Math.max(-300, Math.min(300, dy)) * 0.007),
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
        w: type === "text" ? 360 : 220,
        h: type === "text" ? 90 : 180,
        text: "",
        ...(type === "sticky" ? { color: "#f5e7a2" } : {}),
      });
      state.selectedNode = id;
      state.selectedEdge = null;
      state.tool = "cursor";
    });
    call("inline");
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
        e.target.closest(editable)
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
      else if (cmd && k === "f") action = () => $("#canvas-find")?.focus();
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
            state.selectedEdge = null;
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
  return { render, place, position, busy: () => !!pan || toolDrag.busy() };
}
