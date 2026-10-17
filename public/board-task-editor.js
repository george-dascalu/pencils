// One task panel for every project view; the board anchors it beside its tools.
let panelWidth = 560;
export function boardTaskEditor(
  dialog,
  { $, state, closeDialog, renderView, icon },
) {
  dialog.classList.add("board-task-editor");
  const onBoard = ["board", "drawing"].includes(state.view);
  dialog.classList.toggle("project-task-editor", !onBoard);
  const existing = !!dialog.querySelector("#task-form")?.dataset.id;
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
  heading.className = "board-task-editor-heading";
  heading.innerHTML = `<button type="button" class="icon-button" data-task-list-back aria-label="Back to project tasks">${icon("arrow")}</button><strong>New task</strong>`;
  if (draft)
    heading.querySelector("strong").textContent =
      draft === "new" ? "New draft task" : "Draft task";
  else if (existing)
    heading.querySelector("strong").textContent = taskKey || "Task";
  const actions = dialog.querySelector(".task-editor-actions");
  if (actions) heading.append(actions);
  heading.append(close);
  dialog.querySelector("#task-form").prepend(heading);
  dialog.querySelector(".task-key")?.remove();
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
  function position() {
    const canvas = $("#canvas");
    if (!dialog.isConnected) return;
    if (!onBoard) {
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
        left: `${innerWidth - width - auxiliary - (innerWidth <= 600 ? 0 : 12)}px`,
        top: innerWidth <= 600 ? "0px" : "12px",
        width: `${width}px`,
        height: `${innerHeight - (innerWidth <= 600 ? 0 : 24)}px`,
      });
      return;
    }
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const width = Math.min(
      400,
      innerWidth - 24,
      r.width - (r.width > 600 ? 90 : 24),
    );
    const left = Math.max(
      12,
      Math.min(r.left + (r.width > 600 ? 76 : 12), innerWidth - width - 12),
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
  if (!onBoard) {
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
      $('[data-action="board-task"]')?.focus();
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
