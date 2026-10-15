// Reuse the full task form in a nonmodal panel, anchored beside the canvas tools.
export function boardTaskEditor(
  dialog,
  { $, state, closeDialog, renderView, icon },
) {
  dialog.classList.add("board-task-editor");
  const existing = !!dialog.querySelector("#task-form")?.dataset.id;
  const taskKey = dialog.querySelector(".task-key")?.textContent;
  dialog.setAttribute(
    "aria-label",
    existing ? "Edit project task" : "New project task",
  );
  dialog.setAttribute("aria-modal", "false");
  const close = dialog.querySelector('[data-action="dialog-close"]');
  close.setAttribute("aria-label", existing ? "Close task" : "Close new task");
  const heading = document.createElement("header");
  heading.className = "board-task-editor-heading";
  heading.innerHTML = `<button type="button" class="icon-button" data-task-list-back aria-label="Back to project tasks">${icon("arrow")}</button><strong>New task</strong>`;
  if (existing) heading.querySelector("strong").textContent = taskKey || "Task";
  heading.append(close);
  dialog.prepend(heading);
  dialog.querySelector(".task-key")?.remove();
  dialog.querySelector(".form-status")?.remove();
  const back = () => {
    if (!closeDialog(false, { confirmDirty: false })) return;
    state.boardTaskPanel = true;
    renderView();
    $("#board-task-search")?.focus({ preventScroll: true });
  };
  heading
    .querySelector("[data-task-list-back]")
    .addEventListener("click", back);
  function position() {
    const canvas = $("#canvas");
    if (!canvas || !dialog.isConnected) return;
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
  const observer = new ResizeObserver(position);
  observer.observe(document.querySelector(".main"));
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
      dialog.removeEventListener("keydown", keydown);
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
    },
  };
}
