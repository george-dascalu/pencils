import { anchoredPanel } from "./anchored-panel.js";
import { folderTree } from "./folder-tree.js";

// Boards in the main sidebar, like Documents (0.20.74): folders, search and a New board menu
// (Blank, Import Obsidian .canvas, Import from Miro). It replaced the board picker and the gallery.
export function boardExplorer(ctx, { canvases, enter }) {
  const { state, api, route, icon, toast } = ctx;
  const panels = anchoredPanel(ctx);
  const explorer = folderTree({ ...ctx, kind: "board", label: "Boards", placeholder: "Find a board…", glyph: "board", panels,
    items: canvases, selected: () => state.selectedBoard, matches: (b, query) => b.title.toLocaleLowerCase().includes(query), moveItem: move });
  async function move(id, folder) {
    // While a conflict holds, refreshes keep this browser's boards, so the list wouldn't follow.
    if (state.boardConflict) throw Error("Resolve the canvas conflict before moving boards.");
    await ctx.flushBoard();
    const latest = await api(route("boards", id));
    await api(route("boards", id), { method: "PATCH", body: { revision: latest.revision, folder: folder || null } });
    await ctx.refresh(false);
    explorer.expand(folder);
    explorer.update();
    toast("Board moved.");
  }
  // Board tools → Move to folder, beside the menu it came from.
  function movePanel(button) {
    const board = ctx.board();
    if (!board) return;
    const box = panels.show(document.querySelector("#board-menu-tools") || button, "Move board", `<form><label class="field">Folder<select name="folder">${explorer.options(board.folder)}</select></label><div class="document-panel-actions"><button class="button primary">Move</button></div></form>`);
    box.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault();
      const submit = event.submitter; submit.disabled = true;
      try { await move(board.id, event.target.elements.folder.value); panels.close(true); }
      catch (error) { toast(error.message, true); submit.disabled = false; }
    });
  }
  async function choose(id) {
    if (state.boardTaskEditor && !ctx.closeDialog(false, { confirmDirty: false })) return;
    if (state.boardSaves || state.boardConflict) return toast("Finish saving the current canvas first.", true);
    await enter(id);
  }
  // Fills the sidebar's section in board views and empties it when another view opens.
  function sync() {
    const host = document.querySelector("#sidebar-documents");
    if (!host) return;
    const shown = host.querySelector("#board-explorer");
    if (!["board", "drawing"].includes(state.view)) {
      if (!shown) return;
      host.innerHTML = "";
      host.closest(".sidebar")?.removeAttribute("data-documents");
      explorer.reset(); panels.close();
      return;
    }
    if (!state.project?.board_folders?.some(f => f.id === explorer.active)) explorer.active = null;
    if (shown) return explorer.update();
    // A rebuilt sidebar (and bar) leaves an open panel without its button.
    panels.close();
    host.innerHTML = explorer.html({
      actions: `<details class="board-menu" data-board-menu="board-new"><summary class="icon-button" aria-label="New board" title="New board">${icon("plus")}</summary><div class="board-menu-panel"><button type="button" data-action="board-new">${icon("board")}Blank board</button><button type="button" data-feature="canvas-import">${icon("upload")}Import Obsidian .canvas</button><button type="button" data-feature="miro-import">${icon("download")}Import from Miro</button></div></details><button type="button" class="icon-button" data-board-action="new-folder" aria-label="New folder" title="New folder">${icon("folder")}</button>`,
    });
    host.setAttribute("aria-label", "Boards");
    host.closest(".sidebar")?.setAttribute("data-documents", "shown");
  }
  document.addEventListener("click", event => {
    const open = event.target.closest("[data-board-open]");
    if (open) return void choose(open.dataset.boardOpen).catch(error => toast(error.message, true));
    const action = event.target.closest("[data-board-action]")?.dataset.boardAction;
    if (action === "new-folder") explorer.panel(event.target.closest("[data-board-action]"));
    if (action === "move") movePanel(event.target.closest("[data-board-action]"));
  });
  return { sync, folder: () => explorer.active };
}
