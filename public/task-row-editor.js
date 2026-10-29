import { taskDateEditor } from "./task-date-editor.js";

// List and Tree use the same controls, save queue and contextual date editor.
export function taskRowEditor(ctx) {
  const { state, task, patchTask, renderView, sync, route, toast } = ctx;
  const selector = ".task-row [data-row-field]";
  let paintTimer,
    pointerActive = false;
  document.addEventListener(
    "pointerdown",
    () => {
      pointerActive = true;
    },
    true,
  );
  for (const event of ["pointerup", "pointercancel"])
    document.addEventListener(
      event,
      () => {
        pointerActive = false;
      },
      true,
    );
  window.addEventListener("blur", () => {
    pointerActive = false;
  });
  function repaint(project, view) {
    clearTimeout(paintTimer);
    if (state.project?.id !== project || state.view !== view) return;
    const active = document.activeElement;
    // Let open menus and unfinished text edits keep their DOM and focus.
    if (
      pointerActive ||
      state.dialog ||
      document.querySelector("#shared-select-menu, #task-dates-popover") ||
      (active?.matches("input, textarea, select, [contenteditable=true]") &&
        (!active.matches(selector) ||
          (active.dataset.rowField === "title" &&
            active.value !== task(active.dataset.id)?.title)))
    ) {
      paintTimer = setTimeout(() => repaint(project, view), 100);
      return;
    }
    const row = active?.closest("[data-task-order-row]");
    const id = row?.dataset.taskOrderRow;
    const field = active?.dataset.rowField;
    const scroll =
      document.querySelector("#view-content > .tree-wrapper") ||
      document.querySelector("#view-content");
    const position = { left: scroll.scrollLeft, top: scroll.scrollTop };
    const selection =
      field === "title" ? [active.selectionStart, active.selectionEnd] : null;
    renderView(true);
    const currentScroll =
      document.querySelector("#view-content > .tree-wrapper") ||
      document.querySelector("#view-content");
    currentScroll.scrollTo(position);
    if (!id) return;
    const current = document.querySelector(
      `[data-task-order-row="${CSS.escape(id)}"]`,
    );
    const next = [...(current?.querySelectorAll(
      field
        ? `[data-row-field="${field}"]`
        : active.matches("[data-row-dates]")
          ? "[data-row-dates]"
          : active.dataset.taskReorder
            ? "[data-task-reorder]"
            : active.dataset.action
              ? `[data-action="${CSS.escape(active.dataset.action)}"]`
              : ".phone-task-open, .task-id",
    ) || [])].find(el => el.getClientRects().length && !el.closest("[inert]"));
    if (next) {
      next.focus({ preventScroll: true });
      if (selection) next.setSelectionRange(...selection);
    } else
      [...document.querySelectorAll("#view-content .phone-task-open, #view-content .task-row > .task-id, [data-action=task-new]")]
        .find(el => el.getClientRects().length && !el.closest("[inert]"))?.focus({ preventScroll: true });
  }
  function schedulePaint(project, view) {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(() => repaint(project, view), 0);
  }
  async function save(id, changes) {
    const project = state.project.id,
      view = state.view;
    const pending = patchTask(id, changes, false);
    schedulePaint(project, view);
    await pending;
    if (state.project?.id !== project) return;
    schedulePaint(project, view);
    const entry = sync.entries.get(route("tasks", id));
    if (entry?.blocked || entry?.conflict)
      toast(
        entry.error || "Edit retained. Open Recovery to review pending saves.",
        true,
      );
  }
  const dates = taskDateEditor({ ...ctx, patchTask: save });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-row-dates]");
    if (!button) return;
    const id = button.dataset.rowDates;
    dates.open(id, () =>
      document.querySelector(`[data-row-dates="${CSS.escape(id)}"]`),
    );
  });
  async function commit(input) {
    const { id, rowField: field } = input.dataset;
    const value = field === "title" ? input.value.trim() : input.value;
    const current = task(id);
    if (!current || current.source || input.readOnly || input.disabled) return;
    if (field === "title") {
      input.setCustomValidity(value ? "" : "Enter a task title.");
      if (!input.reportValidity()) {
        input.setAttribute("aria-invalid", "true");
        return;
      }
      input.value = value;
    }
    if (current[field] === value) return;
    try {
      await save(id, { [field]: value });
    } catch (error) {
      toast(error.message, true);
      input.setAttribute("aria-invalid", "true");
    }
  }
  document.addEventListener("change", (event) => {
    if (event.target.matches(selector)) void commit(event.target);
  });
  document.addEventListener("input", (event) => {
    if (!event.target.matches(`${selector}[data-row-field=title]`)) return;
    event.target.setCustomValidity("");
    event.target.removeAttribute("aria-invalid");
  });
  document.addEventListener("keydown", (event) => {
    const input = event.target;
    if (
      !input.matches(`${selector}[data-row-field=title]`) ||
      event.isComposing
    )
      return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void commit(input);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      input.value = task(input.dataset.id)?.title || "";
      input.setCustomValidity("");
      input.removeAttribute("aria-invalid");
      input.blur();
    }
  });
}
