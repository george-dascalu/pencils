import { positionPopover } from "./popover-position.js";
import { focusOnOpen } from "./open-focus.js";

// A small panel beside the button that opened it, one at a time: light dismiss, Escape and a close
// button, with focus back on the button. Documents and the sidebar's board list share it.
export function anchoredPanel({ state, esc, icon }) {
  let panel = null, opener = null;
  function close(focus = false) {
    if (!panel) return;
    if (opener?.hasAttribute("aria-expanded")) opener.setAttribute("aria-expanded", "false");
    panel.cleanup?.();
    if (panel.matches(":popover-open")) panel.hidePopover();
    panel.remove(); panel = null;
    if (state.dialog === "document-panel") state.dialog = null;
    if (focus && opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function show(button, title, html, width = 360) {
    if (panel?.contains(button)) button = opener;
    close();
    opener = button;
    panel = document.createElement("section");
    panel.className = "document-panel board-settings-popover";
    panel.setAttribute("popover", "auto");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    panel.innerHTML = `<header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-document-panel-close aria-label="Close ${esc(title)}">${icon("close")}</button></header>${html}`;
    document.body.append(panel); panel.showPopover(); state.dialog = "document-panel";
    const position = () => panel && positionPopover(panel, button.getBoundingClientRect(), { width, maxHeight: Math.min(560, innerHeight - 24) });
    position();
    const lifecycle = new AbortController();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    panel.cleanup = () => { lifecycle.abort(); observer.disconnect(); };
    window.addEventListener("resize", position, { signal: lifecycle.signal });
    window.visualViewport?.addEventListener("resize", position, { signal: lifecycle.signal });
    const openedPanel = panel;
    panel.addEventListener("toggle", event => {
      if (event.newState !== "closed") return;
      openedPanel.cleanup();
      if (panel === openedPanel) {
        if (button.hasAttribute("aria-expanded")) button.setAttribute("aria-expanded", "false");
        if (state.dialog === "document-panel") state.dialog = null;
      }
    });
    panel.querySelector("[data-document-panel-close]").addEventListener("click", () => close(true));
    panel.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    focusOnOpen(panel.querySelector("input,button"), panel.querySelector("button"));
    return panel;
  }
  return { show, close, get element() { return panel; } };
}
