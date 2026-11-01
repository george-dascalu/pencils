import { focusOnOpen } from "./open-focus.js";

// The document list and the board list (T25, 0.20.96) have a page of their own instead of a
// sidebar section: pressing the open Documents or Boards tab (on touch screens, the tray's
// Documents button) shows the list over the open document or board, which shows blurred beside it
// on desktop and iPad and is covered on phones. A choice, Escape, its close button or a click
// outside closes it. project-documents.js and board-explorer.js fill it (folder-tree.js).
// A board choice closes the list itself once it's accepted (board-explorer.js), so a refused one keeps it.
const CHOICES = '[data-list-close], [data-document-open], [data-document-action="create"], [data-board-menu="board-new"] .board-menu-panel > *';
export function listPanel(state) {
  let openFor = null, opener = null, pressed = null;
  const panel = () => document.querySelector("#list-panel");
  const shown = () => !!panel() && !panel().hidden;
  const where = () => `${state.project?.id}:${state.view}`;
  function open(button) {
    const el = panel();
    if (!el?.firstElementChild) return;
    el.dataset.userOpen = "";
    el.hidden = false;
    openFor = where(); opener = button;
    sync();
    focusOnOpen(el.querySelector('input[type="search"]'), el.querySelector('nav [aria-current="page"], nav button'));
  }
  function close(focus = true) {
    const el = panel();
    openFor = null;
    if (!el || el.hidden) return;
    el.hidden = true;
    sync();
    // The tray's Documents button closes with the tray, so focus goes to the open tab instead.
    if (focus) {
      opener?.focus({ preventScroll: true });
      if (document.activeElement !== opener) document.querySelector(".tabs .tab.active")?.focus({ preventScroll: true });
    }
    opener = null;
  }
  // A press outside that closes the list, such as on the open tab, doesn't open it again.
  function toggle(button) {
    if (pressed && button.contains(pressed)) return;
    shown() ? close() : open(button);
  }
  document.addEventListener("click", event => {
    pressed = null;
    const el = panel();
    if (!el || el.hidden) return;
    if (el.contains(event.target)) {
      if (!event.target.closest(CHOICES)) return;
      event.target.closest("details[open]")?.removeAttribute("open");
      close(!!event.target.closest("[data-list-close]"));
    } else if (event.target.closest(".main")) {
      pressed = event.target;
      close(false);
    }
  }, true);
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-list-toggle]");
    if (button) toggle(button);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !shown() || state.dialog || state.menu || event.target.closest?.("details[open]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // A search with text clears first, as search fields do; the next Escape closes the list.
    const search = event.target.closest?.('#list-panel input[type="search"]');
    if (search?.value) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
    } else close();
  }, true);
  // A rebuilt page keeps the list open while the same project and view stay open.
  function html() {
    if (openFor !== where()) openFor = null;
    return `<section id="list-panel" class="list-panel" ${openFor ? "" : "hidden"}></section>`;
  }
  // After each render: a page without the list forgets it was open, and while it shows, the
  // blurred page behind it is inert, so Tab stays in the list.
  function sync() {
    if (!panel()) openFor = null;
    // A closing list can still be painted for its exit, but must stop receiving input at once.
    if (panel()) panel().inert = !shown();
    for (const el of document.querySelectorAll("#view-toolbar, #view-content")) el.inert = shown();
  }
  return { html, toggle, close, sync };
}
