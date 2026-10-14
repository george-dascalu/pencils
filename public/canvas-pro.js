import { canvasRichText, richToolbar } from "./canvas-rich-text.js";
import { encodeCanvas, markdownSlice, palette } from "./canvas-format.js";
import {
  sides,
  port,
  routeEdge,
  frameParents,
  hiddenByFrame,
  intersects,
  bounds,
} from "./canvas-geometry.js";

export function canvasPro(ctx, basic) {
  const {
    state,
    board,
    task,
    $,
    $$,
    esc,
    api,
    route,
    toast,
    changeBoard,
    renderView,
    updateCamera,
    showDialog,
    dialogHead,
    closeDialog,
    markdown,
    sync,
    patchTask,
  } = ctx;
  const { selected, pick, point, focusNode, uid } = basic;
  let parents = new Map(),
    hidden = new Set(),
    index = new Map(),
    editor = null,
    connecting = null,
    cameraFrame = null;
  let identity = "",
    frameSignature = "",
    outlineOpen = false,
    search = "",
    owner = "",
    status = "",
    presenting = -1,
    presenceVersion = -1;
  const notes = new Map(),
    loading = new Set();
  let members = [],
    cursor = { x: 0, y: 0 },
    heartbeatBusy = false,
    lastRoom = null;
  const touches = new Map();
  let gesture = null,
    touchPan = null,
    clipboard = null;
  const name = () =>
    localStorage.getItem("pencils:participant") ||
    `Guest ${sync.client.slice(-4)}`;
  const btn = (action, text, extra = "") =>
    `<button type="button" class="button small" data-pro="${action}" ${extra}>${text}</button>`;
  const input = (name, label, value = "", extra = "") =>
    extra === 'type="color"'
      ? `<div class="field">Colour${ctx.colorPicker({ name, value, label: "Colour" })}</div>`
      : `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
  const select = (name, label, values, value) =>
    `<label class="field">${label}<select name="${name}">${values.map((v) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
  function rebuild(b = board()) {
    if (!b) return;
    index = new Map(b.nodes.map((n) => [n.id, n]));
    parents = frameParents(b.nodes);
    hidden = hiddenByFrame(b.nodes, parents);
  }
  function rect() {
    const canvas = $("#canvas"),
      c = state.camera,
      margin = 240;
    return {
      x: (-c.x - margin) / c.z,
      y: (-c.y - margin) / c.z,
      w: ((canvas?.clientWidth || 1200) + 2 * margin) / c.z,
      h: ((canvas?.clientHeight || 700) + 2 * margin) / c.z,
    };
  }
  function visible(b = board()) {
    rebuild(b);
    const r = rect();
    const candidates = b.nodes.filter(
      (n) => !hidden.has(n.id) && (selected.has(n.id) || intersects(n, r)),
    );
    // At overview scale the bitmap retains every object; detailed DOM is reserved for selected objects.
    return candidates.length > 700
      ? candidates.filter((n) => selected.has(n.id)).slice(0, 100)
      : candidates;
  }
  function effectiveNode(id) {
    let n = index.get(id);
    const seen = new Set();
    while (n && hidden.has(n.id) && !seen.has(n.id)) {
      seen.add(n.id);
      n = index.get(parents.get(n.id));
    }
    return n?.collapsed ? { ...n, h: 48 } : n;
  }
  function edges(b = board(), exporting = false) {
    if (!b) return "";
    index = new Map(b.nodes.map((n) => [n.id, n]));
    const r = rect();
    let content = "";
    for (const e of b.edges) {
      const a = exporting ? index.get(e.from) : effectiveNode(e.from),
        c = exporting ? index.get(e.to) : effectiveNode(e.to);
      if (!a || !c || a.id === c.id) continue;
      if (!exporting && !intersects(bounds([a, c]), r)) continue;
      const p = routeEdge(e, a, c),
        color = palette[e.color] || e.color || "#78906f";
      content += `<path class="canvas-edge ${e.id === state.selectedEdge ? "selected" : ""}" data-edge="${esc(e.id)}" d="${p.d}" fill="none" stroke="${esc(color)}" ${e.fromEnd === "arrow" ? 'marker-start="url(#arrowstart)"' : ""} ${e.toEnd !== "none" ? 'marker-end="url(#arrowhead)"' : ""}/>${e.label || (e.relationship && e.relationship !== "relates") ? `<text class="edge-label" data-edge="${esc(e.id)}" x="${p.x}" y="${p.y - 9}">${esc(e.label || e.relationship)}</text>` : ""}`;
    }
    return content;
  }
  const noteFile = (n) =>
    n.type === "task"
      ? `Projects/${state.project.id}/tasks/${n.task}.md`
      : n.file;
  function taskFlags(t) {
    const done = state.config.done.includes(t.status),
      today = new Date().toISOString().slice(0, 10);
    return {
      overdue: !!t.due && t.due < today && !done,
      blocked:
        !done &&
        (t.dependencies || []).some(
          (id) => !state.config.done.includes(task(id)?.status),
        ),
    };
  }
  function matched(t, query = {}) {
    const filters = query.filters || query;
    const today = new Date().toISOString().slice(0, 10),
      soon = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    return (
      (!t.archived || filters.archived) &&
      (!query.status || query.status === "all" || t.status === query.status) &&
      (!query.type || query.type === "all" || t.type === query.type) &&
      (!filters.assignee ||
        t.assignee?.toLowerCase().includes(filters.assignee.toLowerCase())) &&
      (!filters.tag ||
        t.tags?.some((tag) =>
          tag.toLowerCase().includes(filters.tag.toLowerCase()),
        )) &&
      (!filters.blocked || taskFlags(t).blocked) &&
      (!filters.due ||
        (filters.due === "overdue"
          ? taskFlags(t).overdue
          : filters.due === "none"
            ? !t.due
            : t.due &&
              t.due >= today &&
              t.due <= soon &&
              !state.config.done.includes(t.status))) &&
      (!query.search ||
        `${t.title} ${t.body} ${t.tags?.join(" ")}`
          .toLowerCase()
          .includes(query.search.toLowerCase()))
    );
  }
  function queryRows(n) {
    const q =
      (state.project.views || []).find((v) => v.id === n.view) || n.query || {};
    const tasks = state.tasks
      .filter((t) => matched(t, q))
      .sort(
        (a, b) =>
          String(a[q.sort || "due"] || "").localeCompare(
            String(b[q.sort || "due"] || ""),
          ) * (q.sortDir || 1),
      );
    return `<div class="query-title">${esc(n.text || "Live tasks")} <span>${tasks.length}</span></div><div class="query-rows">${
      tasks
        .slice(0, 100)
        .map(
          (t) =>
            `<button data-pro="open-task" data-task="${esc(t.id)}"><span class="status-dot ${esc(t.status)}"></span>${esc(t.title)}<small>${esc(t.assignee || t.status)}</small></button>`,
        )
        .join("") || "<p>No matching tasks.</p>"
    }${tasks.length > 100 ? "<small>First 100 matches · narrow the saved view to see more.</small>" : ""}</div>`;
  }
  async function loadNote(n) {
    const file = noteFile(n);
    if (!file || loading.has(file) || notes.has(file)) return;
    if (!file.startsWith(`Projects/${state.project.id}/`)) {
      notes.set(file, {
        error:
          "File is outside this project. Its reference is preserved for Obsidian.",
      });
      return;
    }
    loading.add(file);
    const project = state.project.id;
    try {
      const url = route("notes") + `?file=${encodeURIComponent(file)}`;
      const note = sync.entries.get(url)?.local || (await api(url));
      notes.set(file, note);
    } catch (e) {
      notes.set(file, { error: e.message });
    } finally {
      loading.delete(file);
      if (state.project?.id === project && state.view === "board") enhance();
    }
  }
  function enhance() {
    if (!board()) return;
    const byTask = new Map(state.tasks.map((t) => [t.id, t]));
    for (const el of $$(".board-node")) {
      const n = index.get(el.dataset.node);
      if (!n || editor?.id === n.id) continue;
      el.style.height = `${n.collapsed ? 48 : n.h}px`;
      el.classList.toggle("collapsed-frame", !!n.collapsed);
      if (n.type === "task") {
        const t = byTask.get(n.task);
        if (!t) continue;
        const flags = taskFlags(t),
          section = markdownSlice(t.body || "", n.subpath || "");
        el.classList.toggle("overdue", flags.overdue);
        el.classList.toggle("blocked-task", flags.blocked);
        el.classList.toggle(
          "dimmed",
          (!!owner &&
            !t.assignee?.toLowerCase().includes(owner.toLowerCase())) ||
            (!!status && t.status !== status),
        );
        el.innerHTML = `<div class="live-card-heading"><span>${esc(t.type)}</span>${btn("task-details", "↗", `data-task="${esc(t.id)}" aria-label="Open task details"`)}</div><strong class="task-title">${esc(t.title)}</strong><div class="live-card-state"><select data-canvas-status="${esc(t.id)}" aria-label="Task status">${state.config.statuses.map((s) => `<option ${s === t.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select><span>${esc(t.assignee || "Unassigned")}</span>${flags.overdue ? "<b>Overdue</b>" : ""}${flags.blocked ? "<b>Blocked</b>" : ""}</div>${n.h > 175 ? `<div class="canvas-markdown">${section ? markdown(section.text) : "<p>Heading or block not found.</p>"}</div>` : ""}${n.subpath ? `<small class="embed-label">${esc(n.subpath)}</small>` : ""}`;
      } else if (n.type === "file") {
        loadNote(n);
        const note = notes.get(n.file),
          section =
            note && !note.error
              ? markdownSlice(note.body, n.subpath || "")
              : null;
        el.innerHTML = `<strong>${esc(n.file?.split("/").pop() || "Note")}${n.subpath ? ` · ${esc(n.subpath)}` : ""}</strong><div class="canvas-markdown">${note?.error ? esc(note.error) : section ? markdown(section.text) : note ? "Heading or block not found." : "Loading note…"}</div>`;
      } else if (n.type === "query") el.innerHTML = queryRows(n);
      else if (n.type === "link")
        el.innerHTML = `<span>Link</span><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.url)}</a><small>Opens in a new tab</small>`;
      else if (["text", "sticky", "shape"].includes(n.type))
        el.innerHTML = `<div class="node-text canvas-markdown">${markdown(n.text || "")}</div>`;
      if (n.comments?.some((c) => !c.resolved))
        el.insertAdjacentHTML(
          "beforeend",
          btn(
            "comments",
            `◌ ${n.comments.filter((c) => !c.resolved).length}`,
            `data-id="${esc(n.id)}" aria-label="Object comments"`,
          ),
        );
      if (n.type === "frame")
        el.insertAdjacentHTML(
          "beforeend",
          btn(
            "collapse",
            n.collapsed ? "＋" : "−",
            `data-id="${esc(n.id)}" aria-label="${n.collapsed ? "Expand" : "Collapse"} frame"`,
          ),
        );
    }
    basic.selection();
  }
  function selection() {
    $$(".connection-port").forEach((el) => el.remove());
    for (const n of pick()) {
      const el = $(`[data-node="${CSS.escape(n.id)}"]`);
      if (!el || n.locked || editor?.id === n.id) continue;
      for (const side of sides)
        el.insertAdjacentHTML(
          "beforeend",
          `<button type="button" class="connection-port port-${side}" data-port="${side}" data-source="${esc(n.id)}" aria-label="Connect from ${side}"></button>`,
        );
    }
  }

  function availableUndo(operations, redo = false) {
    const inactive = new Set();
    for (const op of operations.slice().reverse())
      if (op.undoOf && !inactive.has(op.id)) inactive.add(op.undoOf);
    return operations
      .slice()
      .reverse()
      .find(
        (o) =>
          o.client === sync.client &&
          !inactive.has(o.id) &&
          (redo
            ? o.undoOf && !operations.find((p) => p.id === o.undoOf)?.undoOf
            : !o.undoOf),
      );
  }
  async function keyboardUndo(redo = false) {
    await basic.flush();
    if (sync.entries.size)
      throw new Error("Finish saving or resolve pending edits before undo.");
    const { operations } = await api(
      route("boards", board().id) + "/operations",
    );
    const operation = availableUndo(operations, redo);
    if (!operation) return;
    await api(route("boards", board().id) + "/undo", {
      method: "POST",
      body: {
        operation: operation.id,
        operationId: uid("undo"),
        client: sync.client,
      },
    });
    await ctx.refresh();
  }
  document.addEventListener(
    "click",
    (event) => {
      const button = event.target.closest(
        '[data-action="board-undo"],[data-action="board-redo"]',
      );
      if (!button || state.view !== "board") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      keyboardUndo(button.dataset.action === "board-redo").catch((e) =>
        toast(e.message, true),
      );
    },
    true,
  );
  function updateUndo() {
    for (const action of ["undo", "redo"]) {
      const button = $(`[data-action="board-${action}"]`);
      if (button)
        button.disabled = !availableUndo(
          board()?.operations || [],
          action === "redo",
        );
    }
  }
  function render() {
    const b = board();
    if (!b || !$("#canvas")) return;
    if (identity !== b.id) {
      identity = b.id;
      search = "";
      presenting = -1;
      members = [];
      notes.clear();
    }
    rebuild();
    updateUndo();
    $("#canvas-extras")?.insertAdjacentHTML(
      "afterbegin",
      `${btn("note-add", "Live note")}${btn("query-add", "Live task view")}${btn("templates", "Templates")}${btn("outline", "Outline")}${btn("present", "Present")}${btn("activity", "Activity")}${btn("shortcuts", "?", 'aria-label="Board shortcuts"')}`,
    );
    $("#canvas").insertAdjacentHTML(
      "beforeend",
      `<canvas id="canvas-overview" aria-hidden="true"></canvas><aside id="canvas-outline" class="canvas-panel ${outlineOpen ? "" : "hidden"}"></aside><div id="canvas-presence" class="canvas-presence"></div><div id="canvas-cursors" aria-hidden="true"></div><div class="canvas-find"><input id="canvas-find" type="search" aria-label="Find board objects" placeholder="Find on board…" value="${esc(search)}"><div id="canvas-find-results"></div></div><div class="canvas-filters"><input id="canvas-owner" aria-label="Filter canvas by owner" placeholder="Owner" value="${esc(owner)}"><select id="canvas-status" aria-label="Filter canvas by status"><option value="">Every status</option>${state.config.statuses.map((s) => `<option ${s === status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div><button id="canvas-minimap" aria-label="Minimap: click to navigate"><canvas width="200" height="125"></canvas></button><div id="canvas-performance" aria-live="off"></div>`,
    );
    enhance();
    outline();
    searchResults();
    paintMap();
    paintPresence();
    if (presenting >= 0) presentFrame();
    camera();
  }
  function reconcile() {
    cameraFrame = null;
    if (
      state.view !== "board" ||
      !$("#canvas-world") ||
      !board() ||
      editor ||
      basic.busy()
    )
      return;
    const started = performance.now(),
      nodes = visible(),
      ids = new Set(nodes.map((n) => n.id));
    const existing = new Map(
      $$(".board-node").map((el) => [el.dataset.node, el]),
    );
    let added = false;
    for (const [id, el] of existing) if (!ids.has(id)) el.remove();
    for (const n of nodes)
      if (!existing.has(n.id)) {
        $("#canvas-world").insertAdjacentHTML("beforeend", ctx.nodeHTML(n));
        added = true;
      }
    if (added) {
      basic.enhanceBase();
      enhance();
      basic.selection();
    }
    const svg = $("#canvas-lines");
    if (svg) {
      svg.querySelectorAll("[data-edge]").forEach((el) => el.remove());
      svg.insertAdjacentHTML("beforeend", edges());
    }
    paintMap();
    paintPresence();
    paintOverview(ids);
    const label = $("#canvas-performance");
    if (label)
      label.textContent = `${board().nodes.length.toLocaleString()} objects · ${nodes.length} detailed · ${(performance.now() - started).toFixed(0)} ms`;
  }
  function camera() {
    basic.positionToolbar();
    if (!cameraFrame) cameraFrame = requestAnimationFrame(reconcile);
  }
  function paintOverview(rendered) {
    const c = $("#canvas-overview"),
      canvas = $("#canvas");
    if (!c || !canvas) return;
    c.width = canvas.clientWidth;
    c.height = canvas.clientHeight;
    const g = c.getContext("2d");
    const r = rect(),
      cam = state.camera;
    for (const n of board().nodes)
      if (!rendered.has(n.id) && !hidden.has(n.id) && intersects(n, r)) {
        g.fillStyle = n.color || "#dce5d8";
        g.fillRect(
          n.x * cam.z + cam.x,
          n.y * cam.z + cam.y,
          Math.max(2, n.w * cam.z),
          Math.max(2, (n.collapsed ? 48 : n.h) * cam.z),
        );
        g.strokeStyle = "#78906f";
        g.strokeRect(
          n.x * cam.z + cam.x,
          n.y * cam.z + cam.y,
          n.w * cam.z,
          n.h * cam.z,
        );
      }
  }
  function paintMap() {
    const el = $("#canvas-minimap canvas");
    if (!el || !board()) return;
    const g = el.getContext("2d"),
      box = bounds(board().nodes),
      scale = Math.min(190 / Math.max(1, box.w), 115 / Math.max(1, box.h));
    el._map = { box, scale };
    g.clearRect(0, 0, 200, 125);
    g.fillStyle = "#fafbf7";
    g.fillRect(0, 0, 200, 125);
    for (const n of board().nodes)
      if (!hidden.has(n.id)) {
        g.fillStyle = n.color || "#a4b69a";
        g.fillRect(
          5 + (n.x - box.x) * scale,
          5 + (n.y - box.y) * scale,
          Math.max(2, n.w * scale),
          Math.max(2, (n.collapsed ? 48 : n.h) * scale),
        );
      }
    const canvas = $("#canvas"),
      c = state.camera;
    g.strokeStyle = "#35553d";
    g.lineWidth = 2;
    g.strokeRect(
      5 + (-c.x / c.z - box.x) * scale,
      5 + (-c.y / c.z - box.y) * scale,
      (canvas.clientWidth / c.z) * scale,
      (canvas.clientHeight / c.z) * scale,
    );
  }
  function focus(nodes) {
    if (!nodes.length) return;
    const b = bounds(nodes);
    focusNode(b);
    camera();
  }
  function searchResults() {
    const el = $("#canvas-find-results");
    if (!el) return;
    const results = search
      ? board()
          .nodes.filter((n) =>
            `${n.text || ""} ${task(n.task)?.title || ""} ${n.file || ""}`
              .toLowerCase()
              .includes(search.toLowerCase()),
          )
          .slice(0, 30)
      : [];
    el.innerHTML = results
      .map((n) =>
        btn(
          "find-result",
          esc(task(n.task)?.title || n.text || n.file || n.type),
          `data-id="${esc(n.id)}"`,
        ),
      )
      .join("");
  }
  function reveal(n) {
    const expand = [];
    let p = parents.get(n.id),
      seen = new Set();
    while (p && !seen.has(p)) {
      seen.add(p);
      const f = index.get(p);
      if (f?.collapsed) expand.push(f.id);
      p = parents.get(p);
    }
    if (expand.length)
      changeBoard((b) =>
        b.nodes
          .filter((n) => expand.includes(n.id))
          .forEach((n) => (n.collapsed = false)),
      );
    selected.clear();
    selected.add(n.id);
    state.selectedNode = n.id;
    focus([n]);
    basic.selection();
  }
  async function inline(n = pick()[0]) {
    rebuild();
    n = index.get(n?.id);
    if (!n || n.locked || editor) return;
    if (["image", "draw", "query", "link"].includes(n.type)) {
      if (n.type === "query") return queryDialog(n);
      return ctx.nodeDialog();
    }
    let note = null,
      text = n.text || "";
    if (["task", "file"].includes(n.type)) {
      note =
        n.type === "task"
          ? task(n.task)
          : sync.entries.get(
              route("notes") + `?file=${encodeURIComponent(n.file)}`,
            )?.local ||
            (await api(route("notes") + `?file=${encodeURIComponent(n.file)}`));
      if (!note) throw new Error("The linked note is unavailable.");
      const section = markdownSlice(note.body || "", n.subpath || "");
      if (!section)
        throw new Error(
          "This heading or block no longer exists. Choose another embed target.",
        );
      text = section.text;
    }
    const key = `pencils:inline:${state.project.id}:${board().id}:${n.id}`,
      stored = localStorage.getItem(key);
    const el = $(`[data-node="${CSS.escape(n.id)}"]`);
    if (!el) return;
    editor = {
      id: n.id,
      note: note ? structuredClone(note) : null,
      key,
      original: text,
    };
    state.canvasEditing = true;
    el.classList.add("inline-editing");
    el.style.minWidth = "380px";
    el.style.minHeight = "320px";
    // Keep the expanded editor clear of board controls, even near viewport edges.
    const canvas = $("#canvas"),
      w = Math.max(n.w, 380),
      h = Math.max(n.h, 320);
    const old = { ...state.camera };
    const z = Math.min(
      old.z,
      (canvas.clientWidth - 120) / w,
      (canvas.clientHeight - 180) / h,
    );
    state.camera = {
      z,
      x:
        Math.max(
          80,
          Math.min(canvas.clientWidth - w * z - 20, n.x * old.z + old.x),
        ) -
        n.x * z,
      y:
        Math.max(
          120,
          Math.min(canvas.clientHeight - h * z - 60, n.y * old.z + old.y),
        ) -
        n.y * z,
    };
    updateCamera();

    el.innerHTML = `<form id="canvas-inline-form">${n.type === "task" ? `<input name="title" aria-label="Task title" value="${esc(note.title)}" maxlength="300">` : ""}${richToolbar}<div class="inline-rich markdown-preview hidden" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Rich text editor" spellcheck="true"></div><textarea name="text" aria-label="Edit canvas Markdown" spellcheck="true">${esc(stored ?? text)}</textarea><div class="inline-actions">${btn("inline-preview", "Preview")}<span>${stored !== null ? "Draft restored · " : ""}Ctrl / ⌘ Enter to save</span><button class="button small primary" type="submit">Save</button>${btn("inline-cancel", "Cancel")}</div><div class="inline-preview markdown-preview hidden"></div><p class="inline-error" role="alert"></p></form>`;
    editor.rich = canvasRichText(el.querySelector("form"), markdown);
    el.querySelector("textarea").focus();
    el.querySelector("textarea").select();
  }
  async function finishInline(cancel = false) {
    if (!editor) return;
    rebuild();
    const e = editor,
      n = index.get(e.id),
      form = $("#canvas-inline-form");
    if (!form) return;
    if (cancel) {
      localStorage.removeItem(e.key);
      editor = null;
      state.canvasEditing = false;
      renderView(true);
      return;
    }
    e.rich.flush();
    const text = form.elements.text.value;
    try {
      if (e.note) {
        const section = markdownSlice(e.note.body || "", n.subpath || "");
        const body =
          e.note.body.slice(0, section.start) +
          text +
          (n.subpath && section.text.endsWith("\n") && !text.endsWith("\n")
            ? "\n"
            : "") +
          e.note.body.slice(section.end);
        if (n.type === "task") {
          const changes = { body, title: form.elements.title.value };
          Object.assign(task(n.task), changes);
          await sync.enqueue(route("tasks", n.task), e.note, changes);
        } else
          await sync.enqueue(
            route("notes") + `?file=${encodeURIComponent(n.file)}`,
            e.note,
            { body },
          );
        notes.delete(noteFile(n));
      } else {
        ctx.remember();
        n.text = text;
        ctx.saveBoard();
      }
      localStorage.removeItem(e.key);
      editor = null;
      state.canvasEditing = false;
      renderView(true);
    } catch (error) {
      form.querySelector(".inline-error").textContent = error.message;
    }
  }
  function outline() {
    const el = $("#canvas-outline");
    if (!el) return;
    const frames = board().nodes.filter((n) => n.type === "frame"),
      order = board().presentation || frames.map((f) => f.id);
    const rows = [];
    const visit = (parent, depth = 0, seen = new Set()) => {
      for (const f of frames
        .filter((f) => (parents.get(f.id) || null) === parent)
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        rows.push(
          `<div class="outline-row" style="padding-left:${depth * 14}px">${btn("collapse", f.collapsed ? "＋" : "−", `data-id="${esc(f.id)}"`)}${btn("find-result", esc(f.text || "Frame"), `data-id="${esc(f.id)}"`)}${btn("frame-up", "↑", `data-id="${esc(f.id)}" aria-label="Move frame earlier"`)}${btn("frame-down", "↓", `data-id="${esc(f.id)}" aria-label="Move frame later"`)}</div>`,
        );
        visit(f.id, depth + 1, seen);
      }
    };
    visit(null);
    el.innerHTML = `<strong>Frames & presentation</strong>${btn("outline", "×", 'aria-label="Close outline"')}<p>Reorder slides with ↑ / ↓. Drag a frame to move its contents.</p>${rows.join("") || "<p>Add a frame or frame a selection.</p>"}`;
  }
  function slideIds() {
    const frames = board().nodes.filter((n) => n.type === "frame");
    return [
      ...new Set([...(board().presentation || []), ...frames.map((f) => f.id)]),
    ].filter((id) => index.get(id)?.type === "frame");
  }
  function presentFrame() {
    const ids = slideIds();
    if (!ids.length) {
      presenting = -1;
      toast("Add frames to present your board.");
      return;
    }
    presenting = Math.max(0, Math.min(ids.length - 1, presenting));
    const n = index.get(ids[presenting]);
    focus([n]);
    $("#presentation-controls")?.remove();
    $("#canvas").classList.add("presenting");
    $("#canvas").insertAdjacentHTML(
      "beforeend",
      `<div id="presentation-controls">${btn("slide-prev", "←", 'aria-label="Previous frame"')}<strong>${presenting + 1} / ${ids.length} · ${esc(n.text || "Frame")}</strong>${btn("slide-next", "→", 'aria-label="Next frame"')}${btn("present-exit", "Exit")}</div>`,
    );
  }
  function queryDialog(n = null) {
    const q = n?.query || {};
    showDialog(
      `<dialog class="dialog"><form id="canvas-query-form" data-id="${esc(n?.id || "")}">${dialogHead("Live task view")}<div class="dialog-body">${input("title", "Card title", n?.text || "Live tasks")}<label class="field">Saved project view<select name="view"><option value="">Custom filter</option>${(state.project.views || []).map((v) => `<option value="${esc(v.id)}" ${n?.view === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>${select("status", "Status", ["all", ...state.config.statuses], q.status || "all")}${input("assignee", "Owner contains", q.assignee || "")}${input("search", "Text contains", q.search || "")}<p>The card always reads the current tasks. Editing a task anywhere updates every card.</p></div><div class="dialog-foot"><button type="submit" class="button primary">Save view card</button></div></form></dialog>`,
      "canvas-query",
    );
  }
  function addPosition() {
    const c = $("#canvas");
    return {
      x: (c.clientWidth / 2 - state.camera.x) / state.camera.z,
      y: (c.clientHeight / 2 - state.camera.y) / state.camera.z,
    };
  }
  function connectorDialog(edge) {
    showDialog(
      `<dialog class="dialog"><form id="canvas-edge-form" data-id="${esc(edge.id)}">${dialogHead("Connection")}<div class="dialog-body">${input("label", "Label", edge.label || "")}${select("relationship", "Relationship", ["relates", "blocks", "contains", "sequence"], edge.relationship || "relates")}<div class="field-row">${select("routing", "Route", ["curve", "elbow", "straight"], edge.routing || "curve")}${input("color", "Color", palette[edge.color] || edge.color || "#78906f", 'type="color"')}</div><div class="field-row">${select("fromSide", "From side", ["auto", ...sides], edge.fromSide || "auto")}${select("toSide", "To side", ["auto", ...sides], edge.toSide || "auto")}</div><div class="field-row">${select("fromEnd", "Start", ["none", "arrow"], edge.fromEnd || "none")}${select("toEnd", "End", ["arrow", "none"], edge.toEnd || "arrow")}</div><label><input type="checkbox" name="dependency"> Create a real task dependency when this relationship is “blocks”</label><p>The destination task will depend on the source task. Removing the visual connector leaves the task dependency intact.</p></div><div class="dialog-foot"><button type="submit" class="button primary">Save connection</button></div></form></dialog>`,
      "canvas-edge",
    );
  }
  function comments(n) {
    if (!n) return;
    showDialog(
      `<dialog class="dialog"><form id="canvas-comment-form" data-id="${esc(n.id)}">${dialogHead("Comments on this object")}<div class="dialog-body"><p>${esc(task(n.task)?.title || n.text || n.file || n.type)}</p>${(n.comments || []).map((c) => `<article class="canvas-comment ${c.resolved ? "resolved" : ""}"><strong>${esc(c.author)}</strong><time>${esc(new Date(c.created).toLocaleString())}</time><p>${esc(c.text)}</p>${btn("comment-resolve", c.resolved ? "Reopen" : "Resolve", `data-node-id="${esc(n.id)}" data-id="${esc(c.id)}"`)}</article>`).join("") || "<p>No comments yet.</p>"}<label class="field">Comment<textarea name="text" maxlength="10000" rows="4" required autofocus></textarea></label></div><div class="dialog-foot"><button type="submit" class="button primary">Add comment</button></div></form></dialog>`,
      "canvas-comments",
    );
  }
  async function activity() {
    const result = await api(route("boards", board().id) + "/operations");
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Board activity")}<div class="dialog-body"><p>Each save records its changes with the canvas. Undo checks affected values before applying, protecting subsequent edits.</p><div class="operation-list">${
        result.operations
          .slice()
          .reverse()
          .map(
            (o) =>
              `<article><div><strong>${esc(o.summary)}</strong><small>${esc(o.actor)} · ${esc(new Date(o.time).toLocaleString())}</small></div>${btn("undo-operation", "Undo", `data-id="${esc(o.id)}"`)}</article>`,
          )
          .join("") || "<p>No saved operations yet.</p>"
      }</div></div><div class="dialog-foot">${btn("file-history", "Older file versions")}${btn("activity-close", "Close")}</div></dialog>`,
      "canvas-activity",
    );
  }
  function templateDialog() {
    showDialog(
      `<dialog class="dialog wide-dialog">${dialogHead("Board templates")}<div class="dialog-body"><p>Insert a starting structure, or save a selection as a reusable template in this canvas.</p><div class="template-grid">${[
        ["brainstorm", "Brainstorm", "Ideas → themes → decisions"],
        [
          "retrospective",
          "Retrospective",
          "What worked · improve · next steps",
        ],
        ["roadmap", "Roadmap", "Now · next · later"],
      ]
        .map(
          ([id, title, desc]) =>
            `<article><h3>${title}</h3><p>${desc}</p>${btn("template-insert", "Insert", `data-id="${id}"`)}</article>`,
        )
        .join(
          "",
        )}${(board().templates || []).map((t) => `<article><h3>${esc(t.name)}</h3><p>${t.nodes.length} objects</p>${btn("template-insert", "Insert", `data-id="${esc(t.id)}"`)}</article>`).join("")}</div><form id="canvas-template-form">${input("name", "Save selection as template", "", 'maxlength="100" required')}<button class="button" type="submit" ${pick().length ? "" : "disabled"}>Save ${pick().length} selected objects</button></form></div></dialog>`,
      "canvas-templates",
    );
  }
  function insertTemplate(id, supplied = null) {
    const saved = supplied || board().templates?.find((t) => t.id === id);
    let nodes = [],
      edges = [];
    if (saved) {
      nodes = structuredClone(saved.nodes);
      edges = structuredClone(saved.edges);
    } else {
      const titles = {
        brainstorm: ["Ideas", "Themes", "Decisions"],
        retrospective: ["What worked", "What to improve", "Next steps"],
        roadmap: ["Now", "Next", "Later"],
      }[id];
      if (!titles) return;
      const colors = ["#f5e7a2", "#d6e4d3", "#d4bee5"];
      titles.forEach((title, i) => {
        const frame = `frame-${i}`;
        nodes.push({
          id: frame,
          type: "frame",
          text: title,
          x: i * 480,
          y: 0,
          w: 440,
          h: 440,
          color: colors[i],
        });
        nodes.push({
          id: `note-${i}`,
          type: "sticky",
          frame,
          text: "Double-click to add your thoughts",
          x: i * 480 + 40,
          y: 70,
          w: 230,
          h: 170,
          color: colors[i],
        });
      });
      edges = [
        {
          id: "link-1",
          from: "frame-0",
          to: "frame-1",
          relationship: "sequence",
        },
        {
          id: "link-2",
          from: "frame-1",
          to: "frame-2",
          relationship: "sequence",
        },
      ];
    }
    const box = bounds(nodes),
      p = addPosition(),
      ids = new Map(nodes.map((n) => [n.id, uid("n")]));
    nodes = nodes.map((n) => ({
      ...n,
      id: ids.get(n.id),
      x: n.x - box.x + p.x,
      y: n.y - box.y + p.y,
      ...(ids.has(n.frame)
        ? { frame: ids.get(n.frame) }
        : { frame: undefined }),
      comments: [],
    }));
    edges = edges.map((e) => ({
      ...e,
      id: uid("e"),
      from: ids.get(e.from),
      to: ids.get(e.to),
    }));
    changeBoard((b) => {
      b.nodes.push(...nodes);
      b.edges.push(...edges);
    });
    closeDialog(true);
    focus(nodes);
  }
  async function click(action, el) {
    rebuild();
    const n = index.get(el?.dataset.id) || pick()[0];
    if (action === "inline") await inline();
    else if (action === "inline-cancel") await finishInline(true);
    else if (action === "inline-preview") {
      editor?.rich.preview();
    } else if (action === "zoom-selection") focus(pick());
    else if (action === "find-result") {
      reveal(n);
      search = "";
      $("#canvas-find").value = "";
      searchResults();
    } else if (action === "outline") {
      outlineOpen = !outlineOpen;
      $("#canvas-outline")?.classList.toggle("hidden", !outlineOpen);
      outline();
    } else if (action === "collapse") {
      changeBoard(() => (n.collapsed = !n.collapsed));
    } else if (action === "frame-up" || action === "frame-down") {
      const ids = slideIds(),
        i = ids.indexOf(n.id),
        j = Math.max(
          0,
          Math.min(ids.length - 1, i + (action === "frame-up" ? -1 : 1)),
        );
      [ids[i], ids[j]] = [ids[j], ids[i]];
      changeBoard((b) => (b.presentation = ids));
    } else if (action === "present") {
      presenting = 0;
      presentFrame();
    } else if (action === "slide-prev" || action === "slide-next") {
      presenting += action === "slide-next" ? 1 : -1;
      presentFrame();
    } else if (action === "present-exit") {
      presenting = -1;
      $("#canvas").classList.remove("presenting");
      $("#presentation-controls")?.remove();
    } else if (action === "comments") comments(n);
    else if (action === "edge-edit")
      connectorDialog(board().edges.find((e) => e.id === state.selectedEdge));
    else if (action === "comment-resolve") {
      const node = index.get(el.dataset.nodeId);
      changeBoard(() => {
        const c = node.comments.find((c) => c.id === el.dataset.id);
        c.resolved = !c.resolved;
      });
      comments(node);
    } else if (action === "activity") await activity();
    else if (action === "undo-operation") {
      await api(route("boards", board().id) + "/undo", {
        method: "POST",
        body: {
          operation: el.dataset.id,
          operationId: uid("undo"),
          client: sync.client,
        },
      });
      closeDialog(true);
      await ctx.refresh();
      toast("Operation undone.");
    } else if (action === "activity-close") closeDialog(true);
    else if (action === "file-history") {
      closeDialog(true);
      document.querySelector("[data-feature=canvas-history]")?.click();
    } else if (action === "task-details" || action === "open-task")
      ctx.taskDialog(el.dataset.task);
    else if (action === "query-add" || action === "query-edit")
      queryDialog(action === "query-edit" ? n : null);
    else if (action === "templates") templateDialog();
    else if (action === "template-insert") insertTemplate(el.dataset.id);
    else if (action === "convert") {
      if (n?.type !== "sticky") return;
      if (sync.entries.size) {
        toast("Wait for pending changes to save before converting.");
        return;
      }
      // A source marker makes retries safe if task creation succeeds but the board save is interrupted.
      const marker = `canvas:${board().id}:${n.id}`;
      let created = state.tasks.find((t) => t.canvas_source === marker);
      if (!created)
        created = await api(route("tasks"), {
          method: "POST",
          body: {
            title: (n.text || "New task")
              .split("\n")[0]
              .replace(/^#+\s*/, "")
              .slice(0, 300),
            body: n.text || "",
            canvas_source: marker,
          },
        });
      if (!task(created.id)) state.tasks.push(created);
      changeBoard(() => {
        n.type = "task";
        n.task = created.id;
        n.h = Math.max(200, n.h);
        delete n.text;
      });
      toast("Sticky converted to a task. Its connectors stay attached.");
    } else if (action === "embed")
      showDialog(
        `<dialog class="dialog"><form id="canvas-embed-form" data-id="${esc(n.id)}">${dialogHead("Choose note content")}<div class="dialog-body">${input("subpath", "Heading or block", n.subpath || "", 'placeholder="#Heading or #^block-id"')}<p>Leave blank for the entire note. Editing this card updates the source Markdown file.</p></div><div class="dialog-foot"><button class="button primary">Apply embed</button></div></form></dialog>`,
        "canvas-embed",
      );
    else if (action === "backlinks") {
      const linked = task(n.task),
        names = [
          linked?.id,
          linked?.title,
          ...(linked?.aliases || []),
          n.file?.replace(/\.md$/, ""),
        ].filter(Boolean);
      const { links: results } = await api(
        route("notes") + `?backlinks=${encodeURIComponent(noteFile(n))}`,
      );
      const cards = board().nodes.filter(
        (c) =>
          c.id !== n.id &&
          ((n.task && c.task === n.task) || (n.file && c.file === n.file)),
      );
      showDialog(
        `<dialog class="dialog">${dialogHead("Backlinks")}<div class="dialog-body"><h3>Project notes linking here</h3>${results.map((t) => btn(t.id ? "open-task" : "open-linked-note", esc(t.title), t.id ? `data-task="${esc(t.id)}"` : `data-file="${esc(t.file)}"`)).join("") || "<p>No task notes link here yet.</p>"}<h3>Other cards on this board</h3>${cards.map((c) => btn("backlink-card", esc(c.subpath || "Full note"), `data-id="${esc(c.id)}"`)).join("") || "<p>This is the only card for this note.</p>"}</div></dialog>`,
        "canvas-backlinks",
      );
    } else if (action === "open-linked-note") {
      closeDialog(true);
      const node = {
        id: uid("n"),
        type: "file",
        file: el.dataset.file,
        ...addPosition(),
        w: 340,
        h: 300,
      };
      changeBoard((b) => b.nodes.push(node));
      focus([node]);
    } else if (action === "backlink-card") {
      closeDialog(true);
      reveal(n);
    } else if (action === "object-style") {
      const frames = board().nodes.filter(
        (f) => f.type === "frame" && f.id !== n.id,
      );
      showDialog(
        `<dialog class="dialog"><form id="canvas-style-form" data-id="${esc(n.id)}">${dialogHead("Object appearance & frame")}<div class="dialog-body">${input("color", "Color", n.color || "#ffffff", 'type="color"')}<label class="field">Parent frame<select name="frame"><option value="">Automatic from position</option>${frames.map((f) => `<option value="${esc(f.id)}" ${n.frame === f.id ? "selected" : ""}>${esc(f.text || "Frame")}</option>`).join("")}</select></label>${select("layer", "Layer", ["keep", "front", "back"], "keep")}</div><div class="dialog-foot"><button class="button primary">Apply</button></div></form></dialog>`,
        "canvas-style",
      );
    } else if (action === "note-add") {
      const { files } = await api(route("notes"));
      showDialog(
        `<dialog class="dialog"><form id="canvas-note-form">${dialogHead("Embed a live Markdown note")}<div class="dialog-body"><label class="field">Project note<select name="file">${files.map((f) => `<option>${esc(f)}</option>`).join("")}</select></label>${input("subpath", "Heading or block", "", 'placeholder="#Heading or #^block-id"')}<p>Notes stay in the project folder. Open the same file in Obsidian or edit it directly in the canvas.</p></div><div class="dialog-foot"><button class="button primary" ${files.length ? "" : "disabled"}>Add live note</button></div></form></dialog>`,
        "canvas-note",
      );
    } else if (action === "participant")
      showDialog(
        `<dialog class="dialog"><form id="canvas-name-form">${dialogHead("Your name on this workspace")}<div class="dialog-body">${input("name", "Display name", name(), 'maxlength="60" required')}<p>Other people on your local network see this name beside your cursor and comments.</p></div><div class="dialog-foot"><button class="button primary">Save</button></div></form></dialog>`,
        "canvas-name",
      );
    else if (action === "shortcuts")
      showDialog(
        `<dialog class="dialog">${dialogHead("Board shortcuts")}<div class="dialog-body"><p>V: select · H: hand · N: sticky · T: text · S / R: shape<br>L: connector · P: pen · F: add frame · D: task card · C: comment on selection<br>Click to place a sticky, text or shape; Escape cancels<br>Double-click or Enter: edit inline · Ctrl / ⌘ Enter: save<br>Ctrl / ⌘ click or Shift-click: select multiple objects<br>Drag empty canvas with select tool: selection box<br>Right-drag, middle-drag or Space + drag: pan<br>Scroll: zoom at pointer · Shift + scroll: move up / down<br>Pinch or Ctrl / ⌘ wheel: zoom<br>Expand board: fill window · Full screen: hide browser chrome<br>Ctrl / ⌘ + / −: zoom · Ctrl / ⌘ 0: 100%<br>Alt / Option 1: fit board · Alt / Option 2: focus selection<br>M: minimap · G: grid · Ctrl / ⌘ F: find on board<br>Ctrl / ⌘ A: select all · Ctrl / ⌘ D or Alt / Option drag: duplicate<br>Ctrl / ⌘ C, V: copy and paste objects<br>Ctrl / ⌘ G: group · Ctrl / ⌘ Shift G: ungroup<br>Ctrl / ⌘ Shift L: lock / unlock<br>Arrow keys: move selection or pan (Shift for larger steps)<br>Ctrl / ⌘ Z: undo · Ctrl / ⌘ Shift Z: redo<br>Drag a connection handle to another card<br>Pen: draw with pressure; two fingers: pan and zoom<br>Escape: clear selection or exit current tool / editor / presentation</p></div></dialog>`,
        "canvas-shortcuts",
      );
    else return false;
    return true;
  }
  async function submit(form) {
    rebuild();
    const values = Object.fromEntries(new FormData(form)),
      n = index.get(form.dataset.id);
    if (form.id === "canvas-inline-form") {
      await finishInline();
      return;
    }
    if (form.id === "canvas-edge-form") {
      changeBoard((b) => {
        const edge = b.edges.find((e) => e.id === form.dataset.id);
        for (const k of [
          "label",
          "relationship",
          "routing",
          "color",
          "fromEnd",
          "toEnd",
        ])
          edge[k] = values[k];
        for (const k of ["fromSide", "toSide"])
          if (values[k] === "auto") delete edge[k];
          else edge[k] = values[k];
      });
      if (values.dependency) {
        await basic.flush();
        if (sync.entries.size)
          throw new Error(
            "Save the connector before creating its task dependency.",
          );
        await api(route("boards", board().id) + "/dependency", {
          method: "POST",
          body: { edge: form.dataset.id },
        });
        await ctx.refresh();
      }
    } else if (form.id === "canvas-comment-form") {
      changeBoard(() => {
        n.comments ||= [];
        n.comments.push({
          id: uid("comment"),
          author: state.session?.required
            ? state.session.user.name || state.session.user.username
            : name(),
          text: values.text.trim(),
          created: new Date().toISOString(),
        });
      });
      comments(n);
      return;
    } else if (form.id === "canvas-embed-form") {
      if (values.subpath && !values.subpath.startsWith("#"))
        throw new Error("Use #Heading or #^block-id.");
      changeBoard(() => {
        n.subpath = values.subpath;
        n.h = Math.max(n.h, 260);
      });
    } else if (form.id === "canvas-style-form") {
      // Prevent a parent cycle before the change enters the save queue.
      let f = values.frame;
      const seen = new Set([n.id]);
      while (f) {
        if (seen.has(f)) throw new Error("A frame cannot contain itself.");
        seen.add(f);
        f = index.get(f)?.frame;
      }
      changeBoard((b) => {
        n.color = values.color;
        if (values.frame) n.frame = values.frame;
        else delete n.frame;
        if (values.layer !== "keep") {
          b.nodes = b.nodes.filter((x) => x.id !== n.id);
          b.nodes[values.layer === "front" ? "push" : "unshift"](n);
        }
      });
    } else if (form.id === "canvas-note-form") {
      if (values.subpath && !values.subpath.startsWith("#"))
        throw new Error("Use #Heading or #^block-id.");
      const t = state.tasks.find((t) => t.file === values.file);
      changeBoard((b) =>
        b.nodes.push({
          id: uid("n"),
          type: t ? "task" : "file",
          ...(t ? { task: t.id } : { file: values.file }),
          subpath: values.subpath,
          ...addPosition(),
          w: 340,
          h: 300,
        }),
      );
    } else if (form.id === "canvas-query-form") {
      changeBoard((b) => {
        const card = n || {
          id: uid("n"),
          type: "query",
          ...addPosition(),
          w: 380,
          h: 340,
        };
        Object.assign(card, {
          text: values.title,
          view: values.view,
          query: {
            status: values.status,
            assignee: values.assignee,
            search: values.search,
          },
        });
        if (!n) b.nodes.push(card);
      });
    } else if (form.id === "canvas-template-form") {
      const nodes = structuredClone(pick()),
        ids = new Set(nodes.map((n) => n.id)),
        edges = structuredClone(
          board().edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        );
      if (!nodes.length) return;
      for (const n of nodes) if (n.frame && !ids.has(n.frame)) delete n.frame;
      changeBoard((b) => {
        b.templates ||= [];
        b.templates.push({
          id: uid("template"),
          name: values.name,
          nodes,
          edges,
        });
      });
      toast("Template saved in this canvas.");
    } else if (form.id === "canvas-name-form")
      localStorage.setItem("pencils:participant", values.name);
    else return;
    closeDialog(true);
  }
  document.addEventListener(
    "click",
    (event) => {
      const el = event.target.closest("[data-pro]");
      if (!el) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      Promise.resolve(click(el.dataset.pro, el)).catch((e) =>
        toast(e.message, true),
      );
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (!event.target.id.startsWith("canvas-")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = event.target,
        button = form.querySelector("[type=submit]");
      if (button) button.disabled = true;
      submit(form)
        .catch((e) => {
          toast(e.message, true);
        })
        .finally(() => {
          if (button) button.disabled = false;
        });
    },
    true,
  );
  document.addEventListener("input", (event) => {
    if (event.target.closest("#canvas-inline-form") && editor)
      localStorage.setItem(
        editor.key,
        $("#canvas-inline-form").elements.text.value,
      );
    if (event.target.id === "canvas-find") {
      search = event.target.value;
      searchResults();
    }
    if (event.target.id === "canvas-owner") {
      owner = event.target.value;
      enhance();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "canvas-status") {
      status = event.target.value;
      enhance();
    }
    if (event.target.dataset.canvasStatus)
      patchTask(
        event.target.dataset.canvasStatus,
        { status: event.target.value },
        false,
      )
        .then(() => enhance())
        .catch((e) => toast(e.message, true));
  });
  document.addEventListener(
    "dblclick",
    (event) => {
      if (
        state.view !== "board" ||
        event.target.closest("button,input,textarea,select,a")
      )
        return;
      const edge = event.target.closest("[data-edge]"),
        node = event.target.closest("[data-node]");
      if (edge) {
        event.stopImmediatePropagation();
        state.selectedEdge = edge.dataset.edge;
        connectorDialog(board().edges.find((e) => e.id === edge.dataset.edge));
      } else if (node) {
        event.stopImmediatePropagation();
        inline(index.get(node.dataset.node)).catch((e) =>
          toast(e.message, true),
        );
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (state.view !== "board" || state.dialog) return;
      if (editor) {
        if (
          event.key === "Escape" ||
          ((event.ctrlKey || event.metaKey) && event.key === "Enter")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          finishInline(event.key === "Escape");
        }
        return;
      }
      if (event.target.closest("input,textarea,select,[contenteditable]"))
        return;
      const command = event.ctrlKey || event.metaKey;
      if (
        presenting >= 0 &&
        ["ArrowRight", "ArrowLeft", "Escape"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        click(
          event.key === "Escape"
            ? "present-exit"
            : event.key === "ArrowRight"
              ? "slide-next"
              : "slide-prev",
        );
        return;
      }
      if (event.key === "Enter" && pick().length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        inline().catch((e) => toast(e.message, true));
      }
      if (event.shiftKey && event.code === "Digit2") {
        event.preventDefault();
        event.stopImmediatePropagation();
        focus(pick());
      }
      if (command && event.key.toLowerCase() === "c" && pick().length) {
        event.preventDefault();
        const nodes = structuredClone(pick()),
          ids = new Set(nodes.map((n) => n.id));
        clipboard = {
          nodes,
          edges: structuredClone(
            board().edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
          ),
        };
        toast(`${nodes.length} objects copied.`);
      }
      if (command && event.key.toLowerCase() === "v" && clipboard) {
        event.preventDefault();
        insertTemplate("clipboard", clipboard);
      }
      if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
          event.key,
        ) &&
        pick().length
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const step = event.shiftKey ? 30 : 5;
        changeBoard(() =>
          pick()
            .filter((n) => !n.locked)
            .forEach((n) => {
              n.x +=
                event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0;
              n.y +=
                event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0;
            }),
        );
      }
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      const canvas = event.target.closest("#canvas");
      if (!canvas) return;
      if (event.target.closest("#canvas-minimap")) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const el = $("#canvas-minimap canvas"),
          r = el.getBoundingClientRect(),
          { box, scale } = el._map;
        const x = box.x + (event.clientX - r.left - 5) / scale,
          y = box.y + (event.clientY - r.top - 5) / scale;
        state.camera.x = canvas.clientWidth / 2 - x * state.camera.z;
        state.camera.y = canvas.clientHeight / 2 - y * state.camera.z;
        updateCamera();
        return;
      }
      if (
        event.target.closest(
          ".canvas-panel,.canvas-find,.canvas-filters,#canvas-presence,#presentation-controls,.inline-editing",
        )
      ) {
        event.stopImmediatePropagation();
        return;
      }
      const edge = event.target.closest("[data-edge]");
      if (edge && state.tool !== "hand") {
        event.stopImmediatePropagation();
        state.selectedEdge = edge.dataset.edge;
        state.selectedNode = null;
        selected.clear();
        basic.selection();
        $$(".canvas-edge").forEach((el) =>
          el.classList.toggle(
            "selected",
            el.dataset.edge === state.selectedEdge,
          ),
        );
        $(".board-selection")?.remove();
        canvas.insertAdjacentHTML(
          "beforeend",
          `<div class="board-selection">${btn("edge-edit", "Edit connection")}<button class="button small" data-action="edge-delete">Remove connector</button></div>`,
        );
        return;
      }
      const handle = event.target.closest("[data-port]");
      if (handle) {
        event.preventDefault();
        event.stopImmediatePropagation();
        connecting = {
          from: handle.dataset.source,
          fromSide: handle.dataset.port,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (
        event.pointerType === "pen" &&
        event.button === 0 &&
        !event.target.closest("button,input,select")
      )
        state.tool = "draw";
      if (
        event.pointerType === "touch" &&
        !event.target.closest("button,input,select")
      ) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
          basic.cancel();
          touchPan = null;
          const [a, b] = [...touches.values()];
          gesture = {
            distance: Math.hypot(b.x - a.x, b.y - a.y),
            mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            camera: { ...state.camera },
          };
          event.stopImmediatePropagation();
          event.preventDefault();
          canvas.setPointerCapture(event.pointerId);
          return;
        }
        if (
          (!event.target.closest("[data-node],[data-edge]") ||
            ["sticky", "text", "shape"].includes(state.tool)) &&
          state.tool !== "draw"
        ) {
          touchPan = {
            start: { x: event.clientX, y: event.clientY },
            camera: { ...state.camera },
          };
          canvas.setPointerCapture(event.pointerId);
          event.stopImmediatePropagation();
          event.preventDefault();
          return;
        }
      }
      if (
        !event.target.closest("[data-node],button,input,select,[data-edge]") &&
        state.tool === "cursor" &&
        !event.shiftKey &&
        $$(".board-node").length < board().nodes.length
      ) {
        const p = point(event),
          hit = [...board().nodes]
            .reverse()
            .find(
              (n) =>
                !hidden.has(n.id) &&
                n.type !== "frame" &&
                p.x >= n.x &&
                p.x <= n.x + n.w &&
                p.y >= n.y &&
                p.y <= n.y + n.h,
            );
        if (hit) {
          event.preventDefault();
          event.stopImmediatePropagation();
          reveal(hit);
        }
      }
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (state.view !== "board" || !$("#canvas")) return;
      if (event.target.closest("#canvas")) cursor = point(event);
      if (connecting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const n = index.get(connecting.from),
          p = port(n, connecting.fromSide),
          q = point(event);
        $("#connection-draft")?.remove();
        $("#canvas-lines")?.insertAdjacentHTML(
          "beforeend",
          `<path id="connection-draft" d="M${p.x},${p.y} L${q.x},${q.y}" stroke="#526d42" stroke-dasharray="6 4" fill="none"/>`,
        );
        return;
      }
      if (touches.has(event.pointerId))
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture && touches.size >= 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const [a, b] = [...touches.values()],
          r = $("#canvas").getBoundingClientRect(),
          z = Math.min(
            3,
            Math.max(
              0.08,
              (gesture.camera.z * Math.hypot(b.x - a.x, b.y - a.y)) /
                Math.max(1, gesture.distance),
            ),
          );
        state.camera = {
          z,
          x:
            (a.x + b.x) / 2 -
            r.left -
            ((gesture.mid.x - r.left - gesture.camera.x) / gesture.camera.z) *
              z,
          y:
            (a.y + b.y) / 2 -
            r.top -
            ((gesture.mid.y - r.top - gesture.camera.y) / gesture.camera.z) * z,
        };
        updateCamera();
        return;
      }
      if (touchPan && touches.size === 1) {
        if (
          Math.hypot(
            event.clientX - touchPan.start.x,
            event.clientY - touchPan.start.y,
          ) > 8
        )
          touchPan.moved = true;
        event.preventDefault();
        event.stopImmediatePropagation();
        state.camera.x = touchPan.camera.x + event.clientX - touchPan.start.x;
        state.camera.y = touchPan.camera.y + event.clientY - touchPan.start.y;
        updateCamera();
      }
    },
    true,
  );
  function endPointer(event, cancel = false) {
    if (connecting) {
      event.stopImmediatePropagation();
      const target = document.elementFromPoint(event.clientX, event.clientY),
        el = target?.closest("[data-node]"),
        to = el?.dataset.node,
        handle = target?.closest("[data-port]");
      if (!cancel && to && to !== connecting.from) {
        const connection = {
          ...connecting,
          to,
          id: uid("e"),
          toSide: handle?.dataset.port || undefined,
          routing: "curve",
          relationship: "relates",
        };
        changeBoard((b) => b.edges.push(connection));
      }
      connecting = null;
      $("#connection-draft")?.remove();
      return;
    }
    if (touches.has(event.pointerId)) {
      const place =
        !cancel &&
        !gesture &&
        touchPan &&
        !touchPan.moved &&
        touches.size === 1;
      touches.delete(event.pointerId);
      if (gesture || touchPan) {
        event.stopImmediatePropagation();
        if (touches.size < 2) gesture = null;
        if (!touches.size) touchPan = null;
        camera();
        if (place) basic.place(event);
      }
    }
  }
  document.addEventListener("pointerup", (e) => endPointer(e), true);
  document.addEventListener("pointercancel", (e) => endPointer(e, true), true);
  window.addEventListener("blur", () => {
    touches.clear();
    gesture = null;
    touchPan = null;
    connecting = null;
  });
  const memberColor = (m) => {
    let h = 0;
    for (const c of m.client) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 42% 40%)`;
  };
  function paintPresence() {
    const el = $("#canvas-presence"),
      layer = $("#canvas-cursors");
    if (!el || !layer) return;
    const others = members.filter((m) => m.client !== sync.client);
    el.innerHTML = `${btn("participant", esc(name()))}<span>${others.length ? `${others.length + 1} here` : "Just you"}</span>${others.map((m) => `<span class="participant-chip" style="border-color:${memberColor(m)}" title="${esc(m.name)}">${esc(m.name.slice(0, 16))}</span>`).join("")}`;
    const c = state.camera;
    layer.innerHTML = others
      .map(
        (m) =>
          `<div class="participant-cursor" style="left:${m.x * c.z + c.x}px;top:${m.y * c.z + c.y}px;color:${memberColor(m)}"><span>↖</span><label>${esc(m.name)}</label></div>${m.selection
            .map((id) => {
              const n = index.get(id);
              return n
                ? `<div class="participant-selection" style="left:${n.x * c.z + c.x}px;top:${n.y * c.z + c.y}px;width:${n.w * c.z}px;height:${(n.collapsed ? 48 : n.h) * c.z}px;border-color:${memberColor(m)}"></div>`
                : "";
            })
            .join("")}`,
      )
      .join("");
  }
  async function heartbeat() {
    if (heartbeatBusy) return;
    const current =
      state.view === "board" && board() ? route("boards", board().id) : null;
    if (!current) {
      if (lastRoom) {
        const old = lastRoom;
        lastRoom = null;
        api(old + "/presence", {
          method: "POST",
          body: { client: sync.client, leave: true },
        }).catch(() => {});
      }
      return;
    }
    heartbeatBusy = true;
    try {
      if (lastRoom && lastRoom !== current)
        await api(lastRoom + "/presence", {
          method: "POST",
          body: { client: sync.client, leave: true },
        });
      lastRoom = current;
      const result = await api(current + "/presence", {
        method: "POST",
        body: {
          client: sync.client,
          name: name(),
          ...cursor,
          selection: [...selected],
        },
      });
      if (current !== route("boards", board()?.id)) return;
      members = result.members;
      paintPresence();
      if (presenceVersion !== result.version) {
        presenceVersion = result.version;
        notes.clear();
        if (
          !editor &&
          !basic.busy() &&
          !sync.entries.size &&
          !state.dialog &&
          !document.activeElement?.matches("input,textarea,select")
        ) {
          await ctx.refresh();
        }
      }
    } catch {
      /* The normal save indicator reports connection failure; the room reconnects automatically. */
    } finally {
      heartbeatBusy = false;
    }
  }
  setInterval(heartbeat, 800);
  window.addEventListener("beforeunload", (e) => {
    if (editor) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  window.addEventListener("resize", camera);
  function beforeRender() {
    if (!editor) return;
    const form = $("#canvas-inline-form");
    if (form)
      try {
        localStorage.setItem(editor.key, form.elements.text.value);
      } catch {}
    editor = null;
    state.canvasEditing = false;
  }
  return {
    render,
    updateUndo,
    beforeRender,
    selection,
    visible,
    edges,
    camera,
    enhance,
    click,
    connectorDialog,
    busy: () => !!editor || !!connecting || !!gesture,
    exportCanvas: () => encodeCanvas(board()),
  };
}
