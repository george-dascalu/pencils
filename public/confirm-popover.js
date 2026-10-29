import { positionPopover } from "./popover-position.js";

// One anchored confirmation for destructive or irreversible actions, replacing
// window.confirm. It opens beside the control that triggered it (or centred
// when there is none), closes with Escape, Cancel or a tap outside, and returns
// focus to the trigger. Synchronous navigation guards keep window.confirm.
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
let active = null;

export function confirmAction({ anchor = null, title = "", message = "", confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
  active?.(false);
  return new Promise((resolve) => {
    const opener = anchor instanceof Element ? anchor : document.activeElement instanceof Element ? document.activeElement : null;
    const panel = document.createElement("div");
    panel.className = "selection-popover confirm-popover";
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-label", title || message);
    panel.innerHTML = `${title ? `<strong class="confirm-title">${esc(title)}</strong>` : ""}${message ? `<p class="confirm-message">${esc(message)}</p>` : ""}<div class="confirm-actions"><button type="button" class="button" data-confirm-cancel>${esc(cancelLabel)}</button><button type="button" class="button ${danger ? "danger" : "primary"}" data-confirm-accept>${esc(confirmLabel)}</button></div>`;
    document.body.append(panel);
    const place = () => {
      const r = opener?.isConnected ? opener.getBoundingClientRect() : null;
      if (r && (r.width || r.height)) positionPopover(panel, r, { width: 320, maxHeight: 280 });
      else {
        panel.style.width = `${Math.min(320, innerWidth - 16)}px`;
        panel.style.left = `${Math.max(8, (innerWidth - panel.offsetWidth) / 2)}px`;
        panel.style.top = `${Math.max(8, (innerHeight - panel.offsetHeight) / 3)}px`;
      }
    };
    const finish = (ok) => {
      if (!panel.isConnected) return;
      panel.remove();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keys, true);
      removeEventListener("resize", place);
      active = null;
      if (opener?.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
      resolve(ok);
    };
    const outside = (event) => { if (!panel.contains(event.target)) finish(false); };
    const keys = (event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
      else if (event.key === "Tab") {
        const items = [...panel.querySelectorAll("button")];
        const index = items.indexOf(document.activeElement);
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
        event.preventDefault();
      }
    };
    panel.addEventListener("click", (event) => {
      if (event.target.closest("[data-confirm-accept]")) finish(true);
      else if (event.target.closest("[data-confirm-cancel]")) finish(false);
    });
    place();
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    document.addEventListener("keydown", keys, true);
    addEventListener("resize", place);
    active = finish;
    panel.querySelector(danger ? "[data-confirm-cancel]" : "[data-confirm-accept]").focus();
  });
}
