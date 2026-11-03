import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";
import { closePopup, finishPopupExits } from "./popup-motion.js";

// A small panel beside the button that opened it, one at a time: light dismiss, Escape and a close
// button, with focus back on the button. The document and board lists share it.
// The last control pressed, during its click only: a panel's opener pressed again closes the panel,
// while a panel shown from inside the open one (such as Rename from Document tools, anchored to the
// same button) opens as before (owner request T26).
// iPad Safari dismisses the panel as the finger touches its opener, before the click; that opener's
// click then doesn't open it again either.
let pressed = null, down = null;
document.addEventListener("click", (event) => {
  pressed = event.target;
  setTimeout(() => { if (pressed === event.target) pressed = null; }, 0);
}, true);
document.addEventListener("pointerdown", (event) => { down = event.target; }, true);

export function anchoredPanel({ state, esc, icon }) {
  let panel = null, opener = null, dismissed = null;
  function close(focus = false) {
    if (!panel) return;
    if (opener?.hasAttribute("aria-expanded")) opener.setAttribute("aria-expanded", "false");
    panel.cleanup?.();
    const closing = panel;
    panel = null;
    closePopup(closing, () => closing.remove());
    if (state.dialog === "document-panel") state.dialog = null;
    if (focus && opener?.isConnected) opener.focus({ preventScroll: true });
  }
  // A menu (Document tools, Insert) is a list of rows like the board's menus: no header, 4px padding.
  function show(button, title, html, width = 360, { menu = false } = {}) {
    // Pressed again, its opener closes this panel; it opens another panel (one shown from inside
    // this one, such as Backlinks) as before.
    if (panel && button === opener && panel.getAttribute("aria-label") === title && pressed instanceof Node && button.contains(pressed)) return close(true);
    if (dismissed?.button === button && Date.now() - dismissed.at < 700 && pressed instanceof Node && button.contains(pressed)) { dismissed = null; return; }
    dismissed = null;
    if (panel?.contains(button)) button = opener;
    close();
    finishPopupExits();
    opener = button;
    panel = document.createElement("section");
    panel.className = `document-panel board-settings-popover${menu ? " document-menu" : ""}`;
    panel.setAttribute("popover", "auto");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    panel.innerHTML = menu ? html : `<header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-document-panel-close aria-label="Close ${esc(title)}">${icon("close")}</button></header>${html}`;
    document.body.append(panel); panel.showPopover(); state.dialog = "document-panel";
    const position = () => panel && positionPopover(panel, button.getBoundingClientRect(), { width, maxHeight: Math.min(560, innerHeight - 24) });
    position();
    const lifecycle = new AbortController();
    // On the next frame: placing the panel can resize it, such as when the bottom bar, hidden while
    // typing, comes back as focus leaves the text.
    const observer = new ResizeObserver(() => requestAnimationFrame(position));
    observer.observe(panel);
    panel.cleanup = () => { lifecycle.abort(); observer.disconnect(); };
    window.addEventListener("resize", position, { signal: lifecycle.signal });
    window.visualViewport?.addEventListener("resize", position, { signal: lifecycle.signal });
    const openedPanel = panel;
    panel.addEventListener("toggle", event => {
      if (event.newState !== "closed") return;
      openedPanel.cleanup();
      closePopup(openedPanel, () => openedPanel.remove());
      if (panel === openedPanel) {
        if (button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");
        if (state.dialog === "document-panel") state.dialog = null;
        // Dismissed from outside: forgotten, so its button opens it again next time, unless the press
        // that dismissed it was on that button.
        dismissed = down instanceof Node && button.contains(down) ? { button, at: Date.now() } : null;
        panel = null; opener = null;
      }
    });
    panel.querySelector("[data-document-panel-close]")?.addEventListener("click", () => close(true));
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    focusOnOpen(panel.querySelector("input,button"), panel.querySelector("button"));
    return panel;
  }
  return { show, close, get element() { return panel; } };
}
