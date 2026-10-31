// Phones dock the board's tools by category: Navigate and Add each open a row of their tools above
// the dock, which scrolls sideways; Pen and Search are the pen and board search themselves. The
// existing tools move, retaining their handlers and state on every device.
export function phoneBoardTools({ icon, state }) {
  const phone = matchMedia("(max-width: 600px)");
  const categories = [["navigate", "Navigate", "cursor"], ["add", "Add", "plus"]];
  let canvas, dock, rows = {}, boardId, open = null, moved = [];
  function move(element, target) {
    if (!element) return;
    const slot = document.createComment("canvas tool position");
    element.before(slot);
    moved.push([element, slot]);
    target.append(element);
  }
  function show(key, focus = false) {
    const was = open;
    open = key;
    for (const [name, { button, row }] of Object.entries(rows)) {
      row.hidden = name !== key;
      button.setAttribute("aria-expanded", String(name === key));
    }
    if (focus && was) rows[was].button.focus({ preventScroll: true });
  }
  function sync() {
    const next = document.querySelector("#canvas");
    if (phone.matches && next === canvas && dock?.isConnected) return;
    // A save can rebuild the app shell before the canvas is mounted again.
    const nextBoard = ["board", "drawing"].includes(state.view) ? state.selectedBoard : null;
    if (!phone.matches || nextBoard !== boardId) open = null;
    boardId = nextBoard;
    for (const [el, slot] of moved.reverse()) if (slot.isConnected) slot.replaceWith(el);
    moved = [];
    dock?.remove();
    for (const { button, row } of Object.values(rows)) { button.remove(); row.remove(); }
    canvas?.querySelector(".board-tools")?.setAttribute("aria-orientation", "vertical");
    canvas = next;
    dock = null;
    rows = {};
    const tools = canvas?.querySelector(".board-tools"), controls = canvas?.querySelector(".board-controls");
    if (!phone.matches || !tools || !controls) return;
    dock = document.createElement("div");
    dock.className = "phone-board-dock";
    canvas.append(dock);
    move(tools, dock); move(controls, dock);
    tools.setAttribute("aria-orientation", "horizontal");
    for (const [key, label, glyph] of categories) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "phone-board-category icon-button";
      button.dataset.phoneCategory = key;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.setAttribute("aria-controls", `phone-board-${key}`);
      button.innerHTML = icon(glyph);
      button.onclick = () => show(open === key ? null : key);
      const row = document.createElement("div");
      row.id = `phone-board-${key}`;
      row.className = "phone-board-row";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", label);
      tools.append(button, row);
      rows[key] = { button, row };
    }
    move(tools.querySelector('[data-feature="draw-tool"]'), tools);
    move(tools.querySelector('[data-pro="search-toggle"]'), tools);
    const group = name => dock.querySelector(`.board-tool-group[aria-label="${name}"]`);
    move(group("Navigate"), rows.navigate.row);
    move(group("History"), rows.navigate.row);
    // Full screen and Board appearance; Minimap and Background pattern stay in the zoom menu.
    const view = document.createElement("div");
    view.className = "board-tool-group";
    view.setAttribute("role", "group"); view.setAttribute("aria-label", "View");
    rows.navigate.row.append(view);
    for (const button of controls.querySelectorAll(':scope > [data-board-display], #expanded-board-settings')) move(button, view);
    for (const name of ["Tasks", "Create", "Arrange"]) move(group(name), rows.add.row);
    // The row lists Insert's actions with the other tools instead of opening a menu.
    const insert = rows.add.row.querySelector('[data-board-menu="insert"]');
    for (const item of insert?.querySelectorAll(".board-menu-panel > button") || []) move(item, insert.parentElement);
    show(open);
  }
  document.addEventListener("click", event => {
    const key = open, row = rows[open]?.row;
    if (!row || event.target.closest(".phone-board-category")) return;
    if (!row.contains(event.target)) return show(null);
    // Undo and redo may be pressed again; other tools close the row once their action has run.
    if (!event.target.closest("button") || event.target.closest('[data-action="board-undo"], [data-action="board-redo"]')) return;
    // A rebuild while the action runs keeps the row closed too. Focus left in the row returns
    // to its category, as with Escape.
    open = null;
    setTimeout(() => {
      if (row.contains(document.activeElement)) rows[key]?.button.focus({ preventScroll: true });
      show(open);
    }, 0);
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && open && dock?.offsetParent) {
      event.preventDefault(); event.stopImmediatePropagation(); show(null, true);
    }
  }, true);
  return { sync };
}
