import { positionPopover } from "./popover-position.js";

// Compact task scheduling uses the same date fields/calendar as every task form.
export function taskDateEditor(ctx) {
  const { state, task, esc, icon, patchTask } = ctx;
  let active = null,
    frame;
  function close(focus = false) {
    if (!active) return;
    const current = active;
    // Capture a typed date before removing the focused input (and its blur event).
    void current.save();
    active = null;
    cancelAnimationFrame(frame);
    const trigger = current.anchor();
    trigger?.setAttribute("aria-expanded", "false");
    trigger?.removeAttribute("aria-controls");
    current.panel.remove();
    if (focus) trigger?.focus({ preventScroll: true });
  }
  function position() {
    if (!active) return;
    const trigger = active.anchor();
    if (
      state.project?.id !== active.project ||
      !task(active.id) ||
      !trigger?.isConnected
    ) {
      close();
      return;
    }
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", active.panel.id);
    positionPopover(active.panel, trigger.getBoundingClientRect(), {
      width: 320,
      maxHeight: 420,
      gap: 6,
    });
    frame = requestAnimationFrame(position);
  }
  function open(id, anchor, { chooseOnTimeline } = {}) {
    close();
    const value = task(id);
    if (!value) return;
    const panel = document.createElement("div");
    panel.id = "task-dates-popover";
    panel.className = "selection-popover task-dates-popover";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", `Dates for ${value.key || ""} ${value.title}`.trim());
    const sourceDue = !!value.source;
    panel.innerHTML = `<form id="task-dates-form" novalidate>
      <header class="task-dates-actions"><h3 class="popover-title">Dates</h3>${sourceDue ? "" : '<button type="button" class="text-link" data-task-dates-clear>Clear dates</button>'}<button type="button" class="icon-button" data-task-dates-close aria-label="Close date editor">${icon("close")}</button></header>
      <label class="field">Start date<input type="date" name="start" aria-label="Start date" value="${esc(value.start || "")}"></label>
      <label class="field">Due date<input type="date" name="due" aria-label="Due date" value="${esc(value.due || "")}" ${sourceDue ? 'disabled aria-describedby="task-dates-source"' : ""}></label>
      ${sourceDue ? '<p id="task-dates-source" class="field-hint">The due date is managed by the connected source.</p>' : ""}
      ${chooseOnTimeline && !sourceDue ? '<button type="button" class="text-link" data-task-dates-pick>Choose on timeline</button>' : ""}
      <p class="form-error" role="alert" hidden></p>
    </form>`;
    document.body.append(panel);
    const current = (active = {
      panel,
      anchor,
      project: state.project.id,
      id,
      pending: 0,
      generation: 0,
    });
    anchor()?.setAttribute("aria-expanded", "true");
    anchor()?.setAttribute("aria-controls", panel.id);
    panel.showPopover();
    const form = panel.querySelector("form");
    const start = form.elements.start,
      due = form.elements.due;
    const error = panel.querySelector(".form-error");
    const url = ctx.route?.("tasks", id);
    const values = () => ({
      start: start.value || null,
      ...(!sourceDue ? { due: due.value || null } : {}),
    });
    let lastValues = JSON.stringify(values());
    function limits() {
      start.max = due.value;
      due.min = start.value;
      error.hidden = true;
    }
    form.addEventListener("input", (event) => {
      if (event.target === start || event.target === due) limits();
    });
    form.addEventListener("change", (event) => {
      if (event.target !== start && event.target !== due) return;
      limits();
      void current.save();
    });
    current.save = async () => {
      if (active !== current || state.project?.id !== current.project) return;
      if (start.value && due.value && start.value > due.value) {
        error.textContent = "Due date must be on or after the start date.";
        error.hidden = false;
        return;
      }
      if (!form.checkValidity()) {
        error.textContent = "Enter a valid date.";
        error.hidden = false;
        return;
      }
      const changes = values(), signature = JSON.stringify(changes);
      if (signature === lastValues) return;
      lastValues = signature;
      const generation = ++current.generation;
      current.pending++;
      form.setAttribute("aria-busy", "true");
      error.hidden = true;
      try {
        // The shared durable queue merges edits made while a request is in flight.
        await patchTask(id, changes);
        const pending = ctx.sync?.entries.get(url);
        if (pending?.blocked || pending?.conflict)
          throw new Error(
            pending.error || "The date changes need review in Recovery.",
          );
      } catch (failure) {
        if (generation !== current.generation) return;
        lastValues = null;
        if (active === current) {
          error.textContent = failure.message;
          error.hidden = false;
        } else ctx.toast?.(failure.message, true);
      } finally {
        if (!--current.pending) form.removeAttribute("aria-busy");
      }
    };
    limits();
    position();
    // Avoid summoning a keyboard just to inspect dates on touch devices.
    (matchMedia("(pointer: coarse)").matches
      ? panel.querySelector("[data-task-dates-close]")
      : start
    ).focus({ preventScroll: true });
    panel
      .querySelector("[data-task-dates-close]")
      .addEventListener("click", () => close(true));
    panel
      .querySelector("[data-task-dates-clear]")
      ?.addEventListener("click", () => {
        start.value = due.value = "";
        limits();
        void current.save();
        start.focus({ preventScroll: true });
      });
    panel.querySelector("[data-task-dates-pick]")?.addEventListener("click", () => {
      close();
      chooseOnTimeline();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void current.save();
    });
  }
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (active && !active.panel.contains(event.target)) close();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (!active || !active.panel.contains(event.target)) return;
      // Calendars and select menus handle their keys first; board shortcuts must not run here.
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    },
    true,
  );
  return { open, close };
}
