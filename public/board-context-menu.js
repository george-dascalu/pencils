// A right click on a board opens the board's own menu beside the pointer (F0.22-65): Copy, Paste,
// Duplicate and Delete, in rows like the board's other menus, with Delete after a divider.
import { anchoredPanel } from "./anchored-panel.js";

export function boardContextMenu({ state, esc, icon }) {
  const panels = anchoredPanel({ state, esc, icon });
  const item = (action, glyph, label, on, extra = "") =>
    `<button type="button" class="document-panel-item${extra}" data-board-menu="${action}"${on ? "" : " disabled"}>${icon(glyph)}${label}</button>`;
  // `on` says which actions apply; `run` gets the one chosen.
  function open(canvas, at, on, run) {
    const panel = panels.show(canvas, "Object actions",
      `<section class="document-tool-group">${item("copy", "copy", "Copy", on.copy)}${item("paste", "paste", "Paste", on.paste)}${item("duplicate", "duplicate", "Duplicate", on.duplicate)}</section><section class="document-tool-group">${item("delete", "trash", "Delete", on.delete, " danger")}</section>`,
      200, { menu: true, at: new DOMRect(at.x, at.y, 0, 0) });
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-board-menu]");
      if (!button || button.disabled) return;
      panels.close(true);
      run(button.dataset.boardMenu);
    });
  }
  return { open, close: () => panels.close() };
}
