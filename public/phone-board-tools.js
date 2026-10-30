import { positionPopover } from "./popover-position.js";

// Move the existing tools, retaining their handlers and state on every device.
export function phoneBoardTools({ icon, state }) {
  const phone = matchMedia("(max-width: 600px)");
  let canvas, dock, palette, trigger, boardId, open = false, moved = [], interaction = 0;
  function move(element, target) {
    if (!element) return;
    const slot = document.createComment("canvas tool position");
    element.before(slot);
    moved.push([element, slot]);
    target.append(element);
  }
  function position() {
    if (palette && !palette.hidden)
      positionPopover(palette, trigger.getBoundingClientRect(), { width: 360, maxHeight: 470, gap: 8 });
  }
  function close(focus = false) {
    open = false;
    if (!palette) return;
    interaction++;
    palette.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus({ preventScroll: true });
  }
  function sync() {
    const next = document.querySelector("#canvas");
    if (phone.matches && next === canvas && dock?.isConnected) return;
    // A save can rebuild the app shell before the canvas is mounted again.
    const nextBoard = ["board", "drawing"].includes(state.view) ? state.selectedBoard : null;
    if (!phone.matches || nextBoard !== boardId) open = false;
    boardId = nextBoard;
    for (const [el, slot] of moved.reverse()) if (slot.isConnected) slot.replaceWith(el);
    moved = [];
    dock?.remove(); palette?.remove(); trigger?.remove();
    canvas?.querySelector(".board-tools")?.setAttribute("aria-orientation", "vertical");
    canvas = next;
    dock = palette = trigger = null;
    const tools = canvas?.querySelector(".board-tools"), controls = canvas?.querySelector(".board-controls");
    if (!phone.matches || !tools || !controls) return;
    dock = document.createElement("div");
    dock.className = "phone-board-dock";
    canvas.append(dock);
    move(tools, dock); move(controls, dock);
    tools.setAttribute("aria-orientation", "horizontal");
    trigger = document.createElement("button");
    trigger.className = "phone-board-more icon-button";
    trigger.setAttribute("aria-label", "More canvas tools");
    trigger.setAttribute("aria-controls", "phone-board-palette");
    trigger.setAttribute("aria-expanded", String(open));
    trigger.innerHTML = icon("plus");
    tools.append(trigger);
    palette = document.createElement("div");
    palette.id = "phone-board-palette";
    palette.className = "phone-board-palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-label", "Canvas tools");
    palette.hidden = !open;
    palette.innerHTML = `<header><strong>Canvas tools</strong><button type="button" class="icon-button" data-phone-tools-close aria-label="Close canvas tools">${icon("close")}</button></header><div class="phone-board-extra-navigation" role="group" aria-label="Navigation"></div>`;
    tools.append(palette);
    const navigation = palette.querySelector(".phone-board-extra-navigation");
    move(tools.querySelector('[data-pro="search-toggle"]'), navigation);
    for (const group of tools.querySelectorAll(':scope > .board-tool-group:not([aria-label="Navigate"])')) move(group, palette);
    const view = document.createElement("div");
    view.className = "phone-board-view-tools";
    view.setAttribute("role", "group"); view.setAttribute("aria-label", "View");
    palette.append(view);
    for (const button of controls.querySelectorAll('[data-board-display], #expanded-board-settings')) move(button, view);
    view.insertAdjacentHTML("beforeend", `<button type="button" class="icon-button" data-board-display="minimap" aria-label="Minimap" aria-pressed="${!canvas.querySelector('#canvas-minimap')?.classList.contains('hidden')}">${icon("board")}</button>`);
    trigger.onclick = () => {
      interaction++;
      open = !open;
      palette.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
      position();
    };
    position();
  }
  document.addEventListener("click", event => {
    if (!palette || palette.hidden) return;
    if (event.target.closest("[data-phone-tools-close]")) return close(true);
    if (palette.contains(event.target) && event.target.closest("button")) {
      // Let the existing action run before hiding its trigger.
      open = false;
      const opened = palette, current = interaction;
      setTimeout(() => { if (palette === opened && interaction === current) close(); }, 0);
    } else if (!dock.contains(event.target)) close();
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && palette && !palette.hidden) {
      event.preventDefault(); event.stopImmediatePropagation(); close(true);
    }
  }, true);
  window.addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", position);
  return { sync };
}
