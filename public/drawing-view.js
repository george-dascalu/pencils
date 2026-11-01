import { merge } from "./sync.js";
import {
  drawingCheckpoint,
  localDrawing,
  localDrawings,
} from "./drawing-store.js";
import { strokeMarkup } from "./pen-model.js";
import { decodeCanvas, encodeCanvas } from "./canvas-format.js";
import { boardExplorer } from "./board-explorer.js";
export function drawingView(ctx) {
  const {
    state,
    api,
    route,
    esc,
    icon,
    showDialog,
    closeDialog,
    dialogHead,
    toast,
    refresh,
    renderApp,
    renderView,
    storage,
  } = ctx;
  const owner = () => state.session?.user?.username || "shared";
  // Keep the existing checkpoint database and legacy drawing flags intact.
  let checkedKey = null,
    checkingKey = null,
    generation = 0,
    preparing = Promise.resolve();
  const canvases = () => state.boards.filter((b) => !b.archived);
  const key = () => `${owner()}/${state.project?.id}/${state.selectedBoard}`;
  function reset() {
    generation++;
    checkedKey = checkingKey = null;
  }
  function svg(board) {
    if (board.summary) return `<div class="drawing-thumb-empty" aria-hidden="true">${icon("board")}</div>`;
    const nodes = board.nodes.filter((n) => !n.layerHidden);
    if (!nodes.length) return '<div class="drawing-thumb-empty" aria-hidden="true">Empty board</div>';
    const
      left = Math.min(0, ...nodes.map((n) => n.x)),
      top = Math.min(0, ...nodes.map((n) => n.y)),
      width = Math.max(400, ...nodes.map((n) => n.x + n.w)) - left,
      height = Math.max(300, ...nodes.map((n) => n.y + n.h)) - top;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" aria-hidden="true">${nodes
      .slice(0, 150)
      .map((n) => {
        if (n.type === "draw")
          return `<g transform="translate(${n.x} ${n.y})">${strokeMarkup(n)}</g>`;
        const title =
          n.type === "task"
            ? ctx.task(n.task)?.title
            : n.title || n.text || n.type;
        return `<g transform="translate(${n.x} ${n.y})"><rect width="${n.w}" height="${n.h}" rx="6" fill="${n.type === "sticky" ? "#f6e8a0" : "var(--surface)"}" stroke="var(--muted)"/><text x="12" y="24" fill="var(--ink)" font-size="16">${esc(String(title || "Card").slice(0, Math.max(5, Math.floor(n.w / 10))))}</text></g>`;
      })
      .join("")}</svg>`;
  }
  function gallery() {
    return `<section class="drawing-gallery"><header><h2>Boards</h2><p>Cards, notes, images and sketches together. Draw with Pencil; use fingers to select, move, pan and pinch.</p><div class="canvas-gallery-actions"><button class="button primary" data-action="board-new">${icon("plus")}New board</button><button class="button" data-drawing-action="recover">Local checkpoints</button><button class="button" data-drawing-action="offline">Prepare offline drawing</button><a class="button" href="/drawing-offline.html">${icon("external")}Open offline pad</a></div></header><div class="drawing-cards">${
      canvases()
        .map(
          (b) =>
            `<article><button type="button" data-drawing-action="open" data-id="${esc(b.id)}">${svg(b)}<strong>${esc(b.title)}</strong><small>${b.nodeCount ?? b.nodes.length} objects · ${b.strokeCount ?? b.nodes.filter((n) => n.type === "draw").length} strokes</small></button><button type="button" class="button small" data-drawing-action="link" data-id="${esc(b.id)}">Copy board link</button></article>`,
        )
        .join("") || "<p>No boards yet. Choose New board to start.</p>"
    }</div></section>`;
  }
  // Every entry path (tabs, selectors and old URLs) goes through
  // this gate before rendering an editable canvas or writing a new checkpoint.
  const editable = (b) =>
    Object.fromEntries(
      [
        "title",
        "nodes",
        "edges",
        "templates",
        "presentation",
        "settings",
        "layers",
      ].map((k) => [
        k,
        b[k] ||
          (["nodes", "edges", "layers", "templates", "presentation"].includes(k)
            ? []
            : {}),
      ]),
    );
  // Compare the same representation the server writes (including integer Canvas bounds).
  const persisted = (b) => editable(decodeCanvas(encodeCanvas(b)));
  const canonical = (value) =>
    JSON.stringify(value, (_, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v,
    );
  function ready() {
    if (!ctx.board()) return true;
    const current = key();
    if (checkedKey === current) return true;
    if (checkingKey === current) return false;
    checkingKey = current;
    const token = ++generation,
      b = structuredClone(ctx.board()),
      project = structuredClone(state.project),
      user = owner();
    const stillHere = () =>
      generation === token &&
      key() === current &&
      state.view === "board" &&
      !state.boardGallery;
    preparing = (async () => {
      let pending = false;
      try {
        const saved = await localDrawing(user, project.id, b.id);
        if (!stillHere()) return;
        const queued = ctx.sync.entries.has(
          `/projects/${project.id}/boards/${b.id}`,
        );
        pending = !!saved?.pending && !queued;
        // A reload may interrupt the local acknowledgement after the server
        // saved. Only clear it when none of its changes remain to be applied.
        let acknowledged = false;
        if (pending) {
          const result = merge(
            persisted(saved.base || saved.board),
            persisted(saved.board),
            persisted(b),
          );
          acknowledged =
            !result.conflicts.length &&
            canonical(result.value) === canonical(persisted(b));
          if (acknowledged) pending = false;
        }
        if (!pending && !queued) {
          // The atomic check also protects a checkpoint written by the offline
          // pad in another tab between the read and this baseline write.
          pending = !(await drawingCheckpoint(user, project, b, false, {
            protectPending: true,
            expectedUpdated: acknowledged ? saved.updated : null,
          }));
        }
      } catch {
        if (stillHere())
          toast(
            "Device checkpoints are unavailable in this browser. Server saving is still available.",
            true,
          );
      }
      if (!stillHere()) return;
      checkingKey = null;
      if (pending) {
        state.boardGallery = true;
        renderView();
        toast(
          "This board has edits saved only in this browser. Choose Apply to board or Restore as copy to continue.",
        );
        await recover();
      } else {
        checkedKey = current;
        renderView();
      }
    })().catch((error) => toast(error.message, true));
    return false;
  }
  async function enter(id) {
    if (!ctx.canNavigate()) return false;
    await ctx.flushBoard();
    if (state.boardConflict) {
      toast("Review the board’s conflicting edits in Recovery & backups before switching boards.", true);
      return false;
    }
    const b = await ctx.ensureBoard(id);
    if (!b) return false;
    reset();
    state.boardGallery = false;
    state.view = "board";
    state.selectedBoard = id;
    state.history = [];
    state.future = [];
    storage.set(`board:${state.project.id}`, id);
    storage.set(`view:${state.project.id}`, "board");
    ctx.loadCamera();
    renderApp();
    await preparing;
    return checkedKey === key() && !state.boardGallery;
  }
  function render() {
    if (state.view !== "board" || state.boardGallery) return;
    const b = ctx.board(),
      toolbar = document.querySelector(".board-toolbar");
    if (!b || !toolbar) return;
    // Board tools shows the device checkpoint; it stays across board renders (project-layout.js
    // keeps data-board-persistent items).
    const history = toolbar.querySelector('[data-board-menu="tools"] .board-menu-panel');
    if (history && !history.querySelector("[data-drawing-save]"))
      history.insertAdjacentHTML("beforeend", '<small class="field-hint" data-board-persistent="true" data-drawing-save>Device checkpoint available</small>');
    document.querySelector("#canvas")?.classList.add("drawing-canvas");
  }
  async function checkpoint(
    pending = true,
    board = ctx.board(),
    project = state.project,
  ) {
    if (!board || board.summary || !project) return;
    const b = structuredClone(board),
      p = structuredClone(project),
      user = owner();
    try {
      await drawingCheckpoint(user, p, b, pending);
      const label = document.querySelector("[data-drawing-save]");
      if (label && state.project?.id === p.id && state.selectedBoard === b.id)
        label.textContent = pending
          ? "Saved on this device · waiting for server"
          : "Saved on this device and server";
    } catch {
      const label = document.querySelector("[data-drawing-save]");
      if (label) label.textContent = "Device storage unavailable";
    }
  }
  async function recover() {
    const docs = (await localDrawings(owner())).filter(
      (d) => d.project.id === state.project.id,
    );
    showDialog(
      `<dialog class="dialog">${dialogHead("Local checkpoints")}<div class="dialog-body"><p>Board copies saved in this browser. Apply to board merges your edits into the original board. Restore as copy creates a separate board. Browser storage can be cleared; keep server backups too.</p>${docs.map((d) => `<p>${esc(d.board.title)} · ${esc(new Date(d.updated).toLocaleString())} · ${d.pending ? "Not saved to server" : "Saved to server"} ${d.pending ? `<button type="button" class="button small" data-drawing-action="sync" data-id="${esc(d.board.id)}">Apply to board</button>` : ""} <button type="button" class="button small" data-drawing-action="restore" data-id="${esc(d.board.id)}">Restore as copy</button></p>`).join("") || "<p>No board copies in this browser yet. Open a board while connected to create a checkpoint.</p>"}</div></dialog>`,
      "drawing-recovery",
    );
  }
  document.addEventListener("click", async (e) => {
    const button = e.target.closest("[data-drawing-action]");
    if (!button) return;
    const action = button.dataset.drawingAction,
      id = button.dataset.id;
    e.preventDefault();
    try {
      if (action === "open") return await enter(id);
      if (action === "recover") return await recover();
      if (action === "sync") {
        await ctx.flushBoard();
        const saved = (await localDrawings(owner())).find(
          (d) => d.project.id === state.project.id && d.board.id === id,
        );
        if (!saved?.pending) return;
        const fresh = await api(route()),
          remote = fresh.boards.find((b) => b.id === id);
        if (!remote)
          throw Error(
            "The original board is no longer on the server. Choose Restore as copy to recover your edits in a new board.",
          );
        const result = merge(
          persisted(saved.base || saved.board),
          persisted(saved.board),
          persisted(remote),
        );
        if (result.conflicts.length)
          throw Error(
            "The same board content changed in this browser and on the server. Both versions are kept. Choose Restore as copy to compare them in separate boards.",
          );
        const synced = await api(route("boards", id), {
          method: "PATCH",
          body: { ...result.value, revision: remote.revision },
        });
        await drawingCheckpoint(owner(), state.project, synced, false);
        await refresh(false);
        return await recover();
      }
      if (action === "restore") {
        const saved = (await localDrawings(owner())).find(
          (d) => d.project.id === state.project.id && d.board.id === id,
        );
        if (!saved) return;
        const b = await api(route("boards"), {
          method: "POST",
          body: { title: `${saved.board.title} (recovered)` },
        });
        await api(route("boards", b.id), {
          method: "PATCH",
          body: {
            revision: b.revision,
            nodes: saved.board.nodes,
            edges: saved.board.edges,
            layers: saved.board.layers || [],
            templates: saved.board.templates || [],
            presentation: saved.board.presentation || [],
            settings: saved.board.settings,
          },
        });
        closeDialog(true);
        await refresh(false);
        return await enter(b.id);
      }
      if (action === "link") {
        const link = `${location.origin}/#project/${state.project.id}/board/${id}`;
        try {
          await navigator.clipboard.writeText(link);
          toast("Board link copied. Paste it in a card or board note.");
        } catch {
          // The browser refused the clipboard: the link to copy by hand, as Copy frame link does.
          showDialog(`<dialog class="dialog">${dialogHead("Board link")}<div class="dialog-body"><input aria-label="Board link" value="${esc(link)}" readonly></div></dialog>`, "board-link");
        }
        return;
      }
      if (action === "link-task") {
        const b = ctx.board();
        showDialog(
          `<dialog class="dialog"><form id="drawing-links">${dialogHead("Link board to cards")}<div class="dialog-body">${state.tasks
            .filter((t) => !t.archived)
            .map(
              (t) =>
                `<label class="source-capability"><input type="checkbox" name="task" value="${esc(t.id)}" ${(b.settings.linked_tasks || []).includes(t.id) ? "checked" : ""}>${esc(t.key)} · ${esc(t.title)}</label>`,
            )
            .join(
              "",
            )}</div><div class="dialog-foot"><button class="button primary">Save links</button></div></form></dialog>`,
          "drawing-links",
        );
        const form = document.querySelector("#drawing-links");
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          const tasks = new FormData(form).getAll("task");
          ctx.changeBoard((b) => (b.settings.linked_tasks = tasks));
          closeDialog(true);
        });
        return;
      }
      if (action === "offline") {
        if (!isSecureContext || !("serviceWorker" in navigator))
          throw Error(
            "Offline drawing needs HTTPS on your iPad (or localhost on this computer).",
          );
        await navigator.serviceWorker.register("/drawing-worker.js");
        await navigator.serviceWorker.ready;
        storage.set("drawing-owner", owner());
        const checkpoints = await localDrawings(owner());
        for (const b of canvases())
          if (
            !checkpoints.some(
              (d) =>
                d.project.id === state.project.id &&
                d.board.id === b.id &&
                d.pending,
            )
          )
            await drawingCheckpoint(
              owner(),
              state.project,
              b,
              ctx.sync.entries.has(route("boards", b.id)),
              { protectPending: true },
            );
        toast(
          "Offline drawing is ready. Choose Open offline pad in Board tools and bookmark that page before disconnecting.",
        );
      }
    } catch (error) {
      toast(error.message, true);
    }
  });
  const sidebar = boardExplorer(ctx, { canvases, enter });
  return { gallery, render, enter, checkpoint, ready, reset, settled: () => preparing, sidebar: sidebar.sync, folder: sidebar.folder };
}
