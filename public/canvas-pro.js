import { boardComments } from "./board-comments.js";
import { assigneeOptions, assigneeHint, projectPeople } from "./teams.js";
import {
  nextStatuses,
  statusLabel,
  canTransition,
  statusColor,
} from "./workflow-model.js";
import { viewportCache, viewportRect } from "./viewport-cache.js";
import { boardSession } from "./board-session.js";
import { paintObjectGeometry } from "./object-geometry.js";
import { timelineHTML } from "./task-timeline.js";
import { frameThumbnail } from "./frame-export.js";
import { lineJumps } from "./connector-path.js";
import { paintTextStyle, textStyleControls } from "./object-text.js";
import { penActive } from "./pen-tools.js";
import { gridHTML, gridCell } from "./board-grid.js";
import { syncGrid, gridTracks, cellBounds } from "./grid-model.js";
import {
  reflowGridContents,
  frameDepth,
  updateFrameMembership,
  frameContents,
  frameSlides,
  orderedFrames,
  reorderFrame,
} from "./frame-model.js";
import { textAlignment } from "./text-alignment.js";
import { connectorStyle } from "./connector-style.js";
import { connectorTarget, connectorPreview } from "./connector-drag.js";
import {
  placeholder,
  defaultText,
  markNodeOverflow,
  isTaskNote,
  nodeMinimum,
  nodeFill,
} from "./node-layout.js";
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
    icon,
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
  const sessionTools = boardSession(ctx, basic);
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-session-dismiss],[data-follow]"))
      $("#session-invitation")?.remove();
  });
  let parents = new Map(),
    hidden = new Set(),
    index = new Map(),
    editor = null,
    connecting = null,
    hoverPointer = null,
    converting = false,
    cameraFrame = null,
    undoBusy = false;
  let identity = "",
    frameSignature = "",
    outlineOpen = false,
    searchOpen = false,
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
    hidden = presenting >= 0 ? new Set() : hiddenByFrame(b.nodes, parents);
  }
  const viewport = viewportCache();
  let viewportCleanup = null;
  function rect() {
    const canvas = $("#canvas");
    return viewportRect(
      state.camera,
      canvas?.clientWidth || 1200,
      canvas?.clientHeight || 700,
      700,
    );
  }
  function visible(b = board(), { limit = true } = {}) {
    rebuild(b);
    if (!limit) {
      const r = rect();
      return b.nodes.filter(
        (n) => !hidden.has(n.id) && (selected.has(n.id) || intersects(n, r)),
      );
    }
    const canvas = $("#canvas");
    return viewport.choose(b.nodes, {
      key: `${state.project?.id}:${b.id}`,
      camera: state.camera,
      width: canvas?.clientWidth || 1200,
      height: canvas?.clientHeight || 700,
      selected,
      hidden,
      now: performance.now(),
    });
  }

  function effectiveNode(id) {
    let n = index.get(id);
    const seen = new Set();
    while (n && hidden.has(n.id) && !seen.has(n.id)) {
      seen.add(n.id);
      n = index.get(parents.get(n.id));
    }
    return n?.collapsed && presenting < 0 ? { ...n, h: 48 } : n;
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
      if (e.lineJumps && ["straight", "elbow"].includes(e.routing)) {
        const routes = b.edges
          .filter(
            (other) =>
              other.id !== e.id &&
              ["straight", "elbow"].includes(other.routing),
          )
          .map((other) => {
            const start = index.get(other.from),
              end = index.get(other.to);
            return start && end ? routeEdge(other, start, end).points : [];
          });
        p.d = lineJumps(p.points, routes);
      }
      const style = connectorStyle(e, color, esc);
      content += `<g data-edge="${esc(e.id)}"><defs>${style.defs}</defs>${exporting ? "" : `<path class="connector-selection" d="${p.d}" fill="none" stroke-width="${style.width + 8 / state.camera.z}" aria-hidden="true"/><path class="connector-hit" d="${p.d}" fill="none" stroke="transparent" stroke-width="${Math.max(12 / state.camera.z, e.width || 2)}"/>`}<path class="canvas-edge ${basic.selectedEdges.has(e.id) || e.id === state.selectedEdge ? "selected" : ""}" data-edge="${esc(e.id)}" d="${p.d}" fill="none" stroke="${esc(color)}" ${style.attrs}/>${e.label || (e.relationship && e.relationship !== "relates") ? `<text class="edge-label" data-edge="${esc(e.id)}" data-edge-label="main" x="${p.x + (e.labelOffset?.x || 0)}" y="${p.y - 9 + (e.labelOffset?.y || 0)}">${esc(e.label || e.relationship)}</text>` : ""}${(e.labels || []).map((label, i) => `<text class="edge-label" data-edge="${esc(e.id)}" data-edge-label="${i}" x="${p.x + label.x}" y="${p.y + label.y}">${esc(label.text)}</text>`).join("")}</g>`;
    }
    return content + (exporting ? "" : endpointHandles(b));
  }
  function endpointHandles(b = board()) {
    let content = "";
    if (!connecting && state.selectedEdge) {
      const e = b.edges.find((edge) => edge.id === state.selectedEdge),
        a = e && effectiveNode(e.from),
        c = e && effectiveNode(e.to);
      if (a && c) {
        const path = routeEdge(e, a, c);
        for (const [i, p] of (e.bends || []).entries())
          content += `<circle class="connector-endpoint connector-bend" data-edge="${esc(e.id)}" data-bend="${i}" cx="${p.x}" cy="${p.y}" r="${6 / state.camera.z}" aria-label="Drag bend; double-click to remove"/>`;
        if ((e.bends?.length || 0) < 20)
          content += `<circle class="connector-endpoint connector-bend new-bend" data-edge="${esc(e.id)}" data-bend="new" cx="${path.x}" cy="${path.y}" r="${5 / state.camera.z}" aria-label="Drag to add bend"/>`;
        for (const [end, p] of [
          ["from", path.p],
          ["to", path.q],
        ])
          content += `<circle class="connector-endpoint" data-edge="${esc(e.id)}" data-edge-end="${end}" cx="${p.x}" cy="${p.y}" r="${7 / state.camera.z}" aria-label="Drag connection ${end === "from" ? "start" : "end"}"/>`;
      }
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
        `${t.key || ""} ${(t.aliases || []).join(" ")} ${t.title} ${t.body} ${t.tags?.join(" ")}`
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
    if (n.viewType === "timeline")
      return (
        `<div class="query-title">${esc(n.text || "Live tasks")}</div>` +
        timelineHTML(tasks, ctx, n.timelineScale || "week", n.id)
      );
    if (n.viewType === "kanban")
      return `<div class="query-title">${esc(n.text || "Live tasks")}</div><div class="embedded-kanban">${state.config.statuses
        .map(
          (status) =>
            `<section data-live-status="${esc(status)}"><strong>${esc(statusLabel(state.config, status))}</strong>${tasks
              .filter((t) => t.status === status)
              .map(
                (t) =>
                  `<button draggable="true" data-live-task="${esc(t.id)}" data-pro="open-task" data-task="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button>`,
              )
              .join("")}</section>`,
        )
        .join("")}</div>`;
    if (n.viewType === "table") {
      const fields = n.visibleFields || [
        "key",
        "title",
        "status",
        "assignee",
        "due",
      ];
      return `<div class="query-title">${esc(n.text || "Live tasks")}</div><div class="embedded-table"><table><thead><tr>${fields.map((f) => `<th>${esc(f)}</th>`).join("")}</tr></thead><tbody>${tasks
        .map(
          (t) =>
            `<tr>${fields
              .map(
                (f) =>
                  `<td>${
                    f === "status"
                      ? `<select data-canvas-status="${esc(t.id)}" aria-label="Task status">${nextStatuses(
                          state.config,
                          t.status,
                        )
                          .map(
                            (s) =>
                              `<option value="${esc(s)}" ${s === t.status ? "selected" : ""}>${esc(statusLabel(state.config, s))}</option>`,
                          )
                          .join("")}</select>`
                      : f === "title"
                        ? `<button data-pro="open-task" data-task="${esc(t.id)}">${esc(t.title)}</button>`
                        : esc(t[f] || "")
                  }</td>`,
              )
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></div>`;
    }
    return `<div class="query-title"><span class="query-label ${defaultText(n) ? "is-placeholder" : ""}">${esc(n.text || "Live tasks")}</span> <span>${tasks.length}</span></div><div class="query-rows">${
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
  function enhance(only = null) {
    if (!board()) return;
    const byTask = new Map(state.tasks.map((t) => [t.id, t]));
    for (const el of $$(".board-node")) {
      const n = index.get(el.dataset.node);
      if (
        !n ||
        editor?.id === n.id ||
        (only && !(only instanceof Set ? only.has(n.id) : n.id === only))
      )
        continue;
      el.style.height = `${n.collapsed && presenting < 0 ? 48 : n.h}px`;
      el.classList.toggle("collapsed-frame", !!n.collapsed && presenting < 0);
      if (["frame", "grid"].includes(n.type)) {
        el.style.zIndex = String(frameDepth(n.id, parents) - 501);
        if (/^#[0-9a-f]{6}$/i.test(n.color || "")) {
          const rgb = n.color
            .slice(1)
            .match(/../g)
            .map((v) => parseInt(v, 16) / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            );
          el.style.color =
            rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179
              ? "#172a20"
              : "#ffffff";
        } else el.style.removeProperty("color");
      }
      if (n.type === "task") {
        const t = byTask.get(n.task);
        if (!t) continue;
        const asNote = isTaskNote(n),
          flags = taskFlags(t),
          section = markdownSlice(t.body || "", n.subpath || ""),
          commentCount = n.comments?.filter((c) => !c.deleted).length || 0;
        el.classList.toggle("overdue", !asNote && flags.overdue);
        el.classList.toggle("blocked-task", !asNote && flags.blocked);
        el.classList.toggle(
          "dimmed",
          !asNote &&
            ((!!owner &&
              !t.assignee?.toLowerCase().includes(owner.toLowerCase())) ||
              (!!status && t.status !== status)),
        );
        el.classList.toggle("task-as-note", asNote);
        el.classList.toggle("sticky", asNote);
        el.classList.toggle("task", !asNote);
        if (asNote) {
          el.innerHTML = `<div class="note-content ${section?.text ? "has-body" : ""}"><div class="note-title canvas-markdown" data-inline-title>${esc(t.title)}</div><div class="note-body node-text canvas-markdown">${section ? (section.text ? markdown(section.text) : "") : "<p>Heading or block not found.</p>"}</div></div>`;
        } else {
          el.innerHTML = `<div class="live-card-heading"><strong class="task-title" data-inline-title>${esc(t.title)}</strong><div class="live-card-actions">${btn("comments", icon("comment") + (commentCount ? `<span class="task-comment-count" aria-hidden="true">${commentCount}</span>` : ""), `data-id="${esc(n.id)}" aria-label="Comments on ${esc(t.title)}${commentCount ? ` (${commentCount})` : ""}" title="Comments${commentCount ? ` (${commentCount})` : ""}"`)}${btn("task-details", "↗", `data-task="${esc(t.id)}" aria-label="Open task details" title="Expand task"`)}</div></div><div class="live-card-state"><span class="canvas-task-key" title="${esc(t.key || t.id)} · ${esc(ctx.label(t.type))}">${esc(t.key || t.id)}</span><label class="canvas-task-priority priority ${esc(t.priority || "none")}" title="Priority: ${esc(ctx.label(t.priority || "none"))}">${icon(`priority-${t.priority || "none"}`)}<select data-canvas-task-field="priority" data-task="${esc(t.id)}" aria-label="Priority for ${esc(t.title)}">${["none", "low", "medium", "high", "urgent"].map((value) => `<option value="${value}" ${value === (t.priority || "none") ? "selected" : ""}>${ctx.label(value)}</option>`).join("")}</select></label><select class="canvas-task-status" style="--task-status-color:${statusColor(state.config, t.status)}" data-canvas-status="${esc(t.id)}" aria-label="Task status" title="${esc(statusLabel(state.config, t.status))}">${nextStatuses(
            state.config,
            t.status,
          )
            .map(
              (s) =>
                `<option value="${esc(s)}" ${s === t.status ? "selected" : ""}>${esc(statusLabel(state.config, s))}</option>`,
            )
            .join(
              "",
            )}</select><select class="canvas-task-assignee" data-canvas-task-field="assignee" data-task="${esc(t.id)}" aria-label="Assignee for ${esc(t.title)}" title="${esc(assigneeHint(state) || t.assignee || "Unassigned")}">${assigneeOptions(state, t.assignee, esc)}</select></div>${flags.overdue || flags.blocked ? `<div class="canvas-task-flags">${flags.overdue ? "<b>Overdue</b>" : ""}${flags.blocked ? "<b>Blocked</b>" : ""}</div>` : ""}${n.h > 175 ? `<div class="canvas-markdown">${section ? (section.text ? markdown(section.text) : '<span class="is-placeholder">Add task notes…</span>') : "<p>Heading or block not found.</p>"}</div>` : ""}${n.subpath ? `<small class="embed-label">${esc(n.subpath)}</small>` : ""}`;
        }
      } else if (n.type === "file") {
        loadNote(n);
        const note = notes.get(n.file),
          section =
            note && !note.error
              ? markdownSlice(note.body, n.subpath || "")
              : null;
        el.innerHTML = `<strong>${esc(n.file?.split("/").pop() || "Note")}${n.subpath ? ` · ${esc(n.subpath)}` : ""}</strong><div class="canvas-markdown">${note?.error ? esc(note.error) : section ? (section.text ? markdown(section.text) : '<span class="is-placeholder">Add notes…</span>') : note ? "Heading or block not found." : "Loading note…"}</div>`;
      } else if (n.type === "grid") el.innerHTML = gridHTML(n, ctx);
      else if (n.type === "query") el.innerHTML = queryRows(n);
      else if (n.type === "link")
        el.innerHTML = `<span>Link</span><a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.url)}</a><small>Opens in a new tab</small>`;
      else if (["text", "sticky", "shape"].includes(n.type))
        el.innerHTML = `<div class="node-text canvas-markdown ${defaultText(n) ? "is-placeholder" : ""}">${n.text ? markdown(n.text) : esc(placeholder(n))}</div>`;
      else if (n.type === "frame")
        el.innerHTML = `<div class="node-text frame-title ${defaultText(n) ? "is-placeholder" : ""}">${esc(n.text || "")}</div>`;
      else if (["image", "draw"].includes(n.type)) {
        const existing = el.querySelector(":scope > .board-node-content");
        if (existing) el.replaceChildren(...existing.childNodes);
        el.querySelector(".object-caption")?.remove();
        if (n.type !== "draw" || n.text)
          el.insertAdjacentHTML(
            "beforeend",
            `<div class="object-caption ${defaultText(n) ? "is-placeholder" : ""}">${esc(n.text || placeholder(n))}</div>`,
          );
      }
      // Clip contents, while connection ports and resize handles remain outside.
      if (!el.querySelector(":scope > .board-node-content")) {
        const content = document.createElement("div");
        content.className = "board-node-content";
        content.append(...el.childNodes);
        el.append(content);
      }
      paintTextStyle(el, n);
      paintObjectGeometry(el, n, esc);
      if (
        !(n.type === "task" && !isTaskNote(n)) &&
        n.comments?.some((c) => !c.deleted)
      )
        el.insertAdjacentHTML(
          "beforeend",
          btn(
            "comments",
            `◌ ${n.comments.filter((c) => !c.deleted).length}`,
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
    requestAnimationFrame(() => markNodeOverflow());
  }
  function selection() {
    $$(".canvas-edge").forEach((el) =>
      el.classList.toggle(
        "selected",
        basic.selectedEdges.has(el.dataset.edge) ||
          el.dataset.edge === state.selectedEdge,
      ),
    );
    if (!state.selectedEdge)
      $$(".connector-endpoint, .connector-bend").forEach((el) => el.remove());
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
    if (state.tool === "connect" && !connecting && hoverPointer)
      hoverConnectionPorts({
        target: document.elementFromPoint(hoverPointer.x, hoverPointer.y),
      });
  }

  function availableUndo(operations, redo = false) {
    const inactive = new Set();
    const lastEdit = operations.findLastIndex(
      (op) => op.client === sync.client && !op.undoOf,
    );
    const oldRedos = new Set(textHistory().flatMap((entry) => entry.boundary));
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
            ? o.undoOf &&
              operations.indexOf(o) > lastEdit &&
              !oldRedos.has(o.id) &&
              !operations.find((p) => p.id === o.undoOf)?.undoOf
            : !o.undoOf),
      );
  }
  function textHistoryKey() {
    return `pencils:text-history:${sync.namespace}:${state.project?.id}:${board()?.id}`;
  }
  function textHistory() {
    try {
      return JSON.parse(
        sessionStorage.getItem(textHistoryKey()) || "[]",
      ).filter(
        (entry) =>
          !entry.undone ||
          !(board()?.operations || []).some(
            (op) =>
              op.client === sync.client &&
              !op.undoOf &&
              !entry.undoneAt?.includes(op.id),
          ),
      );
    } catch {
      return [];
    }
  }
  function storeTextHistory(history) {
    sessionStorage.setItem(
      textHistoryKey(),
      JSON.stringify(history.slice(-100)),
    );
  }
  function rememberText(url, base, after) {
    const pending = sync.entries.get(route("boards", board().id));
    const boundary = (board().operations || []).map((op) => op.id);
    if (pending?.delivery) boundary.push(pending.delivery.operationId);
    const history = textHistory().filter((entry) => !entry.undone);
    history.push({
      url,
      before: Object.fromEntries(
        Object.keys(after).map((key) => [key, base[key]]),
      ),
      after,
      boundary,
    });
    storeTextHistory(history);
  }
  function rememberDisplay(before, after, shared = false) {
    const pending = sync.entries.get(route("boards", board().id));
    const boundary = (board().operations || []).map((op) => op.id);
    if (pending?.delivery) boundary.push(pending.delivery.operationId);
    const history = textHistory().filter((entry) => !entry.undone);
    history.push({
      kind: "display",
      before,
      after,
      boundary,
      // Pair a reset/pattern change with its shared operation when it is the
      // current delivery; otherwise keep the local change independently undoable.
      boardOperation:
        shared &&
        pending?.delivery &&
        pending.delivery.generation === pending.generation
          ? pending.delivery.operationId
          : null,
    });
    storeTextHistory(history);
    updateUndo();
  }
  function textUndo(history, operation, redo) {
    const entry = redo
      ? history.find((e) => e.undone)
      : history.findLast((e) => !e.undone);
    if (!entry || !operation) return entry;
    if (
      entry.kind === "display" &&
      operation.id === (redo ? entry.undoOperation : entry.boardOperation)
    )
      return entry;
    return (
      redo
        ? !entry.boundary.includes(operation.undoOf)
        : entry.boundary.includes(operation.id)
    )
      ? entry
      : null;
  }
  async function keyboardUndo(redo = false) {
    if (!finishInline()) return;
    await basic.flush();
    await Promise.all([...sync.entries.values()].map((entry) => entry.promise));
    if (sync.entries.size)
      throw new Error("Finish saving or resolve pending edits before undo.");
    const { operations } = await api(
      route("boards", board().id) + "/operations",
    );
    const operation = availableUndo(operations, redo);
    const history = textHistory(),
      entry = textUndo(history, operation, redo);
    if (entry?.kind === "display") {
      const linked =
        entry.boardOperation &&
        operations.find(
          (op) => op.id === (redo ? entry.undoOperation : entry.boardOperation),
        );
      if (linked) {
        const undoId = uid("undo");
        await api(route("boards", board().id) + "/undo", {
          method: "POST",
          body: {
            operation: linked.id,
            operationId: undoId,
            client: sync.client,
          },
        });
        if (!redo) entry.undoOperation = undoId;
      }
      basic.setDisplay(redo ? entry.after : entry.before);
      entry.undone = !redo;
      // Include the paired undo operation so redo remains available.
      entry.undoneAt = [
        ...operations.map((op) => op.id),
        entry.undoOperation,
      ].filter(Boolean);
      storeTextHistory(history);
      await ctx.refresh();
      return;
    }
    if (entry) {
      const current = await api(entry.url),
        expected = redo ? entry.before : entry.after,
        changes = redo ? entry.after : entry.before;
      if (Object.keys(expected).some((key) => current[key] !== expected[key]))
        throw new Error(
          "This text has changed since your edit. Undo stopped to preserve the newer text.",
        );
      await api(entry.url, {
        method: "PATCH",
        body: { ...changes, file: current.file, revision: current.revision },
      });
      entry.undone = !redo;
      entry.undoneAt = operations.map((op) => op.id);
      storeTextHistory(history);
      notes.clear();
      await ctx.refresh();
      return;
    }
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
      if (undoBusy) return;
      undoBusy = true;
      updateUndo();
      keyboardUndo(button.dataset.action === "board-redo")
        .catch((e) => toast(e.message, true))
        .finally(() => {
          undoBusy = false;
          updateUndo();
        });
    },
    true,
  );
  function updateUndo() {
    for (const action of ["undo", "redo"]) {
      const button = $(`[data-action="board-${action}"]`);
      if (button)
        button.disabled =
          undoBusy ||
          (!(
            action === "undo" &&
            (editor || sync.entries.has(route("boards", board()?.id)))
          ) &&
            !availableUndo(board()?.operations || [], action === "redo") &&
            !textHistory().some(
              (entry) => !!entry.undone === (action === "redo"),
            ));
    }
  }
  function render() {
    commentPanel.sync();
    const b = board();
    if (!b || !$("#canvas")) return;
    if (identity !== b.id) {
      identity = b.id;
      search = "";
      searchOpen = false;
      owner = "";
      status = "";
      presenting = -1;
      members = [];
      notes.clear();
    }
    rebuild();
    updateUndo();
    $("#canvas-extras")?.insertAdjacentHTML(
      "afterbegin",
      `<button type="button" class="button small" data-session="open">Board session</button>${btn("note-add", "Live note")}${btn("query-add", "Live task view")}${btn("templates", "Templates")}${btn("outline", "Outline")}${btn("present", "Present")}${btn("activity", "Activity")}${btn("shortcuts", "?", 'aria-label="Board shortcuts"')}`,
    );
    $("#canvas").insertAdjacentHTML(
      "beforeend",
      `<canvas id="canvas-overview" aria-hidden="true"></canvas><aside id="canvas-outline" class="canvas-panel ${outlineOpen ? "" : "hidden"}"></aside><div id="canvas-presence" class="canvas-presence"></div><div id="canvas-cursors" aria-hidden="true"></div><div id="canvas-search-panel" class="canvas-panel canvas-search-panel ${searchOpen ? "" : "hidden"}" role="region" aria-label="Board search and filters"><div class="canvas-find"><input id="canvas-find" type="search" aria-label="Find board objects" placeholder="Find on board…" value="${esc(search)}"><div id="canvas-find-results"></div></div><div class="canvas-filters"><input id="canvas-owner" aria-label="Filter canvas by owner" placeholder="Owner" value="${esc(owner)}"><select id="canvas-status" aria-label="Filter canvas by status"><option value="">Every status</option>${state.config.statuses.map((s) => `<option value="${esc(s)}" ${s === status ? "selected" : ""}>${esc(statusLabel(state.config, s))}</option>`).join("")}</select></div></div><button id="canvas-minimap" aria-label="Minimap: click to navigate"><canvas width="200" height="125"></canvas></button>`,
    );
    updateSearchButton();
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
      connecting ||
      basic.busy({ allowNavigation: true })
    )
      return;
    const started = performance.now(),
      nodes = visible(),
      ids = new Set(nodes.map((n) => n.id));
    const existing = new Map(
      $$(".board-node").map((el) => [el.dataset.node, el]),
    );
    const added = new Set(
      nodes.filter((n) => !existing.has(n.id)).map((n) => n.id),
    );
    for (const [id, el] of existing) if (!ids.has(id)) el.remove();
    if (added.size) {
      $("#canvas-world").insertAdjacentHTML(
        "beforeend",
        nodes
          .filter((n) => added.has(n.id))
          .map(ctx.nodeHTML)
          .join(""),
      );
      basic.enhanceBase(added);
      enhance(added);
    }
    const svg = $("#canvas-lines");
    if (svg) {
      const markup = edges();
      if (svg._cameraMarkup !== markup) {
        svg.querySelectorAll("[data-edge]").forEach((el) => el.remove());
        svg.insertAdjacentHTML("beforeend", markup);
        svg._cameraMarkup = markup;
      }
    }
    paintMap();
    paintPresence();
    paintOverview(ids);
    const label = $("#canvas-performance");
    if (label)
      label.textContent = `${board().nodes.length.toLocaleString()} objects · ${nodes.length} detailed · ${(performance.now() - started).toFixed(0)} ms`;
  }
  function camera() {
    commentPanel.position();
    positionInline();
    basic.positionToolbar();
    if (!cameraFrame) cameraFrame = requestAnimationFrame(reconcile);
    clearTimeout(viewportCleanup);
    viewportCleanup = setTimeout(() => {
      viewportCleanup = null;
      if (!cameraFrame) cameraFrame = requestAnimationFrame(reconcile);
    }, 1300);
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
        g.fillStyle = nodeFill(n, "#dce5d8");
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
        g.fillStyle = nodeFill(n, "#a4b69a");
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
  function updateSearchButton() {
    const button = $('[data-pro="search-toggle"]');
    if (!button) return;
    button.setAttribute("aria-expanded", String(searchOpen));
    button.classList.toggle("active", searchOpen);
    button.classList.toggle("has-filters", !!(owner || status));
    button.setAttribute(
      "aria-label",
      owner || status ? "Search board (filters active)" : "Search board",
    );
  }
  function showSearch(open, focus = false) {
    searchOpen = open;
    $("#canvas-search-panel")?.classList.toggle("hidden", !open);
    updateSearchButton();
    if (focus) $(open ? "#canvas-find" : '[data-pro="search-toggle"]')?.focus();
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        searchOpen &&
        !event.target.closest('#canvas-search-panel,[data-pro="search-toggle"]')
      )
        showSearch(false);
    },
    true,
  );
  function searchResults() {
    const el = $("#canvas-find-results");
    if (!el) return;
    const results = search
      ? board()
          .nodes.filter((n) =>
            `${n.text || ""} ${task(n.task)?.key || ""} ${(task(n.task)?.aliases || []).join(" ")} ${task(n.task)?.title || ""} ${n.file || ""} ${n.src || ""}`
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
    {
      state.selectedEdge = null;
      state.selectedEdges?.clear();
    }
    focus([n]);
    basic.selection();
  }
  function positionInline() {
    const tools = $(".inline-floating-tools"),
      el = editor && $(`[data-node="${CSS.escape(editor.id)}"]`),
      canvas = $("#canvas");
    if (!tools || !el || !canvas) return;
    const r = el.getBoundingClientRect(),
      c = canvas.getBoundingClientRect();
    tools.style.maxWidth = `${Math.max(180, c.width - 24)}px`;
    const w = tools.offsetWidth,
      h = tools.offsetHeight;
    const titleTop =
      el.querySelector(".grid-grip")?.getBoundingClientRect().top ?? r.top;
    let y = Math.min(r.top, titleTop) - c.top - h - 12;
    if (y < 100) y = r.bottom - c.top + 12;
    tools.style.left = `${Math.max(12, Math.min(c.width - w - 12, r.left - c.left + (r.width - w) / 2))}px`;
    tools.style.top = `${Math.max(100, Math.min(c.height - h - 60, y))}px`;
    editor?.rich?.positionMenus();
  }
  async function inline(n = pick()[0], focusTitle = false) {
    rebuild();
    n = index.get(n?.id);
    if (!n || n.locked || editor) return;

    const gridTitle = n.type === "grid" && focusTitle;
    let note = null,
      text = gridTitle
        ? n.grid.title || ""
        : n.type === "grid"
          ? n.grid.cells[gridCell(state, n).row][gridCell(state, n).column].text
          : n.text || "";
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
    const cell = n.type === "grid" && !gridTitle ? gridCell(state, n) : null;
    const key = `pencils:inline:${state.project.id}:${board().id}:${n.id}${cell ? `:${cell.row}:${cell.column}` : gridTitle ? ":title" : ""}`,
      stored = localStorage.getItem(key);
    const el = $(`[data-node="${CSS.escape(n.id)}"]`);
    if (!el) return;
    editor = {
      id: n.id,
      cell,
      gridTitle,
      note: note ? structuredClone(note) : null,
      key,
      original: text,
    };
    state.canvasEditing = true;
    el.classList.add("inline-editing");
    el.querySelectorAll(".connection-port,.resize-handle").forEach((port) =>
      port.remove(),
    );
    $("#selection-tools")?.remove();
    const content = el.querySelector(".board-node-content") || el;
    const form = document.createElement("form");
    form.id = "canvas-inline-form";
    form.append(...content.childNodes);
    content.append(form);
    const plain =
      gridTitle || ["frame", "query", "link", "image", "draw"].includes(n.type);
    let rich = form.querySelector(
      gridTitle
        ? ".grid-title"
        : cell
          ? `[data-grid-row="${cell.row}"][data-grid-column="${cell.column}"] .grid-cell-text`
          : isTaskNote(n)
            ? ".note-body"
            : n.type === "query"
              ? ".query-label"
              : n.type === "link"
                ? "a"
                : ["image", "draw"].includes(n.type)
                  ? ".object-caption"
                  : ".canvas-markdown,.node-text",
    );
    if (!rich) {
      rich = document.createElement("div");
      rich.className = "canvas-markdown";
      form.append(rich);
    }
    if (rich.tagName === "A") {
      const replacement = document.createElement("span");
      replacement.className = rich.className;
      const linkStyle = getComputedStyle(rich);
      replacement.style.color = linkStyle.color;
      replacement.style.textDecoration = linkStyle.textDecoration;
      rich.replaceWith(replacement);
      rich = replacement;
      text = n.url || "";
    }
    rich.classList.remove("is-placeholder");
    const typography = getComputedStyle(rich);
    const textStyle = {
      font: typography.font,
      lineHeight: Number.isFinite(parseFloat(typography.lineHeight))
        ? String(
            parseFloat(typography.lineHeight) / parseFloat(typography.fontSize),
          )
        : typography.lineHeight,
      letterSpacing: typography.letterSpacing,
      textAlign: typography.textAlign,
      whiteSpace: typography.whiteSpace,
      padding: typography.padding,
    };
    Object.assign(rich.style, textStyle);
    rich.classList.add("inline-rich");
    rich.contentEditable = "true";
    rich.setAttribute("role", "textbox");
    rich.setAttribute("aria-multiline", String(!gridTitle));
    rich.setAttribute(
      "aria-label",
      gridTitle ? "Grid title" : "Rich text editor",
    );
    rich.dataset.placeholder = gridTitle
      ? "Add a title…"
      : cell
        ? "Add cell text…"
        : placeholder(n);
    rich.spellcheck = true;
    const source = document.createElement("textarea");
    source.name = "text";
    source.className = "inline-source hidden";
    source.setAttribute("aria-label", "Edit canvas Markdown");
    source.value = stored ?? text;
    const preview = document.createElement("div");
    preview.className = `${rich.className} inline-preview hidden`;
    preview.classList.remove("inline-rich");
    Object.assign(preview.style, textStyle);
    rich.after(source, preview);
    const title = form.querySelector("[data-inline-title]");
    if (title) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "title";
      input.value = note.title;
      form.append(input);
      title.contentEditable = "plaintext-only";
      title.setAttribute("role", "textbox");
      title.setAttribute(
        "aria-label",
        isTaskNote(n) ? "Note title" : "Task title",
      );
      title.addEventListener("input", () => {
        input.value = title.textContent.slice(0, 300);
      });
      title.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          rich.focus();
        }
      });
    }
    $("#canvas").insertAdjacentHTML(
      "beforeend",
      `<div class="inline-floating-tools" role="toolbar" aria-label="Edit text">${richToolbar(icon, { restored: stored !== null, alignment: gridTitle ? null : cell ? n.grid.cells[cell.row][cell.column].align || textAlignment(n) : textAlignment(n) })}${gridTitle ? "" : textStyleControls(n, ctx)}</div>`,
    );
    editor.rich = canvasRichText(form, markdown, {
      controls: $(".inline-floating-tools"),
      plain,
      reposition: positionInline,
      onAlignment(value) {
        if (
          (cell
            ? n.grid.cells[cell.row][cell.column].align
            : textAlignment(n)) === value
        )
          return;
        ctx.remember();
        if (cell) n.grid.cells[cell.row][cell.column].align = value;
        else n.textAlign = value;
        ctx.saveBoard();
        el.style.setProperty("--node-text-align", value);
        rich.style.textAlign = value;
        preview.style.textAlign = value;
      },
    });
    if (focusTitle && title) title.focus({ preventScroll: true });
    positionInline();
    updateUndo();
  }
  // Commit to the durable save queue synchronously, before the outside action
  // can navigate or start a drag. Only redraw this card so that action keeps its target.
  function finishInline() {
    if (!editor) return true;
    rebuild();
    const e = editor,
      n = index.get(e.id),
      form = $("#canvas-inline-form");
    if (!form || !n) return false;
    e.rich.flush();
    const text =
      n.type === "link" ||
      (n.type === "frame" && !form.elements.text.value.trim())
        ? form.elements.text.value.trim()
        : form.elements.text.value;
    try {
      if (
        n.type === "link" &&
        (!/^https?:\/\//i.test(text) || text.length > 2000)
      )
        throw new Error("Use an http or https link (up to 2,000 characters).");
      const removeEmptyText = n.type === "text" && !text.trim();
      if (removeEmptyText) {
        ctx.remember();
        const b = board();
        b.nodes = b.nodes.filter((node) => node.id !== n.id);
        b.edges = b.edges.filter(
          (edge) => edge.from !== n.id && edge.to !== n.id,
        );
        selected.delete(n.id);
        if (state.selectedNode === n.id)
          state.selectedNode = [...selected][0] || null;
        if (!b.edges.some((edge) => edge.id === state.selectedEdge)) {
          state.selectedEdge = null;
          state.selectedEdges?.clear();
        }
        ctx.saveBoard();
      } else if (e.gridTitle) {
        const title = text.replace(/[\r\n]+/g, " ").trim();
        if (title.length > 300)
          throw new Error("Keep the grid title under 300 characters.");
        if (title !== (n.grid.title || "")) {
          const updated = structuredClone(n);
          updated.grid.title = title;
          syncGrid(updated);
          ctx.remember();
          Object.assign(n, updated);
          ctx.saveBoard();
        }
      } else if (e.cell) {
        if (text.length > 6000)
          throw new Error("Keep cell text under 6,000 characters.");
        const cell = n.grid.cells[e.cell.row][e.cell.column];
        if (cell.text !== text) {
          const updated = structuredClone(n);
          updated.grid.cells[e.cell.row][e.cell.column].text = text;
          syncGrid(updated);
          ctx.remember();
          const before = structuredClone(board().nodes);
          if (updated.grid.resizeMode !== "manual") {
            const tracks = gridTracks(updated),
              box = cellBounds(updated, e.cell.row, e.cell.column),
              height = form.querySelector(".inline-rich")?.scrollHeight || 0;
            tracks.rows[e.cell.row] += Math.max(0, height + 32 - box.h);
            updated.grid.rows = tracks.rows;
            updated.grid.columns = tracks.columns;
            updated.h = 24 + tracks.rows.reduce((a, b) => a + b, 0);
          }
          Object.assign(n, updated);
          reflowGridContents(board().nodes, n, before);
          ctx.saveBoard();
        }
      } else if (e.note) {
        const section = markdownSlice(e.note.body || "", n.subpath || "");
        const body =
          e.note.body.slice(0, section.start) +
          text +
          (n.subpath && section.text.endsWith("\n") && !text.endsWith("\n")
            ? "\n"
            : "") +
          e.note.body.slice(section.end);
        const values =
          n.type === "task"
            ? { body, title: form.elements.title.value.trim() }
            : { body };
        if (n.type === "task" && !values.title)
          throw new Error("Give this task a title.");
        const changes = Object.fromEntries(
          Object.entries(values).filter(
            ([key, value]) => value !== e.note[key],
          ),
        );
        if (Object.keys(changes).length) {
          const url =
            n.type === "task"
              ? route("tasks", n.task)
              : route("notes") + `?file=${encodeURIComponent(n.file)}`;
          rememberText(url, e.note, changes);
          if (n.type === "task") Object.assign(task(n.task), changes);
          void sync.enqueue(url, e.note, changes);
          notes.set(noteFile(n), { ...e.note, ...changes });
        }
      } else if (text !== (n.type === "link" ? n.url || "" : n.text || "")) {
        ctx.remember();
        n.text = text;
        if (n.type === "link") n.url = text;
        ctx.saveBoard();
      }
      localStorage.removeItem(e.key);
      e.rich.destroy();
      $(".inline-floating-tools")?.remove();
      editor = null;
      state.canvasEditing = false;
      const el = $(`[data-node="${CSS.escape(n.id)}"]`);
      // Restore the normal markup, including image/drawing contents.
      if (removeEmptyText) {
        el?.remove();
        rebuild();
        ctx.updateEdges();
        basic.selection();
        paintMap();
      } else {
        if (el) el.outerHTML = ctx.nodeHTML(n);
        basic.enhanceBase(n.id);
        enhance(n.id);
        if (e.cell) basic.moveDOM();
      }
      updateUndo();
      return true;
    } catch (error) {
      $(".inline-floating-tools .inline-error").textContent = error.message;
      return false;
    }
  }
  function outsideEditor(event) {
    const targetCell = event.target.closest(".grid-cell");
    if (
      (editor?.cell || editor?.gridTitle) &&
      targetCell &&
      (editor.gridTitle ||
        +targetCell.dataset.gridRow !== editor.cell.row ||
        +targetCell.dataset.gridColumn !== editor.cell.column ||
        targetCell.closest("[data-node]")?.dataset.node !== editor.id)
    ) {
      const id = targetCell.closest("[data-node]").dataset.node;
      const row = +targetCell.dataset.gridRow,
        column = +targetCell.dataset.gridColumn;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (finishInline()) {
        state.gridCell = { id, row, column };
        inline(index.get(id)).catch((e) => toast(e.message, true));
      }
      return;
    }
    if (
      !editor ||
      event.target.closest(".inline-editing,.inline-floating-tools")
    )
      return;
    if (!finishInline()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  // Window capture runs before canvas tools and navigation handlers. Click also
  // covers keyboard/assistive activation that has no preceding pointer event.
  window.addEventListener("pointerdown", outsideEditor, true);
  window.addEventListener(
    "click",
    (event) => {
      // Pointer clicks were handled on pointerdown. In Firefox, placing a new
      // object replaces that target; its trailing click must not finish the new editor.
      if (event.detail === 0) outsideEditor(event);
    },
    true,
  );
  function outline() {
    const el = $("#canvas-outline");
    if (!el || !outlineOpen) return;
    const slides = slideIds();
    const frames = board().nodes.filter((n) => n.type === "frame"),
      order = [...slides, ...frames.map((f) => f.id)];
    const rows = [];
    const visit = (parent, depth = 0, seen = new Set()) => {
      for (const f of frames
        .filter((f) => (parents.get(f.id) || null) === parent)
        .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        rows.push(
          `<div class="outline-row ${depth ? "nested-frame-row" : ""}" data-frame-row="${esc(f.id)}" draggable="${!depth}" style="padding-left:${depth * 14}px">${btn("collapse", f.collapsed ? "＋" : "−", `data-id="${esc(f.id)}" aria-label="${f.collapsed ? "Expand" : "Collapse"} frame" ${f.locked ? "disabled" : ""}`)}${btn("find-result", `${frameThumbnail(f, board().nodes, esc)}<span class="frame-row-title">${esc(f.text || "Untitled frame")}</span><small>${depth ? "Nested · " : `${slides.indexOf(f.id) + 1} · `}${frameContents(board().nodes, f, parents).length} objects · ${Math.round(f.w)} × ${Math.round(f.h)}</small>`, `data-id="${esc(f.id)}"`)}${!depth ? btn("frame-up", "↑", `data-id="${esc(f.id)}" aria-label="Move frame earlier" ${slides.indexOf(f.id) === 0 ? "disabled" : ""}`) + btn("frame-down", "↓", `data-id="${esc(f.id)}" aria-label="Move frame later" ${slides.indexOf(f.id) === slides.length - 1 ? "disabled" : ""}`) : ""}</div>`,
        );
        visit(f.id, depth + 1, seen);
      }
    };
    visit(null);
    el.innerHTML = `<strong>Frames & presentation</strong>${btn("outline", "×", 'aria-label="Close outline"')}<p>Drag rows or use ↑ / ↓ to reorder slides. Nested frames move with their parent and are not separate slides.</p><div class="frame-panel-actions">${btn("frames-organize", "Order by position")}${btn("present", "Present")}</div>${rows.join("") || "<p>Press F and drag to draw a frame.</p>"}`;
  }
  let draggedFrame = null;
  document.addEventListener("dragstart", (event) => {
    const row = event.target.closest(
      '#canvas-outline [data-frame-row][draggable="true"]',
    );
    if (!row) return;
    draggedFrame = row.dataset.frameRow;
    event.dataTransfer.setData("text/plain", draggedFrame);
    event.dataTransfer.effectAllowed = "move";
    row.classList.add("frame-row-dragging");
  });
  document.addEventListener("dragover", (event) => {
    const row = event.target.closest(
      '#canvas-outline [data-frame-row][draggable="true"]',
    );
    if (!draggedFrame || !row) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    $$(".frame-row-target").forEach((el) =>
      el.classList.remove("frame-row-target"),
    );
    row.classList.add("frame-row-target");
  });
  document.addEventListener("drop", (event) => {
    const row = event.target.closest(
      '#canvas-outline [data-frame-row][draggable="true"]',
    );
    if (!draggedFrame || !row) return;
    event.preventDefault();
    const id = draggedFrame;
    draggedFrame = null;
    if (id !== row.dataset.frameRow)
      changeBoard((b) => reorderFrame(b, id, row.dataset.frameRow));
  });
  document.addEventListener("dragend", () => {
    draggedFrame = null;
    $$(".frame-row-target,.frame-row-dragging").forEach((el) =>
      el.classList.remove("frame-row-target", "frame-row-dragging"),
    );
  });
  function slideIds() {
    return frameSlides(board());
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
      `<dialog class="dialog"><form id="canvas-query-form" data-id="${esc(n?.id || "")}">${dialogHead("Live task view")}<div class="dialog-body">${input("title", "Card title", n?.text || "Live tasks")}${select("viewType", "Layout", ["list", "table", "kanban", "timeline"], n?.viewType || "list")}<fieldset><legend>Visible table fields</legend>${["key", "title", "status", "assignee", "due", "priority", "type"].map((f) => `<label><input type="checkbox" name="field-${f}" ${(n?.visibleFields || ["key", "title", "status", "assignee", "due"]).includes(f) ? "checked" : ""}>${f}</label>`).join(" ")}</fieldset><label class="field">Saved project view<select name="view"><option value="">Custom filter</option>${(state.project.views || []).map((v) => `<option value="${esc(v.id)}" ${n?.view === v.id ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>${select("status", "Status", ["all", ...state.config.statuses], q.status || "all")}${input("assignee", "Owner contains", q.assignee || "")}${input("search", "Text contains", q.search || "")}<p>The card always reads the current tasks. Editing a task anywhere updates every card.</p></div><div class="dialog-foot"><button type="submit" class="button primary">Save view card</button></div></form></dialog>`,
      "canvas-query",
    );
  }
  let liveDrag = null;
  document.addEventListener(
    "dragstart",
    (e) => {
      const el = e.target.closest("[data-live-task]");
      if (el) {
        liveDrag = el.dataset.liveTask;
        e.dataTransfer.setData("text/x-pencils-task", liveDrag);
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "dragover",
    (e) => {
      if (
        liveDrag &&
        e.target.closest("[data-live-status]") &&
        canTransition(
          state.config,
          task(liveDrag)?.status,
          e.target.closest("[data-live-status]").dataset.liveStatus,
        )
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  document.addEventListener(
    "drop",
    (e) => {
      const column = e.target.closest("[data-live-status]");
      if (liveDrag && column) {
        e.preventDefault();
        e.stopImmediatePropagation();
        patchTask(liveDrag, { status: column.dataset.liveStatus }).catch(
          (err) => toast(err.message, true),
        );
        liveDrag = null;
      }
    },
    true,
  );
  document.addEventListener("dragend", () => (liveDrag = null));
  function addPosition() {
    const c = $("#canvas");
    return {
      x: (c.clientWidth / 2 - state.camera.x) / state.camera.z,
      y: (c.clientHeight / 2 - state.camera.y) / state.camera.z,
    };
  }
  function editConnector(edge) {
    if (!edge) return;
    basic.selectEdge(edge.id);
    basic.editConnectorLabel();
    basic.positionToolbar();
  }
  const commentPanel = boardComments(
    ctx,
    () =>
      state.session?.required
        ? state.session.user.name || state.session.user.username
        : name(),
    uid,
  );
  const comments = commentPanel.open;
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
          text: "",
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
    const box = nodes.length ? bounds(nodes) : { x: 0, y: 0 },
      destination =
        id === "clipboard" && pick().length === 1 && pick()[0].type === "frame"
          ? pick()[0]
          : null,
      p = destination
        ? { x: destination.x + 32, y: destination.y + 56 }
        : addPosition(),
      ids = new Map(nodes.map((n) => [n.id, uid("n")])),
      groups = new Map(
        nodes.filter((n) => n.group).map((n) => [n.group, uid("g")]),
      );
    nodes = nodes.map((n) => ({
      ...n,
      id: ids.get(n.id),
      ...(n.group ? { group: groups.get(n.group) } : {}),
      x: n.x - box.x + p.x,
      y: n.y - box.y + p.y,
      ...(ids.has(n.frame)
        ? { frame: ids.get(n.frame) }
        : { frame: destination?.id, gridCell: undefined }),
      comments: [],
    }));
    const sameBoard = supplied?.source === `${state.project.id}/${board().id}`;
    edges = edges
      .filter(
        (e) =>
          (ids.has(e.from) || (sameBoard && index.has(e.from))) &&
          (ids.has(e.to) || (sameBoard && index.has(e.to))),
      )
      .map((e) => ({
        ...e,
        id: uid("e"),
        from: ids.get(e.from) || e.from,
        to: ids.get(e.to) || e.to,
        ...(e.bends && ids.has(e.from) && ids.has(e.to)
          ? {
              bends: e.bends.map((point) => ({
                x: point.x - box.x + p.x,
                y: point.y - box.y + p.y,
              })),
            }
          : {}),
      }));
    if (!nodes.length && !edges.length) {
      toast(
        "Copy the connected objects too when pasting arrows onto another board.",
      );
      return;
    }
    selected.clear();
    nodes.forEach((n) => selected.add(n.id));
    state.selectedNode = nodes[0]?.id || null;
    state.selectedEdge = null;
    basic.selectedEdges.clear();
    edges.forEach((e) => basic.selectedEdges.add(e.id));
    changeBoard((b) => {
      b.nodes.push(...nodes);
      b.edges.push(...edges);
    });
    if (id !== "clipboard") {
      closeDialog(true);
      focus(nodes);
    }
    basic.focusSelection();
  }
  async function click(action, el) {
    rebuild();
    const n = index.get(el?.dataset.id) || pick()[0];
    if (action === "frame-link" && n) {
      const url = new URL(location.href);
      url.hash = `project/${state.project.id}/board/${board().id}/frame/${n.id}`;
      try {
        await navigator.clipboard.writeText(url.href);
        toast("Frame link copied.");
      } catch {
        showDialog(
          `<dialog class="dialog">${dialogHead("Frame link")}<div class="dialog-body"><input aria-label="Frame link" value="${esc(url.href)}" readonly></div></dialog>`,
        );
      }
    } else if (action === "search-toggle") showSearch(!searchOpen, true);
    else if (action === "search-open") showSearch(true, true);
    else if (action === "grid-title") {
      const grid = board().nodes.find(
        (node) => node.id === el.closest("[data-node]")?.dataset.node,
      );
      if (grid && !grid.locked) {
        if (editor && !finishInline()) return;
        selected.clear();
        selected.add(grid.id);
        state.selectedNode = grid.id;
        state.selectedEdge = null;
        state.selectedEdges?.clear();
        basic.selection();
        await inline(grid, true);
      }
    } else if (action === "inline") await inline();
    else if (action === "inline-preview") {
      editor?.rich.preview();
    } else if (action === "zoom-selection") focus(pick());
    else if (action === "find-result") {
      reveal(n);
      search = "";
      $("#canvas-find").value = "";
      searchResults();
      showSearch(false);
      $("#canvas")?.focus();
    } else if (action === "outline") {
      outlineOpen = !outlineOpen;
      $("#canvas-outline")?.classList.toggle("hidden", !outlineOpen);
      outline();
    } else if (action === "collapse") {
      if (n && !n.locked) changeBoard(() => (n.collapsed = !n.collapsed));
    } else if (action === "frame-present") {
      const i = slideIds().indexOf(n?.id);
      if (i >= 0) {
        presenting = i;
        renderView(true);
      }
    } else if (action === "frames-organize") {
      changeBoard(
        (b) =>
          (b.presentation = orderedFrames(b)
            .sort((a, b) => a.y - b.y || a.x - b.x)
            .map((f) => f.id)),
      );
    } else if (action === "frame-up" || action === "frame-down") {
      const ids = slideIds(),
        i = ids.indexOf(n.id),
        j = Math.max(
          0,
          Math.min(ids.length - 1, i + (action === "frame-up" ? -1 : 1)),
        );
      if (i < 0) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      changeBoard((b) => (b.presentation = ids));
    } else if (action === "present") {
      presenting = 0;
      renderView(true);
    } else if (action === "slide-prev" || action === "slide-next") {
      presenting += action === "slide-next" ? 1 : -1;
      presentFrame();
    } else if (action === "present-exit") {
      presenting = -1;
      $("#canvas").classList.remove("presenting");
      $("#presentation-controls")?.remove();
      renderView(true);
    } else if (action === "comments") comments(n);
    else if (action === "edge-dependency") {
      const edgeId = state.selectedEdge,
        projectId = state.project.id,
        boardId = board().id;
      await basic.flush();
      if (state.project?.id !== projectId || board()?.id !== boardId)
        return true;
      if (sync.entries.size)
        throw new Error(
          "Save the connector before creating its task dependency.",
        );
      await api(route("boards", boardId) + "/dependency", {
        method: "POST",
        body: { edge: edgeId },
      });
      await ctx.refresh();
      toast("Task dependency created.");
    } else if (action === "edge-edit")
      editConnector(board().edges.find((e) => e.id === state.selectedEdge));
    else if (action === "activity") await activity();
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
    else if (action === "convert-note" || action === "convert") {
      if (!n || n.locked || converting || !["task", "sticky"].includes(n.type))
        return;
      if (action === "convert-note") {
        if (n.type !== "task") return;
        changeBoard(() => {
          n.displayAs = "note";
        });
        return;
      }
      if (n.type === "task") {
        changeBoard(() => {
          delete n.displayAs;
          const min = nodeMinimum(n);
          n.w = Math.max(n.w, min.w);
          n.h = Math.max(n.h, min.h);
        });
        return;
      }
      converting = true;
      const projectId = state.project.id,
        boardId = board().id,
        nodeId = n.id;
      try {
        await basic.flush();
        if (state.project?.id !== projectId || board()?.id !== boardId) return;
        const source = board().nodes.find((node) => node.id === nodeId);
        if (!source || source.locked || source.type !== "sticky") return;
        const text = source.text || "";
        if (sync.entries.size)
          throw new Error(
            "Wait for pending changes to save before converting.",
          );
        // The original task survives a board undo. Never replace a newer task
        // body with an older note when that note is converted again.
        const marker = `canvas:${boardId}:${nodeId}`;
        let created = state.tasks.find((t) => t.canvas_source === marker);
        if (created && created.body !== text)
          throw new Error(
            "A task from this note already exists with different text. Duplicate the note to create a separate task; both versions are preserved.",
          );
        if (!created)
          created = await api(route("tasks"), {
            method: "POST",
            body: {
              title:
                (text || "New task")
                  .split("\n")
                  .find((line) => line.trim())
                  ?.replace(/^#+\s*/, "")
                  .slice(0, 300) || "New task",
              body: text,
              canvas_source: marker,
            },
          });
        if (state.project?.id !== projectId) return;
        if (!task(created.id)) state.tasks.push(created);
        if (board()?.id !== boardId) return;
        const current = board().nodes.find((node) => node.id === nodeId);
        if (!current || current.locked || current.type !== "sticky") return;
        if ((current.text || "") !== text)
          throw new Error(
            "The note changed during conversion. Its latest text is preserved; the task contains the earlier version.",
          );
        changeBoard(() => {
          current.type = "task";
          current.task = created.id;
          current.w = Math.max(220, current.w);
          current.h = Math.max(200, current.h);
          delete current.text;
        });
        toast(
          "Note converted to a task. Text, comments and connectors are preserved.",
        );
      } finally {
        converting = false;
      }
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
        `<dialog class="dialog"><form id="canvas-note-form">${dialogHead("Embed a live Markdown note")}<div class="dialog-body"><label class="field">Project note<select name="file">${files.map((f) => `<option>${esc(f)}</option>`).join("")}</select></label><p>Notes stay in the project folder. Open the same file in Obsidian or edit it directly in the canvas.</p></div><div class="dialog-foot"><button class="button primary" ${files.length ? "" : "disabled"}>Add live note</button></div></form></dialog>`,
        "canvas-note",
      );
    } else if (action === "participant")
      showDialog(
        `<dialog class="dialog"><form id="canvas-name-form">${dialogHead("Your name on this workspace")}<div class="dialog-body">${input("name", "Display name", name(), 'maxlength="60" required')}<p>Other people on your local network see this name beside your cursor and comments.</p></div><div class="dialog-foot"><button class="button primary">Save</button></div></form></dialog>`,
        "canvas-name",
      );
    else if (action === "shortcuts")
      showDialog(
        `<dialog class="dialog">${dialogHead("Board shortcuts")}<div class="dialog-body"><p>V: select · H: hand · N: sticky · T: text · S / R: shape<br>L: connector · P: pen · F: draw frame · D: task card · C: comment on selection<br>Click to place a sticky, text, shape or grid; Escape cancels<br>Grid: double-click its title to rename; click outside to save<br>Grid: double-click a cell to edit; Tab moves to the next cell<br>Grid: drag its top strip to move; internal borders resize one row/column<br>Grid: outer edges resize all tracks; label ends resize the final row/column<br>F: drag a frame around content, or click for 16:9<br>Click empty frame space to select it; drag selected frame space to move it<br>Drag inside an unselected frame to select objects<br>Drag a frame border/title to move contents; resizing keeps content sizes<br>Double-click or Enter: edit inline · Click outside to save<br>Escape or Ctrl / ⌘ Enter: finish editing · Undo: revert saved text<br>Ctrl / ⌘ click or Shift-click: select multiple objects<br>Drag empty canvas with select tool: selection box<br>Right-drag, middle-drag or Space + drag: pan<br>Scroll: zoom at pointer · Shift + scroll: move up / down<br>Pinch or Ctrl / ⌘ wheel: zoom<br>Expand board: fill window · Full screen: hide browser chrome<br>Ctrl / ⌘ + / −: zoom · Ctrl / ⌘ 0: 100%<br>Alt / Option 1: fit board · Alt / Option 2: focus selection<br>M: minimap · G: grid · Ctrl / ⌘ F: find on board<br>Ctrl / ⌘ A: select all · Ctrl / ⌘ D or Alt / Option drag: duplicate<br>Ctrl / ⌘ C, V: copy and paste objects<br>Ctrl / ⌘ G: group · Ctrl / ⌘ Shift G: ungroup<br>Ctrl / ⌘ Shift L: lock / unlock<br>Arrow keys: move selection or pan (Shift for larger steps)<br>Ctrl / ⌘ Z: undo · Ctrl / ⌘ Shift Z: redo<br>Shift + corner drag: resize horizontally or vertically<br>Drag near objects: align edges, centres and equal gaps<br>Resize near objects: match widths and heights<br>Hold Alt during drag: bypass snapping · Board settings: Align with nearby objects / Snap to grid<br>Drag a connection handle: curved preview and nearby port snapping<br>Drag a selected line endpoint to reconnect · Ctrl / ⌘: bypass snapping · Escape: cancel<br>P: pen · E: eraser (drawings only) · Shift: straight stroke<br>Pen presets remember colour, thickness and pressure; highlighter is translucent<br>Pen: draw with pressure; two fingers: pan and zoom<br>Escape: clear selection or exit current tool / editor / presentation</p></div></dialog>`,
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
    if (form.id === "canvas-style-form") {
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
        delete n.gridCell;
        if (values.frame) n.frame = values.frame;
        else delete n.frame;
        if (values.layer !== "keep") {
          b.nodes = b.nodes.filter((x) => x.id !== n.id);
          b.nodes[values.layer === "front" ? "push" : "unshift"](n);
        }
      });
    } else if (form.id === "canvas-note-form") {
      const t = state.tasks.find((t) => t.file === values.file);
      changeBoard((b) =>
        b.nodes.push({
          id: uid("n"),
          type: t ? "task" : "file",
          ...(t ? { task: t.id } : { file: values.file }),
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
          viewType: values.viewType,
          visibleFields: [
            "key",
            "title",
            "status",
            "assignee",
            "due",
            "priority",
            "type",
          ].filter((f) => values[`field-${f}`]),
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
      const nodes = structuredClone(basic.selectionContents()),
        ids = new Set(nodes.map((n) => n.id)),
        edges = structuredClone(
          board().edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        );
      if (!nodes.length) return;
      for (const n of nodes)
        if (n.frame && !ids.has(n.frame)) {
          delete n.frame;
          delete n.gridCell;
        }
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
      updateSearchButton();
      enhance();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "canvas-status") {
      status = event.target.value;
      updateSearchButton();
      enhance();
    }
    const control = event.target,
      field = control.dataset.canvasStatus
        ? "status"
        : control.dataset.canvasTaskField,
      id = control.dataset.canvasStatus || control.dataset.task;
    if (["status", "priority", "assignee"].includes(field) && id) {
      const current = task(id);
      if (!current || current[field] === control.value) return;
      const changes = { [field]: control.value };
      if (field === "assignee")
        changes.assignee_id =
          projectPeople(state).find((p) => p.name === control.value)?.id ||
          null;
      patchTask(id, changes, false)
        .then(() => enhance())
        .catch((e) => {
          toast(e.message, true);
          enhance();
        });
    }
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
        basic.selectEdge(edge.dataset.edge);
        editConnector(board().edges.find((e) => e.id === edge.dataset.edge));
      } else if (node) {
        if (
          node.classList.contains("frame") &&
          !event.target.closest(".frame-title")
        )
          return;
        event.stopImmediatePropagation();
        const cell = event.target.closest(".grid-cell");
        if (editor && event.target.closest(".grid-grip") && !finishInline())
          return;
        if (cell)
          state.gridCell = {
            id: node.dataset.node,
            row: +cell.dataset.gridRow,
            column: +cell.dataset.gridColumn,
          };
        inline(
          index.get(node.dataset.node),
          !!event.target.closest("[data-inline-title],.grid-grip"),
        ).catch((e) => toast(e.message, true));
      }
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        state.view !== "board" ||
        state.dialog ||
        event.target.closest(".board-task-editor")
      )
        return;
      if (searchOpen && event.key === "Escape" && !editor) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showSearch(false, true);
        return;
      }
      if (editor) {
        if (
          editor.cell &&
          event.key === "Tab" &&
          !event.target.closest(".inline-floating-tools")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          const n = index.get(editor.id),
            cell = editor.cell;
          let position =
            cell.row * n.grid.columns.length +
            cell.column +
            (event.shiftKey ? -1 : 1);
          position = Math.max(
            0,
            Math.min(n.grid.cells.length * n.grid.columns.length - 1, position),
          );
          if (finishInline()) {
            state.gridCell = {
              id: n.id,
              row: Math.floor(position / n.grid.columns.length),
              column: position % n.grid.columns.length,
            };
            inline(n).catch((e) => toast(e.message, true));
          }
          return;
        }
        if (event.key === "Escape" && editor.rich.escape()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (
          event.key === "Escape" ||
          (editor.gridTitle && event.key === "Enter" && !event.isComposing) ||
          ((event.ctrlKey || event.metaKey) && event.key === "Enter")
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          finishInline();
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
      if (
        command &&
        event.key.toLowerCase() === "c" &&
        (pick().length || basic.pickEdges().length)
      ) {
        event.preventDefault();
        const nodes = structuredClone(basic.selectionContents()),
          ids = new Set(nodes.map((n) => n.id));
        clipboard = {
          source: `${state.project.id}/${board().id}`,
          nodes,
          edges: structuredClone(
            board().edges.filter(
              (e) =>
                (ids.has(e.from) && ids.has(e.to)) ||
                basic.selectedEdges.has(e.id),
            ),
          ),
        };
        toast(`${nodes.length + clipboard.edges.length} objects copied.`);
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
        const moving = basic.selectionContents(pick().filter((n) => !n.locked));
        const before = structuredClone(board().nodes);
        changeBoard(() => {
          moving.forEach((n) => {
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
          });
          const ids = new Set(moving.map((n) => n.id));
          const dx =
            event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0;
          const dy =
            event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0;
          for (const e of board().edges)
            if (e.bends && ids.has(e.from) && ids.has(e.to))
              e.bends = e.bends.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          updateFrameMembership(board().nodes, ids, before, {
            adopt: !basic.filterActive(),
          });
        });
      }
    },
    true,
  );
  function clearHoverPorts() {
    $$(".connection-hover-port").forEach((el) => el.remove());
  }
  function hoverConnectionPorts(event) {
    const el = event.target?.closest("#canvas .board-node"),
      n = el && index.get(el.dataset.node);
    const eligible =
      state.tool === "connect" &&
      !editor &&
      n &&
      !n.locked &&
      !hidden.has(n.id);
    $$(".connection-hover-port").forEach((handle) => {
      if (!eligible || handle.dataset.source !== n.id) handle.remove();
    });
    if (!eligible) return;
    for (const side of sides)
      if (!el.querySelector(`[data-port="${side}"]`))
        el.insertAdjacentHTML(
          "beforeend",
          `<button type="button" class="connection-port connection-hover-port port-${side}" data-port="${side}" data-source="${esc(n.id)}" aria-label="Connect from ${side}" title="Connect from ${side}"></button>`,
        );
  }
  function stopConnection() {
    const active = connecting;
    connecting = null;
    clearHoverPorts();
    if (state.tool === "connect" && $(".board-help"))
      $(".board-help").textContent =
        "Hover to show connection points · Drag or click two points · Esc to cancel";
    $("#connection-draft")?.remove();
    $("#connection-draft-defs")?.remove();
    $$(".connection-nearby-port").forEach((el) => el.remove());
    $$(
      ".connection-target,.connection-snapped,.connector-reconnecting",
    ).forEach((el) =>
      el.classList.remove(
        "connection-target",
        "connection-snapped",
        "connector-reconnecting",
      ),
    );
    $("#canvas")?.classList.remove("connecting");
    if (active?.canvas.hasPointerCapture(active.pointerId))
      active.canvas.releasePointerCapture(active.pointerId);
    if (board() && $("#canvas")) ctx.updateEdges();
  }
  function drawConnection(event) {
    if (!connecting || event.pointerId !== connecting.pointerId) return;
    connecting.last = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    };
    const canvas = $("#canvas"),
      r = canvas.getBoundingClientRect(),
      inside =
        event.clientX >= r.left &&
        event.clientX <= r.right &&
        event.clientY >= r.top &&
        event.clientY <= r.bottom;
    canvas.style.setProperty(
      "--connector-port-scale",
      String(1 / state.camera.z),
    );
    const p = point(event),
      source = effectiveNode(connecting.from),
      hit = connectorTarget(p, board().nodes, {
        from: connecting.from,
        hidden,
        zoom: state.camera.z,
        bypass: !inside || event.ctrlKey || event.metaKey,
      });
    // The visible handles sit outside the object border. Honour their actual hit
    // areas, including at high zoom, instead of falling back to an automatic side.
    if (inside && !event.ctrlKey && !event.metaKey)
      for (const candidate of hit.nearby) {
        const el = $(`[data-node="${CSS.escape(candidate.node.id)}"]`);
        for (const handle of el?.querySelectorAll("[data-port]") || []) {
          const r = handle.getBoundingClientRect();
          if (
            event.clientX >= r.left &&
            event.clientX <= r.right &&
            event.clientY >= r.top &&
            event.clientY <= r.bottom
          ) {
            candidate.side = handle.dataset.port;
            candidate.distance = 0;
            hit.target = candidate;
          }
        }
      }
    connecting.target = hit.target;
    $$(".connection-nearby-port").forEach((el) => el.remove());
    $$(".connection-target,.connection-snapped").forEach((el) =>
      el.classList.remove("connection-target", "connection-snapped"),
    );
    for (const candidate of hit.nearby) {
      const el = $(`[data-node="${CSS.escape(candidate.node.id)}"]`);
      if (!el) continue;
      el.classList.toggle("connection-target", candidate === hit.target);
      for (const side of sides) {
        let handle = el.querySelector(`[data-port="${side}"]`);
        if (!handle) {
          el.insertAdjacentHTML(
            "beforeend",
            `<span class="connection-port connection-nearby-port port-${side}" data-port="${side}" data-source="${esc(candidate.node.id)}" aria-hidden="true"></span>`,
          );
          handle = el.lastElementChild;
        }
        handle.classList.toggle(
          "connection-snapped",
          candidate === hit.target && side === candidate.side,
        );
      }
    }
    if (!source) {
      stopConnection();
      return;
    }
    const edge = connecting.edgeId
      ? board().edges.find((e) => e.id === connecting.edgeId)
      : {};
    const path = connectorPreview(
      source,
      connecting.fromSide,
      p,
      hit.target,
      edge,
      connecting.movingEnd,
    );
    let draft = $("#connection-draft");
    if (!draft) {
      $("#canvas-lines").insertAdjacentHTML(
        "beforeend",
        '<path id="connection-draft" fill="none"/>',
      );
      draft = $("#connection-draft");
    }
    draft.setAttribute("d", path.d);
    const color = palette[edge.color] || edge.color || "#78906f";
    const style = connectorStyle(edge, color, esc, "draft");
    $("#connection-draft-defs")?.remove();
    $("#canvas-lines").insertAdjacentHTML(
      "beforeend",
      `<defs id="connection-draft-defs">${style.defs}</defs>`,
    );
    for (const key of ["marker-start", "marker-end"]) {
      if (style.markers[key]) draft.setAttribute(key, style.markers[key]);
      else draft.removeAttribute(key);
    }
    draft.style.strokeWidth = style.width;
    draft.style.strokeDasharray = style.dash;
    draft.style.stroke = color;
    draft.classList.toggle("snapped", !!hit.target);
  }
  function startConnection(event, options) {
    if (event.button !== 0 || connecting) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    rebuild();
    const canvas = $("#canvas");
    connecting = {
      ...options,
      canvas,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
    };
    canvas.classList.add("connecting");
    if (options.edgeId)
      $$("#canvas-lines > [data-edge]")
        .filter((el) => el.dataset.edge === options.edgeId)
        .forEach((el) => el.classList.add("connector-reconnecting"));
    canvas.setPointerCapture(event.pointerId);
    drawConnection(event);
  }
  window.addEventListener(
    "keydown",
    (event) => {
      if (!connecting) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        stopConnection();
      } else if (["Control", "Meta"].includes(event.key))
        drawConnection({
          ...connecting.last,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        });
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (connecting && ["Control", "Meta"].includes(event.key))
        drawConnection({
          ...connecting.last,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        });
    },
    true,
  );
  document.addEventListener(
    "lostpointercapture",
    (event) => {
      if (
        connecting &&
        !connecting.latched &&
        event.pointerId === connecting.pointerId
      )
        stopConnection();
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      let canvas = event.target.closest("#canvas");
      if (!canvas || state.tool === "frame") return;
      if (
        connecting?.latched &&
        event.button === 0 &&
        !event.target.closest(
          ".board-tools,#selection-tools,.canvas-panel,.canvas-find,#canvas-minimap",
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        connecting.latched = false;
        connecting.finishingClick = true;
        connecting.pointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        drawConnection(event);
        return;
      }
      if (
        event.pointerType === "pen" &&
        event.button === 0 &&
        !event.target.closest(
          "button,input,select,#pen-tools,.inline-editing,.canvas-panel",
        ) &&
        state.tool !== "erase"
      )
        state.tool = "draw";
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
          "#pen-tools,.inline-floating-tools,.canvas-panel,.canvas-find,.canvas-filters,#canvas-presence,#presentation-controls,.inline-editing",
        )
      ) {
        event.stopImmediatePropagation();
        return;
      }
      if (
        event.pointerType === "touch" &&
        !event.target.closest("button,input,select")
      ) {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2) {
          stopConnection();
          basic.cancel();
          canvas = $("#canvas");
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
            ["sticky", "text", "shape", "grid"].includes(state.tool)) &&
          !penActive(state.tool)
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
      const endpoint = event.target.closest("[data-edge-end]");
      if (endpoint && !penActive(state.tool)) {
        const edge = board().edges.find((e) => e.id === endpoint.dataset.edge);
        if (!edge) return;
        const movingEnd = endpoint.dataset.edgeEnd,
          fixedEnd = movingEnd === "from" ? "to" : "from";
        const fixed = effectiveNode(edge[fixedEnd]);
        if (!fixed || fixed.locked) return;
        const path = routeEdge(
          edge,
          effectiveNode(edge.from),
          effectiveNode(edge.to),
        );
        const p = fixedEnd === "from" ? path.p : path.q;
        const fixedSide = sides.find((side) => {
          const q = port(fixed, side);
          return q.x === p.x && q.y === p.y;
        });
        startConnection(event, {
          from: fixed.id,
          fromSide: fixedSide,
          edgeId: edge.id,
          movingEnd,
        });
        return;
      }
      const edge = event.target.closest("[data-edge]");
      if (edge && state.tool !== "hand" && !penActive(state.tool)) {
        event.stopImmediatePropagation();
        event.preventDefault();
        basic.selectEdge(
          edge.dataset.edge,
          event.shiftKey || event.ctrlKey || event.metaKey,
        );
        $("#canvas")?.focus({ preventScroll: true });
        return;
      }
      const handle = event.target.closest("[data-port]");
      if (handle && !penActive(state.tool)) {
        if (index.get(handle.dataset.source)?.locked) return;
        const pendingSource = state.tool === "connect" && state.connectFrom;
        startConnection(event, {
          from: pendingSource || handle.dataset.source,
          fromSide: pendingSource ? undefined : handle.dataset.port,
          movingEnd: "to",
        });
        return;
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
      hoverPointer = { x: event.clientX, y: event.clientY };
      if (event.target.closest("#canvas")) cursor = point(event);
      if (connecting) {
        event.preventDefault();
        event.stopImmediatePropagation();
        drawConnection(event);
        return;
      }
      hoverConnectionPorts(event);
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
      if (event.pointerId !== connecting.pointerId) return;
      event.stopImmediatePropagation();
      drawConnection(event);
      const active = connecting,
        target = active?.target;
      if (
        !cancel &&
        !target &&
        !active.edgeId &&
        !active.finishingClick &&
        state.tool === "connect" &&
        Math.hypot(
          event.clientX - active.start.x,
          event.clientY - active.start.y,
        ) < 5
      ) {
        active.latched = true;
        if (active.canvas.hasPointerCapture(active.pointerId))
          active.canvas.releasePointerCapture(active.pointerId);
        const help = $(".board-help");
        if (help)
          help.textContent = "Choose an end connection point · Esc to cancel";
        return;
      }
      stopConnection();
      if (!cancel && target) {
        if (state.tool === "connect") {
          state.tool = "cursor";
          state.connectFrom = null;
        }
        if (active.edgeId)
          changeBoard((b) => {
            const edge = b.edges.find((e) => e.id === active.edgeId);
            edge[active.movingEnd] = target.node.id;
            if (target.distance <= 20)
              edge[`${active.movingEnd}Side`] = target.side;
            else delete edge[`${active.movingEnd}Side`];
          });
        else {
          const id = uid("e");
          basic.selectedEdges.clear();
          state.selectedEdge = id;
          selected.clear();
          state.selectedNode = null;
          changeBoard((b) =>
            b.edges.push({
              id,
              from: active.from,
              fromSide: active.fromSide,
              to: target.node.id,
              toSide: target.distance <= 20 ? target.side : undefined,
              routing: "curve",
              relationship: "relates",
            }),
          );
        }
      }
      if (
        !cancel &&
        !target &&
        !active.edgeId &&
        state.tool !== "connect" &&
        Math.hypot(
          event.clientX - active.start.x,
          event.clientY - active.start.y,
        ) < 5
      ) {
        const source = index.get(active.from),
          side = active.fromSide;
        if (source) {
          const w = source.w,
            h = source.h,
            id = uid("n"),
            node = {
              id,
              type: "sticky",
              text: "",
              color: source.color || "#f5e7a2",
              w,
              h,
              x:
                source.x +
                (side === "right" ? w + 80 : side === "left" ? -w - 80 : 0),
              y:
                source.y +
                (side === "bottom" ? h + 80 : side === "top" ? -h - 80 : 0),
            };
          changeBoard((b) => {
            b.nodes.push(node);
            b.edges.push({
              id: uid("e"),
              from: source.id,
              to: id,
              fromSide: side,
              routing: "curve",
            });
            updateFrameMembership(
              b.nodes,
              new Set([id]),
              b.nodes.filter((n) => n.id !== id),
            );
          });
          selected.clear();
          selected.add(id);
          state.selectedNode = id;
          {
            state.selectedEdge = null;
            state.selectedEdges?.clear();
          }
          basic.focusSelection();
        }
      }
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
        if (place) {
          if (["sticky", "text", "shape", "grid"].includes(state.tool))
            basic.place(event);
          else basic.clearSelection();
        }
      }
    }
  }
  document.addEventListener("pointerup", (e) => endPointer(e), true);
  document.addEventListener("pointercancel", (e) => endPointer(e, true), true);
  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget && !connecting) clearHoverPorts();
  });
  window.addEventListener("blur", () => {
    touches.clear();
    gesture = null;
    touchPan = null;
    stopConnection();
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
          ...sessionTools.payload(),
        },
      });
      if (current !== route("boards", board()?.id)) return;
      members = result.members;
      sessionTools.update(members);
      paintPresence();
      if (presenceVersion !== result.version) {
        presenceVersion = result.version;
        notes.clear();
        if (
          !editor &&
          !connecting &&
          !converting &&
          !basic.busy() &&
          !sync.entries.size &&
          !state.dialog &&
          !state.boardTaskEditor &&
          !state.selectionToolbarOpen &&
          !state.toolDragging &&
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
    clearTimeout(viewportCleanup);
    if (cameraFrame) cancelAnimationFrame(cameraFrame);
    cameraFrame = null;
    if (connecting) stopConnection();
    clearHoverPorts();
    if (!editor) return;
    const form = $("#canvas-inline-form");
    if (form)
      try {
        localStorage.setItem(editor.key, form.elements.text.value);
      } catch {}
    editor.rich.destroy();
    $(".inline-floating-tools")?.remove();
    editor = null;
    state.canvasEditing = false;
  }
  return {
    render,
    updateUndo,
    rememberDisplay,
    beforeRender,
    selection,
    visible,
    edges,
    camera,
    enhance,
    edit: (id) => inline(index.get(id)).catch((e) => toast(e.message, true)),
    click,
    editConnector,
    busy: () => !!editor || !!connecting || !!gesture || !!draggedFrame,
    exportCanvas: () => encodeCanvas(board()),
  };
}
