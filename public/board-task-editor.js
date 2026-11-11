import { containPanelScroll } from "./scroll-gestures.js";
// One task panel for every project view; the board anchors it beside its tools.
// 30% wider than the first 720px (owner request F0.23-13); a width chosen with the grip lasts the session.
let panelWidth = 936;
export function boardTaskEditor(
  dialog,
  { $, state, closeDialog, selectPane },
) {
  dialog.classList.add("board-task-editor");
  const onBoard = ["board", "drawing"].includes(state.view);
  const existing = !!dialog.querySelector("#task-form")?.dataset.id;
  const docked = !onBoard && existing;
  dialog.classList.toggle("project-task-editor", docked);
  const draft = dialog.querySelector("#task-form")?.dataset.draftNode;
  dialog.setAttribute(
    "aria-label",
    draft ? "Draft card" : existing ? "Edit project card" : "New project card",
  );
  dialog.setAttribute("aria-modal", "false");
  const close = dialog.querySelector('[data-action="dialog-close"]');
  close.setAttribute("aria-label", existing ? "Close card" : "Close new card");
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
  panes.setAttribute("aria-label", "Card panel");
  if (existing) {
    const choice = document.createElement('select');
    choice.className = 'task-section-picker';
    choice.setAttribute('aria-label', 'Card section');
    choice.innerHTML = '<option value="details" data-icon="info">Details</option><option value="board" data-icon="board">Board</option><option value="history" data-icon="clock">Versions</option><option value="comments" data-icon="comment">Comments</option>';
    choice.addEventListener('input', event => event.stopPropagation());
    choice.addEventListener('change', event => {
      event.stopPropagation(); // Navigation is not a card edit and must not trigger autosave.
      if (choice.value === activePane()) return;
      void selectPane(choice.value, choice).finally(position);
    });
    panes.append(choice);
    for (const pane of ["board", "history", "comments"]) {
      const button = actions.querySelector(`[data-feature="task-${pane}"]`);
      button.dataset.editorPane = pane;
      panes.append(button);
    }
    actions.prepend(panes);
  }
  // Beside the details, the open pane's name heads its column on the title's line (F0.23-12); the pane's
  // own heading stays for screen readers.
  const paneTitle = existing ? document.createElement("span") : null;
  if (paneTitle) {
    paneTitle.className = "task-pane-title";
    paneTitle.setAttribute("aria-hidden", "true");
    heading.querySelector(".task-title-row")?.prepend(paneTitle);
  }
  // Duplicate, archive and delete form one group before the close button.
  const more = document.createElement("div");
  more.className = "task-secondary-actions";
  more.setAttribute("role", "group");
  more.setAttribute("aria-label", "Manage card");
  if (existing) {
    more.append(actions.querySelector('[data-feature="task-duplicate"]'), actions.querySelector('[data-feature="task-archive"]'), actions.querySelector('[data-action="task-delete"]'));
    actions.append(more);
  }
  const phone = () => innerWidth <= 600;
  // The card's board (F0.21-76) is its details over the whole app, so it is a page like the phone's.
  const paged = () => phone() || dialog.classList.contains("card-board");
  const activePane = () => dialog.classList.contains('with-task-comments') ? 'comments' : dialog.classList.contains('with-task-history') ? 'history' : dialog.classList.contains('card-board') ? 'board' : 'details';
  const releaseScroll = containPanelScroll(dialog, target => {
    if (phone()) return dialog.querySelector("#task-form");
    const own = target?.closest('.task-comments-panel, .task-history-panel');
    if (own) return own;
    const pane = dialog.dataset.paneLayout === 'compact' && !['details', 'board'].includes(activePane()) ? activePane() === 'comments' ? '.task-comments-panel' : '.task-history-panel' : '.task-editor-content > .dialog-body';
    return dialog.querySelector(pane);
  });
  let releasePage = null;
  function updatePageMode() {
    dialog.classList.toggle("task-editor-page", phone());
    if (paged() === !!releasePage) return;
    dialog.setAttribute("aria-modal", String(paged()));
    if (!paged()) {
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
  function updatePanes(split) {
    const pane = activePane();
    const auxiliary = !split && !['details', 'board'].includes(pane);
    dialog.querySelector(".task-editor-content > .dialog-body").hidden = auxiliary;
    dialog.querySelector(".task-editor-foot").hidden = auxiliary;
    for (const button of panes.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.editorPane === pane));
    const choice = panes.querySelector('select');
    if (choice) choice.value = pane;
    if (paneTitle) paneTitle.textContent = split && pane === 'comments' ? 'Comments' : split && pane === 'history' ? 'Versions' : '';
  }
  function position() {
    if (!dialog.isConnected) return;
    updatePageMode();
    const surface = onBoard ? $("#canvas") : $("#view-content") || $(".help-page");
    const r = surface?.getBoundingClientRect();
    const besideTools = onBoard && r?.width > 600;
    const available = docked
      ? Math.min(innerWidth - 24, innerWidth - Math.max(0, $(".main")?.getBoundingClientRect().left || 0) - 24)
      : Math.min(innerWidth - 24, (r?.width || innerWidth) - (besideTools ? 90 : 24));
    const split = existing && !phone() && available >= 904;
    if (dialog.dataset.paneLayout !== (split ? 'split' : 'compact')) dialog.dataset.paneLayout = split ? 'split' : 'compact';
    updatePanes(split);
    const auxiliary = split && activePane() !== 'details' ? 280 : 0;
    dialog.querySelector('.task-panel-resizer')?.setAttribute('aria-valuemin', auxiliary ? '620' : '360');
    if (paged()) {
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
      const width = Math.min(
        Math.max(panelWidth, auxiliary ? 620 : 0) + auxiliary,
        available,
      );
      // The handle reports the width shown, which the window may hold below the one chosen.
      dialog.querySelector('.task-panel-resizer')?.setAttribute('aria-valuenow', String(Math.round(width - auxiliary)));
      Object.assign(dialog.style, {
        left: `${innerWidth - width - (innerWidth <= 600 ? 0 : 12)}px`,
        top: `${visibleTop + 12}px`,
        width: `${width}px`,
        height: `${Math.max(1, visibleHeight - 24)}px`,
      });
      return;
    }
    // Creation shares the compact board panel in every project view.
    if (!surface) return;
    const width = Math.min(
      680 + auxiliary,
      available,
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
    grip.setAttribute("aria-label", "Resize card panel");
    grip.setAttribute("aria-orientation", "vertical");
    const resize = (width) => {
      const minimum = dialog.dataset.paneLayout === 'split' && activePane() !== 'details' ? 620 : 360;
      panelWidth = Math.max(minimum, Math.min(1170, width));
      position();
    };
    grip.setAttribute("aria-valuemin", "360");
    grip.setAttribute("aria-valuemax", "1170");
    grip.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
    });
    grip.addEventListener("pointermove", (event) => {
      if (grip.hasPointerCapture(event.pointerId))
        resize(innerWidth - event.clientX - 12 - (dialog.dataset.paneLayout === 'split' && activePane() !== 'details' ? 280 : 0));
    });
    grip.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      resize(Number(grip.getAttribute("aria-valuenow")) + (event.key === "ArrowLeft" ? 20 : -20));
    });
    dialog.prepend(grip);
    position();
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
