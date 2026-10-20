import { positionPopover } from "./popover-position.js";
import { validTimelineRange, dateKey } from "./timeline-dates.js";

// The view range changes the displayed dates, never the tasks' own schedules.
export function timelineRangeEditor(ctx, onOption) {
  let active = null, frame;
  function close(focus = false) {
    if (!active) return;
    const { panel, anchor } = active;
    active = null;
    cancelAnimationFrame(frame);
    anchor()?.setAttribute("aria-expanded", "false");
    panel.remove();
    if (focus) anchor()?.focus({ preventScroll: true });
  }
  function position() {
    if (!active) return;
    const trigger = active.anchor();
    if (!trigger?.isConnected || ctx.state.project?.id !== active.project) return close();
    positionPopover(active.panel, trigger.getBoundingClientRect(), { width: 320, maxHeight: 440, gap: 6 });
    frame = requestAnimationFrame(position);
  }
  function open(trigger) {
    close();
    const root = trigger.closest("[data-timeline]"), scope = root.dataset.timeline;
    const anchor = () => document.querySelector(`[data-timeline="${CSS.escape(scope)}"] [data-timeline-range]`);
    const panel = document.createElement("div");
    panel.id = "timeline-range-popover";
    panel.className = "selection-popover task-dates-popover";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", "timeline-range-title");
    panel.innerHTML = `<form novalidate><header><strong id="timeline-range-title">Timeline range</strong><button type="button" class="icon-button" data-range-close aria-label="Close timeline range">${ctx.icon("close")}</button></header>
      <p class="task-dates-title">Choose which dates the timeline shows.</p>
      <label class="field">Start date<input type="date" name="start" aria-label="Timeline start date" required value="${ctx.esc(root.dataset.rangeStart || dateKey(+root.dataset.min))}"></label>
      <label class="field">End date<input type="date" name="end" aria-label="Timeline end date" required value="${ctx.esc(root.dataset.rangeEnd || root.dataset.autoEnd)}"></label>
      <p class="form-error" role="alert" hidden></p><footer><button type="button" class="text-link" data-range-auto>Automatic range</button><button type="submit" class="button primary small">Apply range</button></footer></form>`;
    document.body.append(panel);
    const current = active = { panel, anchor, project: ctx.state.project.id, saving: false };
    trigger.setAttribute("aria-expanded", "true");
    panel.showPopover(); position();
    const form = panel.querySelector("form"), start = form.elements.start, end = form.elements.end, error = panel.querySelector(".form-error");
    const limits = () => { start.max = end.value; end.min = start.value; error.hidden = true; };
    form.addEventListener("input", limits); form.addEventListener("change", limits); limits();
    panel.querySelector("[data-range-close]").addEventListener("click", () => close(true));
    async function apply(value) {
      if (current.saving) return;
      current.saving = true;
      try { await onOption(scope, "range", value); if (active === current) close(true); }
      catch (failure) { error.textContent = failure.message; error.hidden = false; }
      finally { current.saving = false; }
    }
    panel.querySelector("[data-range-auto]").addEventListener("click", () => apply(null));
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = { start: start.value, end: end.value };
      if (!validTimelineRange(value)) {
        error.textContent = !value.start || !value.end ? "Choose both dates." : value.start > value.end ? "End date must be on or after the start date." : "Choose a valid range of ten years or less.";
        error.hidden = false; return;
      }
      void apply(value);
    });
    (matchMedia("(pointer: coarse)").matches ? panel.querySelector("[data-range-close]") : start).focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", event => { if (active && !active.panel.contains(event.target)) close(); }, true);
  document.addEventListener("keydown", event => {
    if (!active?.panel.contains(event.target)) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); close(true); }
  }, true);
  return { open, close };
}
