import { positionPopover } from "./popover-position.js";
import { validTimelineRange, dateKey } from "./timeline-dates.js";
import { rangeChoicesHTML } from "./range-menu.js";
import { formatDay } from "./format-date.js";

// Quick ranges (keys in TIMELINE_QUICK, timeline-dates.js) after All cards, which fits the cards' dates.
const RANGES = [["auto", "All cards"], ["this-week", "This week"], ["next-week", "Next week"], ["this-month", "This month"], ["next-month", "Next month"], ["next-7", "Next 7 days"], ["next-14", "Next 14 days"], ["next-30", "Next 30 days"], ["next-90", "Next 90 days"]];
const quickKey = (choice, range) => (!range ? "auto" : choice?.quick || "");
export const timelineRangeName = (choice, range) =>
  RANGES.find(([key]) => key === quickKey(choice, range))?.[1] || `${formatDay(range.start)} – ${formatDay(range.end)}`;

export function timelineRoot(trigger) {
  const host = trigger.closest("[data-timeline-options], [data-timeline]");
  const scope = host?.dataset.timelineOptions || host?.dataset.timeline;
  return scope && document.querySelector(`.task-timeline[data-timeline="${CSS.escape(scope)}"]`);
}

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
    positionPopover(active.panel, trigger.getBoundingClientRect(), { width: 420, maxHeight: 640, gap: 6 });
    frame = requestAnimationFrame(position);
  }
  function open(trigger) {
    // The range button opens and closes it, like Agenda's menu.
    if (active?.anchor() === trigger) return close(true);
    close();
    const root = timelineRoot(trigger), scope = root.dataset.timeline;
    const anchor = () => document.querySelector(`[data-timeline-options="${CSS.escape(scope)}"] [data-timeline-range]`);
    const panel = document.createElement("div");
    panel.id = "timeline-range-popover";
    panel.className = "selection-popover range-popover range-panel";
    panel.setAttribute("popover", "manual");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", "Timeline range");
    const quick = root.dataset.rangeEnd ? root.dataset.rangeChoice : "auto";
    panel.innerHTML = rangeChoicesHTML({ name: "timeline", from: root.dataset.rangeStart || dateKey(+root.dataset.min), to: root.dataset.rangeEnd || root.dataset.autoEnd, quick, ranges: RANGES, esc: ctx.esc });
    document.body.append(panel);
    const current = active = { panel, anchor, project: ctx.state.project.id, saving: false };
    trigger.setAttribute("aria-expanded", "true");
    panel.showPopover(); position();
    const form = panel.querySelector("form"), start = form.elements.from, end = form.elements.to, error = panel.querySelector("[data-range-error]");
    const limits = () => { start.max = end.value; end.min = start.value; error.hidden = true; };
    form.addEventListener("input", limits); form.addEventListener("change", limits); limits();
    async function apply(value) {
      if (current.saving) return;
      current.saving = true;
      try { await onOption(scope, "range", value); if (active === current) close(true); }
      catch (failure) { error.textContent = failure.message; error.hidden = false; }
      finally { current.saving = false; }
    }
    panel.querySelector(".range-quick").addEventListener("click", event => {
      const key = event.target.closest("[data-range-quick]")?.dataset.rangeQuick;
      if (key) void apply(key === "auto" ? null : { quick: key });
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const value = { start: start.value, end: end.value };
      if (!validTimelineRange(value)) {
        error.textContent = !value.start || !value.end ? "Choose both dates." : value.start > value.end ? "Choose a From date on or before the To date." : "Choose a valid range of ten years or less.";
        error.hidden = false; return;
      }
      void apply(value);
    });
    (panel.querySelector('[data-range-quick][aria-pressed="true"]') || panel.querySelector("[data-range-quick]")).focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", event => { if (active && !active.panel.contains(event.target) && !active.anchor()?.contains(event.target)) close(); }, true);
  document.addEventListener("keydown", event => {
    if (!active?.panel.contains(event.target)) return;
    event.stopImmediatePropagation();
    if (event.key === "Escape") { event.preventDefault(); close(true); }
  }, true);
  return { open, close };
}
