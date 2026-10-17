import { pageOf } from "./task-visibility.js";
const DAY = 86400000;
export const shiftDate = (date, days) =>
  new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
export function timelineHTML(tasks, ctx, scale = "week", scope = "project") {
  const { esc } = ctx,
    allDated = tasks.filter((t) => t.start || t.due),
    pageKey = `${ctx.state?.project?.id || ""}/${scope}`,
    page = pageOf(allDated, ctx.state?.timelinePages?.[pageKey], 200),
    dated = page.items,
    undated = tasks.filter((t) => !t.start && !t.due),
    stamps = allDated.flatMap((t) =>
      [t.start, t.due].filter(Boolean).map(Date.parse),
    );
  const min = stamps.length
      ? Math.min(...stamps)
      : Date.parse(new Date().toISOString().slice(0, 10)),
    max = stamps.length ? Math.max(...stamps) : min;
  const span = Math.max(14, Math.ceil((max - min) / DAY) + 4),
    unit = scale === "day" ? 42 : scale === "month" ? 4 : 16,
    width = Math.max(700, span * unit),
    step = scale === "day" ? 1 : scale === "month" ? 30 : 7;
  const x = (date) => ((Date.parse(date) - min) / DAY) * unit;
  const positions = new Map(dated.map((t, i) => [t.id, i]));
  const lines = dated
    .flatMap((t, i) =>
      (t.dependencies || []).map((id) => {
        const from = positions.get(id);
        if (from == null) return "";
        const a = dated[from],
          sx = x(a.due || a.start) + unit,
          tx = x(t.start || t.due),
          y = from * 44 + 22,
          ty = i * 44 + 22;
        return `<path d="M${sx},${y} H${sx + 10} V${ty} H${tx}"/>`;
      }),
    )
    .join("");
  const pager = `<div class="timeline-page-summary" role="status">${dated.length} of ${allDated.length} dated tasks on this page${page.pages > 1 ? ` · Page ${page.page + 1} of ${page.pages} <button class="button small" data-timeline-page="${page.page - 1}" ${!page.page ? "disabled" : ""}>Previous tasks</button><button class="button small" data-timeline-page="${page.page + 1}" ${page.page + 1 >= page.pages ? "disabled" : ""}>Next tasks</button> · Arrows connect tasks on this page.` : ""}</div>`;
  return `<section class="task-timeline" data-timeline="${esc(scope)}" data-min="${min}" data-unit="${unit}"><div class="planning-head"><label>Scale <select data-timeline-scale aria-label="Timeline scale">${["day", "week", "month"].map((s) => `<option ${scale === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><span>Drag bars to move dates; drag either end to resize. Other tasks stay in place.</span><button type="button" class="button small" data-feature="schedule-preview">Review schedule</button></div>${pager}<div class="timeline-scroll"><div class="timeline-sheet" style="width:${width + 240}px"><div class="timeline-ruler" style="margin-left:240px;width:${width}px">${Array.from({ length: Math.ceil(span / step) }, (_, i) => `<span style="left:${i * step * unit}px">${esc(new Date(min + i * step * DAY).toISOString().slice(0, 10))}</span>`).join("")}</div><svg class="timeline-dependencies" width="${width}" height="${dated.length * 44}" style="left:240px;top:32px" aria-label="Task dependencies">${lines}</svg>${dated.map((t) => `<div class="timeline-row"><button data-action="task-open" data-id="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button><div class="timeline-track" style="width:${width}px" data-schedule-target><div tabindex="0" role="slider" aria-label="Schedule ${esc(t.title)}" aria-valuetext="${esc(t.start || t.due)} to ${esc(t.due || t.start)}" class="timeline-bar ${t.milestone ? "milestone" : ""}" data-timeline-task="${esc(t.id)}" title="${esc(t.start || t.due)} to ${esc(t.due || t.start)} · Alt+arrows moves by a day" style="left:${x(t.start || t.due)}px;width:${Math.max(12, x(t.due || t.start) - x(t.start || t.due) + unit)}px"><span data-date-end="start" role="separator" aria-label="Resize start date"></span>${esc(t.title)}<span data-date-end="due" role="separator" aria-label="Resize due date"></span></div><button class="milestone-toggle" data-milestone="${esc(t.id)}" aria-pressed="${!!t.milestone}" title="Toggle milestone">◇</button></div></div>`).join("")}${!dated.length ? `<div class="timeline-empty-track" data-schedule-target style="margin-left:240px;width:${width}px;height:100px">Drop an unscheduled task here</div>` : ""}</div></div><div class="timeline-unscheduled"><strong>Unscheduled (${undated.length})</strong>${undated.map((t) => `<button draggable="true" data-unscheduled="${esc(t.id)}" data-action="task-open" data-id="${esc(t.id)}">${esc(t.key || "")} ${esc(t.title)}</button>`).join("")}</div></section>`;
}
export function timelineInteractions(ctx, onScale) {
  const { state, patchTask, task, renderView, toast } = ctx;
  let drag = null,
    unscheduled = null,
    suppress = false;
  const stop = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target.closest("[data-timeline-task]");
      if (!el || e.button !== 0) return;
      stop(e);
      const root = el.closest("[data-timeline]"),
        t = task(el.dataset.timelineTask);
      drag = {
        pointer: e.pointerId,
        capture: root,
        el,
        t,
        start: t.start || t.due,
        due: t.due || t.start,
        x: e.clientX,
        unit:
          +root.dataset.unit *
          (root.closest(".board-node") ? state.camera.z : 1),
        end: e.target.dataset.dateEnd,
        moved: false,
      };
      state.toolDragging = true;
      root.setPointerCapture(e.pointerId);
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      stop(e);
      const d = drag,
        delta = Math.round((e.clientX - d.x) / d.unit);
      d.moved ||= Math.abs(e.clientX - d.x) > 3;
      d.next = {
        start: d.end === "due" ? d.start : shiftDate(d.start, delta),
        due: d.end === "start" ? d.due : shiftDate(d.due, delta),
      };
      if (d.next.start > d.next.due) {
        if (d.end === "start") d.next.start = d.next.due;
        else d.next.due = d.next.start;
      }
      d.el.textContent = `${d.next.start} → ${d.next.due}`;
      d.el.style.width = `${Math.max(12, (((Date.parse(d.next.due) - Date.parse(d.next.start)) / DAY + 1) * d.unit) / (d.el.closest(".board-node") ? state.camera.z : 1))}px`;
      d.el.style.transform = `translateX(${d.end === "due" ? 0 : (((Date.parse(d.next.start) - Date.parse(d.start)) / DAY) * d.unit) / (d.el.closest(".board-node") ? state.camera.z : 1)}px)`;
    },
    true,
  );
  async function finish(e, cancel = false) {
    if (!drag || (e?.pointerId != null && e.pointerId !== drag.pointer)) return;
    e?.stopImmediatePropagation();
    const d = drag;
    drag = null;
    state.toolDragging = false;
    if (d.capture?.hasPointerCapture(d.pointer))
      d.capture.releasePointerCapture(d.pointer);
    suppress = d.moved;
    setTimeout(() => (suppress = false), 0);
    try {
      if (!cancel && d.moved && d.next) await patchTask(d.t.id, d.next);
      else renderView(true);
    } catch (err) {
      toast(err.message, true);
    }
  }
  document.addEventListener("pointerup", (e) => finish(e), true);
  document.addEventListener("pointercancel", (e) => finish(e, true), true);
  window.addEventListener("blur", () => finish(null, true));
  document.addEventListener(
    "keydown",
    (e) => {
      if (drag && e.key === "Escape") {
        stop(e);
        finish(null, true);
      }
      const el = e.target.closest("[data-timeline-task]");
      if (el && e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        stop(e);
        const t = task(el.dataset.timelineTask),
          d = e.key === "ArrowLeft" ? -1 : 1;
        patchTask(t.id, {
          start: shiftDate(t.start || t.due, d),
          due: shiftDate(t.due || t.start, d),
        }).catch((err) => toast(err.message, true));
      }
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (suppress) {
        stop(e);
        return;
      }
      const paging = e.target.closest("[data-timeline-page]");
      if (paging) {
        stop(e);
        state.timelinePages ||= {};
        state.timelinePages[
          `${state.project.id}/${paging.closest("[data-timeline]").dataset.timeline}`
        ] = Number(paging.dataset.timelinePage);
        renderView(true);
        return;
      }
      const id = e.target.closest("[data-milestone]")?.dataset.milestone;
      if (id) {
        stop(e);
        patchTask(id, { milestone: !task(id).milestone }).catch((err) =>
          toast(err.message, true),
        );
      }
    },
    true,
  );
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-timeline-scale]"))
      onScale(
        e.target.closest("[data-timeline]").dataset.timeline,
        e.target.value,
      );
  });
  document.addEventListener(
    "dragstart",
    (e) => {
      const n = e.target.closest("[data-unscheduled]");
      if (!n) return;
      unscheduled = n.dataset.unscheduled;
      e.dataTransfer.setData("text/x-pencils-task", unscheduled);
      e.stopImmediatePropagation();
    },
    true,
  );
  document.addEventListener(
    "dragover",
    (e) => {
      if (unscheduled && e.target.closest("[data-schedule-target]")) stop(e);
    },
    true,
  );
  document.addEventListener(
    "drop",
    (e) => {
      const track = e.target.closest("[data-schedule-target]");
      if (!track || !unscheduled) return;
      stop(e);
      const root = track.closest("[data-timeline]"),
        r = track.getBoundingClientRect(),
        z = root.closest(".board-node") ? state.camera.z : 1,
        date = new Date(
          +root.dataset.min +
            Math.max(
              0,
              Math.floor((e.clientX - r.left) / (+root.dataset.unit * z)),
            ) *
              DAY,
        )
          .toISOString()
          .slice(0, 10);
      patchTask(unscheduled, { start: date, due: date }).catch((err) =>
        toast(err.message, true),
      );
      unscheduled = null;
    },
    true,
  );
  document.addEventListener("dragend", () => (unscheduled = null));
}
