// One task panel for every project view; the board anchors it beside its tools.
let panelWidth = 720;
export function boardTaskEditor(
  dialog,
  { $, state, closeDialog, renderView, icon },
) {
  dialog.classList.add("board-task-editor");
  const onBoard = ["board", "drawing"].includes(state.view);
  const existing = !!dialog.querySelector("#task-form")?.dataset.id;
  const docked = !onBoard && existing;
  dialog.classList.toggle("project-task-editor", docked);
  const draft = dialog.querySelector("#task-form")?.dataset.draftNode;
  const taskKey = dialog.querySelector(".task-key")?.textContent;
  dialog.setAttribute(
    "aria-label",
    draft ? "Draft task" : existing ? "Edit project task" : "New project task",
  );
  dialog.setAttribute("aria-modal", "false");
  const close = dialog.querySelector('[data-action="dialog-close"]');
  close.setAttribute("aria-label", existing ? "Close task" : "Close new task");
  const heading = document.createElement("header");
  heading.className = "board-task-editor-heading dialog-head task-editor-head";
  heading.innerHTML = `<button type="button" class="icon-button" data-task-list-back aria-label="Back to project tasks">${icon("arrow")}</button><strong class="sr-only">New task</strong>`;
  if (draft)
    heading.querySelector("strong").textContent =
      draft === "new" ? "New draft task" : "Draft task";
  else if (existing)
    heading.querySelector("strong").textContent = taskKey || "Task";
  const oldHead = dialog.querySelector(".task-editor-head");
  heading.append(dialog.querySelector(".task-identity-row"));
  const actions = dialog.querySelector(".task-editor-actions");
  if (actions) heading.append(actions);
  heading.append(close);
  dialog.querySelector("#task-form").prepend(heading);
  oldHead.remove();
  dialog.querySelector(".form-status")?.remove();
  const back = () => {
    if (!closeDialog(false, { confirmDirty: false })) return;
    state.boardTaskPanel = true;
    renderView();
    $("#board-task-search")?.focus({ preventScroll: true });
  };
  const backButton = heading.querySelector("[data-task-list-back]");
  if (onBoard) backButton.addEventListener("click", back);
  else backButton.remove();
  const panes = document.createElement("div");
  panes.className = "task-mobile-panes";
  panes.setAttribute("role", "group");
  panes.setAttribute("aria-label", "Task panel");
  if (existing) {
    panes.innerHTML = ["details", "comments", "history"].map(pane => `<button type="button" class="button small" data-editor-pane="${pane}" aria-pressed="${pane === "details"}">${pane[0].toUpperCase() + pane.slice(1)}</button>`).join("");
    heading.after(panes);
    panes.addEventListener("click", event => {
      const pane = event.target.closest("[data-editor-pane]")?.dataset.editorPane;
      if (!pane) return;
      if (pane === "details") {
        dialog.querySelector("[data-comments-close]")?.click();
        if (dialog.classList.contains("with-task-history")) dialog.querySelector('[data-task-modal="history-close"]')?.click();
      } else heading.querySelector(`[data-feature="task-${pane}"]`)?.click();
    });
  }
  function updatePanes() {
    const pane = dialog.classList.contains("with-task-comments") ? "comments" : dialog.classList.contains("with-task-history") ? "history" : "details";
    const auxiliary = innerWidth < 1100 && pane !== "details";
    dialog.querySelector(".task-editor-content > .dialog-body").hidden = auxiliary;
    dialog.querySelector(".task-editor-foot").hidden = auxiliary;
    for (const button of panes.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.editorPane === pane));
  }
  function position() {
    if (!dialog.isConnected) return;
    updatePanes();
    if (docked) {
      const auxiliary =
        innerWidth >= 1100 &&
        dialog.matches(".with-task-history,.with-task-comments")
          ? 312
          : 0;
      const width = Math.min(
        panelWidth,
        innerWidth - auxiliary - (innerWidth <= 600 ? 0 : 24),
      );
      Object.assign(dialog.style, {
        left: `${innerWidth - width - (innerWidth <= 600 ? 0 : 12)}px`,
        top: innerWidth <= 600 ? "0px" : "12px",
        width: `${width}px`,
        height: `${innerHeight - (innerWidth <= 600 ? 0 : 24)}px`,
      });
      return;
    }
    // Creation shares the compact board panel in every project view.
    const surface = onBoard ? $("#canvas") : $("#view-content");
    if (!surface) return;
    const r = surface.getBoundingClientRect();
    const besideTools = onBoard && r.width > 600;
    const width = Math.min(
      400,
      innerWidth - 24,
      r.width - (besideTools ? 90 : 24),
    );
    const left = Math.max(
      12,
      Math.min(r.left + (besideTools ? 76 : 12), innerWidth - width - 12),
    );
    const top = Math.max(8, Math.min(r.top + 18, innerHeight - 240));
    Object.assign(dialog.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${Math.max(200, Math.min(760, innerHeight - top - 16, r.bottom - top - 16))}px`,
    });
  }
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
  window.addEventListener("resize", position);
  document.addEventListener("scroll", position, true);
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
      observer.disconnect();
      classes.disconnect();
      dialog.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    },
  };
}
