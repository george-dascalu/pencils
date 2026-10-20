import { timelineAxis, timelineBarBounds, dateKey } from "./timeline-dates.js";

// Row scheduling uses the same date axis as bars, including weekend compression
// and board zoom. Nothing is saved until the second click/tap or Enter.
export function timelineSelection(ctx, closeEditors) {
  const { state, task, patchTask, toast } = ctx;
  let selection = null, press = null, saving = false;
  const axes = root => timelineAxis(+root.dataset.min, +root.dataset.unit, root.dataset.weekends !== "false");
  const range = root => root.dataset.rangeEnd ? { start: root.dataset.rangeStart, end: root.dataset.rangeEnd } : null;
  const rowTask = track => task(track.closest("[data-timeline-row]")?.dataset.timelineRow);
  const stop = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const eligible = (track, target) => track && !rowTask(track)?.source &&
    (!target.closest("button,[data-timeline-task]") || selection?.track === track && target.closest("[data-timeline-task]"));
  function message(text) {
    if (!selection) return;
    selection.hint.textContent = text;
  }
  function clear() {
    if (selection) {
      selection.preview.remove(); selection.track.classList.remove("timeline-picking");
      selection.hint.textContent = selection.originalHint;
    }
    selection = null; press = null;
    if (!saving) state.timelineSelecting = false;
  }
  function refresh() { if (selection && !selection.track.isConnected) clear(); }
  function dateAt(track, x) {
    const root = track.closest("[data-timeline]"), box = track.getBoundingClientRect();
    const date = axes(root).dateAt(Math.max(0, x - box.left) * track.clientWidth / box.width);
    const bounds = range(root);
    return bounds && (date < bounds.start || date > bounds.end) ? null : date;
  }
  function preview(date) {
    if (!selection || !date) return;
    const s = selection;
    s.cursor = date;
    if (!s.start) return;
    const box = timelineBarBounds(axes(s.root), s.start, date < s.start ? s.start : date, s.track.clientWidth, range(s.root));
    s.preview.style.left = `${box.left}px`;
    s.preview.style.width = `${box.width}px`;
    s.preview.textContent = date < s.start ? s.start : `${s.start} → ${date}`;
    message(date < s.start ? "End date must be on or after the start. Choose another date, or press Escape." : `Start: ${s.start}. Choose the end date (${date}). Escape cancels.`);
  }
  async function choose(track, date) {
    if (!date || saving) return;
    const bounds = range(track.closest("[data-timeline]"));
    if (bounds && (date < bounds.start || date > bounds.end)) return;
    const t = rowTask(track);
    if (!t || t.source) return;
    if (!selection || selection.track !== track || !selection.start) {
      clear(); closeEditors();
      const root = track.closest("[data-timeline]"), hint = root.querySelector(".timeline-hint");
      const el = document.createElement("span"); el.className = "timeline-range-preview"; el.setAttribute("aria-hidden", "true");
      track.append(el); track.classList.add("timeline-picking");
      selection = { track, root, hint, originalHint: hint.textContent, start: date, cursor: date, preview: el, project: state.project.id };
      state.timelineSelecting = true;
      track.focus({ preventScroll: true }); preview(date); return;
    }
    if (date < selection.start) { preview(date); return; }
    const start = selection.start;
    saving = true; message("Saving dates…");
    try {
      await patchTask(t.id, { start, due: date });
      const entry = ctx.sync?.entries.get(ctx.route("tasks", t.id));
      if (entry?.blocked || entry?.conflict) throw new Error(entry.error || "The date changes need review in Recovery.");
      clear();
    } catch (error) { toast(error.message, true); clear(); }
    finally { saving = false; state.timelineSelecting = false; }
  }
  function arm(track) {
    if (!track || rowTask(track)?.source || saving) return;
    clear(); closeEditors();
    const root = track.closest("[data-timeline]"), hint = root.querySelector(".timeline-hint");
    const el = document.createElement("span"); el.className = "timeline-range-preview"; el.hidden = true;
    track.append(el); track.classList.add("timeline-picking");
    selection = { track, root, hint, originalHint: hint.textContent, start: null, cursor: axes(root).dateAt(0), preview: el, project: state.project.id };
    state.timelineSelecting = true;
    message("Click the start date, then the end date. Escape cancels.");
    track.focus({ preventScroll: true });
  }
  document.addEventListener("pointerdown", e => {
    if (press && press.pointer !== e.pointerId) { clear(); return; }
    const track = e.target.closest("[data-schedule-target]");
    if (selection && (!track || !eligible(track, e.target))) clear();
    if (track && rowTask(track)?.source && !e.target.closest("button,[data-timeline-task]")) { e.stopImmediatePropagation(); return; }
    if (e.button !== 0 || !eligible(track, e.target) || saving) return;
    e.stopImmediatePropagation();
    const scroller = track.closest(".timeline-scroll");
    press = { track, pointer: e.pointerId, x: e.clientX, y: e.clientY, scrollX: scroller.scrollLeft, scrollY: scroller.scrollTop };
    state.timelineSelecting = true;
  }, true);
  document.addEventListener("pointermove", e => {
    if (press && press.pointer === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 7) press.moved = true;
    if (!selection || selection.project !== state.project?.id || saving) return;
    if (e.target.closest("[data-schedule-target]") === selection.track) preview(dateAt(selection.track, e.clientX));
  }, true);
  document.addEventListener("pointerup", e => {
    if (!press || press.pointer !== e.pointerId) return;
    const p = press; press = null;
    e.stopImmediatePropagation();
    const scroller = p.track.closest(".timeline-scroll");
    if (p.track.isConnected && !p.moved && scroller.scrollLeft === p.scrollX && scroller.scrollTop === p.scrollY)
      void choose(p.track, dateAt(p.track, e.clientX));
    if (!selection && !saving) state.timelineSelecting = false;
  }, true);
  document.addEventListener("pointercancel", e => { if (press?.pointer === e.pointerId) { press = null; if (!selection) state.timelineSelecting = false; } }, true);
  document.addEventListener("click", e => {
    const track = e.target.closest("[data-schedule-target]");
    if (eligible(track, e.target)) stop(e);
  }, true);
  document.addEventListener("dblclick", e => { if (e.target.closest("[data-schedule-target]")) stop(e); }, true);
  document.addEventListener("keydown", e => {
    if (selection && e.key === "Escape") { stop(e); clear(); return; }
    const track = e.target.matches("[data-schedule-target]") ? e.target : null;
    if (!track || rowTask(track)?.source || saving) return;
    const root = track.closest("[data-timeline]"), axis = axes(root);
    if (["Enter", " "].includes(e.key)) {
      stop(e);
      void choose(track, selection?.track === track ? selection.cursor : axis.dateAt(0));
    } else if (selection?.track === track && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
      stop(e);
      const date = axis.shift(selection.cursor, e.key === "ArrowLeft" ? -1 : 1), bounds = range(root);
      if (date >= dateKey(+root.dataset.min) && (!bounds || date <= bounds.end)) preview(date);
    }
  }, true);
  window.addEventListener("blur", clear);
  return { clear, refresh, arm };
}
