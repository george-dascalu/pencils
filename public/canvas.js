import { selectionToolbar } from "./selection-toolbar.js";
import { arrangeSelection, arrangementActions } from "./selection-arrange.js";
import { canvasControls } from "./canvas-controls.js";
import { canvasPro } from "./canvas-pro.js";
import { encodeCanvas } from "./canvas-format.js";
export function canvasFeatures(ctx) {
  const {
    state,
    board,
    task,
    esc,
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
  const selected = new Set();
  let drag = null,
    space = false;
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
  const toolbar = selectionToolbar(ctx, pick);
  const controls = canvasControls(ctx, {
    selected,
    pick,
    point,
    uid,
    click,
    positionMenus: toolbar.positionMenus,
    cancel: () => end(null, true),
    action: (action) => pro.click(action),
  });
  const pro = canvasPro(ctx, {
    selected,
    pick,
    point,
    focusNode,
    uid,
    selection,
    click,
    enhanceBase,
    flush: ctx.flushBoard,
    busy: () => !!drag || controls.busy(),
    cancel: () => end(null, true),
    place: controls.place,
    positionToolbar: controls.position,
  });
  function enhanceBase() {
    const nodes = new Map((board()?.nodes || []).map((n) => [n.id, n]));
    for (const el of $$(".board-node")) {
      const n = nodes.get(el.dataset.node);
      if (!n) continue;
      if (n.type === "image")
        el.innerHTML = `<img draggable="false" src="/api/projects/${state.project.id}/${esc(n.src)}" alt="${esc(n.text || "Board image")}">`;
      if (n.type === "draw")
        el.innerHTML = `<svg viewBox="0 0 ${n.w} ${n.h}" preserveAspectRatio="none">${n.points
          .slice(1)
          .map(
            (p, i) =>
              `<path d="M${n.points[i][0]},${n.points[i][1]} L${p[0]},${p[1]}" stroke="${n.color || "#263c34"}" stroke-width="${1 + (n.pressures?.[i] ?? 0.5) * 5}" stroke-linecap="round" fill="none"/>`,
          )
          .join("")}</svg>`;
      el.classList.toggle("locked", !!n.locked);
    }
  }
  function selection() {
    if (state.selectedNode && !selected.has(state.selectedNode)) {
      selected.clear();
      selected.add(state.selectedNode);
    }
    for (const id of selected)
      if (!board()?.nodes.some((n) => n.id === id)) selected.delete(id);
    $$(".board-node").forEach((el) => {
      el.classList.toggle("selected", selected.has(el.dataset.node));
      el.querySelector(".resize-handle")?.remove();
      if (selected.has(el.dataset.node))
        el.insertAdjacentHTML(
          "beforeend",
          '<span class="resize-handle" aria-label="Resize object" role="separator"></span>',
        );
    });
    toolbar.render();
    pro.selection();
    controls.position();
  }
  function render() {
    if (!board() || !$("#canvas")) return;
    $("#canvas-extras")?.remove();
    $(".board-toolbar")?.insertAdjacentHTML(
      "afterend",
      `<div id="canvas-extras" class="canvas-extra-tools"><button class="button small" data-feature="frame-add">Frame</button><button class="button small ${state.tool === "draw" ? "primary" : ""}" data-feature="draw-tool">Draw</button><button class="button small" data-feature="image-add">Image</button><label><input type="checkbox" id="canvas-snap" ${snapEnabled() ? "checked" : ""}> Snap</label><select id="frame-nav" aria-label="Jump to frame"><option value="">Jump to frame…</option>${board()
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
    if (state.selectedEdge)
      $(".board-selection")?.insertAdjacentHTML(
        "afterbegin",
        '<button class="button small" data-feature="edge-label">Edit label</button>',
      );
    selection();
    pro.render();
    controls.render();
    layout.render();
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
        el.style.height = `${n.h}px`;
      }
    }
    updateEdges();
    controls.position();
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      const canvas = event.target.closest("#canvas");
      if (
        !canvas ||
        event.button !== 0 ||
        event.target.closest(
          "button,input,select,textarea,a,[contenteditable],.canvas-panel,.canvas-find,.canvas-filters",
        ) ||
        space ||
        state.tool === "hand" ||
        state.tool === "connect"
      )
        return;
      const el = event.target.closest("[data-node]");
      if (event.target.closest("[data-edge]")) return;
      event.stopImmediatePropagation();
      event.preventDefault();
      const p = point(event);
      if (el) {
        const n = board().nodes.find((n) => n.id === el.dataset.node);
        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          selected.has(n.id) ? selected.delete(n.id) : selected.add(n.id);
          state.selectedNode = [...selected][0] || null;
          selection();
          return;
        }
        if (!selected.has(n.id)) {
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
        const ids = new Set(selected);
        for (const frame of pick().filter((n) => n.type === "frame"))
          for (const child of board().nodes)
            if (
              child.id !== frame.id &&
              child.x >= frame.x &&
              child.y >= frame.y &&
              child.x + child.w <= frame.x + frame.w &&
              child.y + child.h <= frame.y + frame.h
            )
              ids.add(child.id);
        // Include explicitly nested frames and descendants even outside their visual bounds.
        for (let changed = true; changed;) {
          changed = false;
          for (const child of board().nodes)
            if (child.frame && ids.has(child.frame) && !ids.has(child.id)) {
              ids.add(child.id);
              changed = true;
            }
        }
        drag = {
          type: event.target.closest(".resize-handle") ? "resize" : "move",
          id: n.id,
          start: p,
          before: boardSnapshot(),
          ids,
          moved: false,
          duplicate: event.altKey && !event.target.closest(".resize-handle"),
        };
      } else if (state.tool === "draw") {
        drag = {
          type: "draw",
          start: p,
          points: [[p.x, p.y]],
          pressures: [event.pressure || 0.5],
          before: boardSnapshot(),
        };
        canvas.insertAdjacentHTML(
          "beforeend",
          '<svg class="drawing-preview"><polyline fill="none" stroke="#263c34" stroke-width="3"/></svg>',
        );
      } else {
        selected.clear();
        state.selectedNode = null;
        state.selectedEdge = null;
        selection();
        drag = { type: "marquee", start: p };
        canvas.insertAdjacentHTML("beforeend", '<div class="marquee"></div>');
      }
      (el || canvas).setPointerCapture(event.pointerId);
      canvas.focus({ preventScroll: true });
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (!drag) return;
      event.stopImmediatePropagation();
      const p = point(event),
        dx = p.x - drag.start.x,
        dy = p.y - drag.start.y;
      if (drag.type === "move" || drag.type === "resize") {
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.moved && drag.duplicate) {
          drag.duplicate = false;
          const source = board().nodes.filter(
            (n) => drag.ids.has(n.id) && !n.locked,
          );
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
            return copy;
          });
          board().nodes.push(...copies);
          board().edges.push(
            ...board()
              .edges.filter((e) => ids.has(e.from) && ids.has(e.to))
              .map((e) => ({
                ...structuredClone(e),
                id: uid("e"),
                from: ids.get(e.from),
                to: ids.get(e.to),
              })),
          );
          drag.origins = structuredClone(copies);
          drag.ids = new Set(ids.values());
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
        const round = (v) =>
          snapEnabled() && !event.altKey
            ? Math.round(v / 20) * 20
            : Math.round(v);
        for (const n of board().nodes.filter(
          (n) => drag.ids.has(n.id) && !n.locked,
        )) {
          const old = (drag.origins || drag.before.nodes).find(
            (x) => x.id === n.id,
          );
          if (drag.type === "resize" && n.id === drag.id) {
            n.w = Math.max(40, round(old.w + dx));
            n.h = Math.max(30, round(old.h + dy));
            if (n.type === "draw")
              n.points = old.points.map(([x, y]) => [
                (x * n.w) / old.w,
                (y * n.h) / old.h,
              ]);
          } else if (drag.type === "move") {
            n.x = round(old.x + dx);
            n.y = round(old.y + dy);
          }
        }
        moveDOM();
      } else if (drag.type === "marquee") {
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
        selected.clear();
        for (const n of board().nodes)
          if (n.x >= x && n.y >= y && n.x + n.w <= x + w && n.y + n.h <= y + h)
            selected.add(n.id);
        state.selectedNode = [...selected][0] || null;
        $$(".board-node").forEach((el) =>
          el.classList.toggle("selected", selected.has(el.dataset.node)),
        );
      } else if (drag.type === "draw") {
        if (drag.points.length < 10000) {
          drag.points.push([p.x, p.y]);
          drag.pressures.push(event.pressure || 0.5);
        }
        $(".drawing-preview polyline")?.setAttribute(
          "points",
          drag.points
            .map(
              ([x, y]) =>
                `${x * state.camera.z + state.camera.x},${y * state.camera.z + state.camera.y}`,
            )
            .join(" "),
        );
      }
    },
    true,
  );
  function end(event, cancel = false) {
    if (!drag) return;
    event?.stopImmediatePropagation();
    if (cancel && drag.before) Object.assign(board(), drag.before);
    else if (drag.type === "draw" && drag.points.length > 2) {
      const xs = drag.points.map((p) => p[0]),
        ys = drag.points.map((p) => p[1]),
        x = Math.min(...xs),
        y = Math.min(...ys),
        w = Math.max(40, Math.max(...xs) - x),
        h = Math.max(30, Math.max(...ys) - y);
      remember(drag.before);
      board().nodes.push({
        id: uid("n"),
        type: "draw",
        x,
        y,
        w,
        h,
        points: drag.points.map((p) => [p[0] - x, p[1] - y]),
        pressures: drag.pressures,
        color: "#263c34",
      });
      saveBoard();
    } else if (drag.moved) {
      remember(drag.before);
      saveBoard();
    }
    const redraw = cancel || drag.moved || drag.type === "draw";
    drag = null;
    $(".marquee")?.remove();
    $(".drawing-preview")?.remove();
    if (redraw) renderView(true);
    else selection();
  }
  document.addEventListener("pointerup", (event) => end(event), true);
  document.addEventListener("pointercancel", (event) => end(event, true), true);
  window.addEventListener("blur", () => {
    space = false;
    if (drag) end(null, true);
  });
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        state.view !== "board" ||
        state.dialog ||
        event.target.matches("input,textarea,select,[contenteditable]")
      )
        return;
      if (event.code === "Space") space = true;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopImmediatePropagation();
        for (const n of board().nodes) selected.add(n.id);
        state.selectedNode = [...selected][0];
        selection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        event.stopImmediatePropagation();
        click("duplicate");
      }
      if (["Delete", "Backspace"].includes(event.key) && selected.size > 0) {
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
    if (e.target.id === "canvas-snap") {
      const snap = e.target.checked;
      changeBoard((b) => {
        b.settings = { ...b.settings, snap };
      });
    }
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
  async function image(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 10000000) throw new Error("Use images under 10 MB.");
    let raw = "";
    for (let i = 0; i < bytes.length; i += 8192)
      raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const attachment = await api(route("attachments"), {
      method: "POST",
      body: { name: file.name, data: btoa(raw) },
    });
    const canvas = $("#canvas"),
      x = (canvas.clientWidth / 2 - state.camera.x) / state.camera.z,
      y = (canvas.clientHeight / 2 - state.camera.y) / state.camera.z;
    changeBoard((b) =>
      b.nodes.push({
        id: uid("n"),
        type: "image",
        src: attachment.path,
        text: file.name,
        x,
        y,
        w: 320,
        h: 240,
      }),
    );
  }
  async function svg() {
    const b = board();
    if (!b.nodes.length) throw new Error("Add objects before exporting.");
    const box = bounds(b.nodes),
      w = box.right - box.x + 80,
      h = box.bottom - box.y + 80;
    let content =
      '<defs><marker id="arrowhead" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#78906f"/></marker><marker id="arrowstart" markerWidth="9" markerHeight="9" refX="1" refY="4" orient="auto"><path d="M8 0L0 4L8 8" fill="none" stroke="#78906f"/></marker></defs>' +
      pro.edges(b, true);
    for (const n of b.nodes) {
      let inside = "";
      if (n.type === "image") {
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
        inside = `<image width="${n.w}" height="${n.h}" href="${data}"/>`;
      } else if (n.type === "draw")
        inside = `<polyline points="${n.points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${n.color || "#263c34"}" stroke-width="3"/>`;
      else {
        const text =
            n.type === "task"
              ? task(n.task)?.title || "Removed task"
              : n.text || "",
          lines = text
            .split("\n")
            .flatMap((line) => line.match(/.{1,32}(?:\s|$)|.{1,32}/g) || [""]);
        inside = `<rect width="${n.w}" height="${n.h}" rx="6" fill="${n.type === "frame" ? "#f6f7f2" : n.color || "#ffffff"}" stroke="#82937d"/>${lines
          .slice(0, Math.max(1, Math.floor(n.h / 22) - 1))
          .map(
            (line, i) =>
              `<text x="14" y="${28 + i * 22}" font-size="16">${esc(line)}</text>`,
          )
          .join("")}`;
      }
      content += `<g transform="translate(${n.x} ${n.y})">${inside}</g>`;
    }
    return {
      text: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${box.x - 40} ${box.y - 40} ${w} ${h}" font-family="sans-serif"><rect x="${box.x - 40}" y="${box.y - 40}" width="${w}" height="${h}" fill="#fafbf7"/>${content}</svg>`,
      w,
      h,
    };
  }
  async function click(action, el) {
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
      const nodes = pick();
      if (!nodes.length) return true;
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
            b.nodes.push(copy);
          }
          b.edges.push(
            ...b.edges
              .filter((e) => map.has(e.from) && map.has(e.to))
              .map((e) => ({
                ...e,
                id: uid("e"),
                from: map.get(e.from),
                to: map.get(e.to),
              })),
          );
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
          nodes.forEach((n) => (n.locked = locked));
        }
        if (action === "selection-delete") {
          const ids = new Set(nodes.filter((n) => !n.locked).map((n) => n.id));
          b.nodes = b.nodes.filter((n) => !ids.has(n.id));
          for (const n of b.nodes) if (ids.has(n.frame)) delete n.frame;
          if (b.presentation)
            b.presentation = b.presentation.filter((id) => !ids.has(id));
          b.edges = b.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
          selected.clear();
          state.selectedNode = null;
        }
        if (arrangementActions.includes(action))
          arrangeSelection(b, nodes, action);
        if (action === "frame-selection") {
          const movable = nodes.filter((n) => !n.locked);
          if (!movable.length) return;
          const box = bounds(movable),
            frameId = uid("n");
          movable.forEach((n) => (n.frame = frameId));
          b.nodes.unshift({
            id: frameId,
            type: "frame",
            text: "New frame",
            x: box.x - 40,
            y: box.y - 60,
            w: box.right - box.x + 80,
            h: box.bottom - box.y + 100,
            color: "#f2f5eb",
          });
        }
      });
      return true;
    }
    if (action === "frame-add") {
      changeBoard((b) =>
        b.nodes.unshift({
          id: uid("n"),
          type: "frame",
          text: "New frame",
          x: 100,
          y: 100,
          w: 700,
          h: 480,
          color: "#f2f5eb",
        }),
      );
      return true;
    }
    if (action === "draw-tool") {
      state.tool = state.tool === "draw" ? "cursor" : "draw";
      renderView(true);
      return true;
    }
    if (action === "image-add") {
      chooseFile("image/png,image/jpeg,image/gif,image/webp", image);
      return true;
    }
    if (action === "edge-label") {
      const edge = board().edges.find((e) => e.id === state.selectedEdge);
      if (edge) pro.connectorDialog(edge);
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
    selection,
    click,
    visible: pro.visible,
    edges: pro.edges,
    camera: pro.camera,
    busy: () => !!drag || controls.busy() || pro.busy(),
  };
}
