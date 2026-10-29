import { containPanelScroll } from "./scroll-gestures.js";
// One task panel for every project view; the board anchors it beside its tools.
let panelWidth = 720;
export function boardTaskEditor(
  dialog,
  { $, state, closeDialog, icon },
) {
  dialog.classList.add("board-task-editor");
  const onBoard = ["board", "drawing"].includes(state.view);
  const existing = !!dialog.querySelector("#task-form")?.dataset.id;
  const docked = !onBoard && existing;
  dialog.classList.toggle("project-task-editor", docked);
  const draft = dialog.querySelector("#task-form")?.dataset.draftNode;
  dialog.setAttribute(
    "aria-label",
    draft ? "Draft task" : existing ? "Edit project task" : "New project task",
  );
  dialog.setAttribute("aria-modal", "false");
  const close = dialog.querySelector('[data-action="dialog-close"]');
  close.setAttribute("aria-label", existing ? "Close task" : "Close new task");
  const heading = document.createElement("header");
  heading.className = "board-task-editor-heading dialog-head task-editor-head";
  const oldHead = dialog.querySelector(".task-editor-head");
  while (oldHead.firstChild) heading.append(oldHead.firstChild);
  const actions = heading.querySelector('.task-editor-actions');
  dialog.querySelector("#task-form").prepend(heading);
  oldHead.remove();
  dialog.querySelector(".form-status")?.remove();
  const panes = document.createElement("div");
  panes.className = "task-pane-switcher";
  panes.setAttribute("role", "group");
  panes.setAttribute("aria-label", "Task panel");
  if (existing) {
    panes.innerHTML = `<button type="button" class="icon-button" data-feature="task-details" data-editor-pane="details" aria-label="Task details" title="Task details">${icon("info")}</button>`;
    for (const pane of ["history", "comments"]) {
      const button = actions.querySelector(`[data-feature="task-${pane}"]`);
      button.dataset.editorPane = pane;
      panes.append(button);
    }
    actions.prepend(panes);
  }
  // Duplicate, archive and delete form one group before the close button.
  const more = document.createElement("div");
  more.className = "task-secondary-actions";
  more.setAttribute("role", "group");
  more.setAttribute("aria-label", "Manage task");
  if (existing) {
    more.append(actions.querySelector('[data-feature="task-duplicate"]'), actions.querySelector('[data-feature="task-archive"]'), actions.querySelector('[data-action="task-delete"]'));
    actions.append(more);
  }
  const phone = () => innerWidth <= 600;
  const releaseScroll = containPanelScroll(dialog, () => {
    if (phone()) return dialog.querySelector("#task-form");
    const pane = dialog.classList.contains("with-task-comments") ? ".task-comments-panel" : dialog.classList.contains("with-task-history") ? ".task-history-panel" : ".task-editor-content > .dialog-body";
    return dialog.querySelector(pane);
  });
  let releasePage = null;
  function updatePageMode() {
    if (phone() === !!releasePage) return;
    dialog.classList.toggle("task-editor-page", phone());
    dialog.setAttribute("aria-modal", String(phone()));
    if (!phone()) {
      releasePage();
      releasePage = null;
      dialog.querySelector("#task-form").scrollTop = 0;
      return;
    }
    // Keep the underlying workspace mounted, but freeze it while the phone
    // task page owns navigation and scrolling. Fixed body also stops iOS bounce.
    const app = document.querySelector("#app");
    const inert = app.inert;
    const x = scrollX, y = scrollY;
    const root = document.documentElement;
    root.style.setProperty("--task-page-offset", `${-y}px`);
    root.classList.add("task-page-open");
    app.inert = true;
    releasePage = () => {
      app.inert = inert;
      root.classList.remove("task-page-open");
      root.style.removeProperty("--task-page-offset");
      window.scrollTo(x, y);
    };
  }
  const identity = heading.querySelector(".task-identity-row");
  const titleRow = heading.querySelector(".task-title-row");
  let wasPhone;
  function updatePanes() {
    const pane = dialog.classList.contains("with-task-comments") ? "comments" : dialog.classList.contains("with-task-history") ? "history" : "details";
    const auxiliary = innerWidth < 1100 && pane !== "details";
    dialog.querySelector(".task-editor-content > .dialog-body").hidden = auxiliary;
    dialog.querySelector(".task-editor-foot").hidden = auxiliary;
    for (const button of panes.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.editorPane === pane));
  }
  function position() {
    if (!dialog.isConnected) return;
    updatePageMode();
    updatePanes();
    if (wasPhone !== phone()) {
      wasPhone = phone();
      if (wasPhone) titleRow.prepend(identity);
      else heading.querySelector(".task-editor-header-row").prepend(identity);
    }
    if (phone()) {
      // iOS keeps the layout viewport tall when the software keyboard opens.
      // Fit both existing and new task panels to the part that is visible.
      const viewport = window.visualViewport;
      Object.assign(dialog.style, {
        left: `${viewport?.offsetLeft || 0}px`,
        top: `${viewport?.offsetTop || 0}px`,
        width: `${viewport?.width || innerWidth}px`,
        height: `${viewport?.height || innerHeight}px`,
      });
      return;
    }
    if (docked) {
      const viewport = window.visualViewport;
      const visibleTop = viewport?.offsetTop || 0;
      const visibleHeight = viewport?.height || innerHeight;
      const auxiliary =
        innerWidth >= 1100 &&
        dialog.matches(".with-task-history,.with-task-comments")
          ? 312
          : 0;
      const width = Math.min(
        panelWidth,
        innerWidth - auxiliary - (innerWidth <= 600 ? 0 : 24),
        innerWidth <= 600 ? innerWidth : innerWidth - Math.max(0, $(".main")?.getBoundingClientRect().left || 0) - 24,
      );
      Object.assign(dialog.style, {
        left: `${innerWidth - width - (innerWidth <= 600 ? 0 : 12)}px`,
        top: `${visibleTop + 12}px`,
        width: `${width}px`,
        height: `${Math.max(1, visibleHeight - 24)}px`,
      });
      return;
    }
    // Creation shares the compact board panel in every project view.
    const surface = onBoard ? $("#canvas") : $("#view-content") || $(".help-page");
    if (!surface) return;
    const r = surface.getBoundingClientRect();
    const besideTools = onBoard && r.width > 600;
    const auxiliary = innerWidth >= 1100 && dialog.matches('.with-task-history,.with-task-comments') ? 312 : 0;
    const width = Math.min(
      680,
      innerWidth - 24 - auxiliary,
      r.width - (besideTools ? 90 : 24) - auxiliary,
    );
    const left = Math.max(
      12,
      Math.min(r.left + (besideTools ? 76 : 12), innerWidth - width - 12),
    );
    const viewport = window.visualViewport;
    const visibleTop = viewport?.offsetTop || 0;
    const visibleBottom = visibleTop + (viewport?.height || innerHeight);
    const top = Math.max(visibleTop + 8, Math.min(r.top + 18, visibleBottom - 240));
    Object.assign(dialog.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${Math.max(1, Math.min(760, visibleBottom - top - 16, r.bottom - top - 16))}px`,
    });
  }
  // Freeze the workspace before the browser focuses the dialog's first control.
  updatePageMode();
  dialog.show();
  position();
  if (docked) {
    const grip = document.createElement("div");
    grip.className = "task-panel-resizer";
    grip.tabIndex = 0;
    grip.setAttribute("role", "separator");
    grip.setAttribute("aria-label", "Resize task panel");
    grip.setAttribute("aria-orientation", "vertical");
    const resize = (width) => {
      panelWidth = Math.max(360, Math.min(900, width));
      grip.setAttribute("aria-valuenow", String(panelWidth));
      position();
    };
    grip.setAttribute("aria-valuemin", "360");
    grip.setAttribute("aria-valuemax", "900");
    grip.setAttribute("aria-valuenow", String(panelWidth));
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", (event) => {
      if (grip.hasPointerCapture(event.pointerId))
        resize(innerWidth - event.clientX - 12);
    });
    grip.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      resize(panelWidth + (event.key === "ArrowLeft" ? 20 : -20));
    });
    dialog.prepend(grip);
  }
  const observer = new ResizeObserver(position);
  observer.observe(document.querySelector(".main"));
  const classes = new MutationObserver(position);
  classes.observe(dialog, { attributes: true, attributeFilter: ["class"] });
  let viewportFrame;
  const viewportResized = () => {
    position();
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      const active = document.activeElement;
      const body = dialog.querySelector(phone() ? "#task-form" : ".task-editor-content > .dialog-body");
      if (!body?.contains(active) || !active.matches('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]') || active.closest(":popover-open")) return;
      const selection = window.getSelection();
      const range = active.isContentEditable && selection?.rangeCount && active.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
      if (range) range.collapse(false);
      const caret = range?.getBoundingClientRect();
      const rect = caret?.height ? caret : active.getBoundingClientRect();
      const visible = body.getBoundingClientRect();
      const visibleTop = phone() && !heading.contains(active) ? Math.max(visible.top, heading.getBoundingClientRect().bottom) : visible.top;
      // Scroll only the task's content, without moving the page or refocusing.
      if (rect.top < visibleTop + 8) body.scrollTop += rect.top - visibleTop - 8;
      else if (rect.bottom > visible.bottom - 8) body.scrollTop += Math.min(rect.bottom - visible.bottom + 8, rect.top - visibleTop - 8);
    });
  };
  window.addEventListener("resize", position);
  window.visualViewport?.addEventListener("resize", viewportResized);
  window.visualViewport?.addEventListener("scroll", position);
  // The phone page scrolls natively. Repositioning the entire editor on each
  // content scroll fights Safari's viewport/keyboard scrolling.
  const scrolled = () => { if (!phone()) position(); };
  document.addEventListener("scroll", scrolled, true);
  const keydown = (event) => {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      dialog.querySelector("form").requestSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeDialog(false, { confirmDirty: false });
    }
    event.stopPropagation();
  };
  dialog.addEventListener("keydown", keydown);
  return {
    position,
    destroy() {
      releaseScroll();
      observer.disconnect();
      classes.disconnect();
      dialog.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", position);
      cancelAnimationFrame(viewportFrame);
      window.visualViewport?.removeEventListener("resize", viewportResized);
      window.visualViewport?.removeEventListener("scroll", position);
      document.removeEventListener("scroll", scrolled, true);
      releasePage?.();
    },
  };
}
