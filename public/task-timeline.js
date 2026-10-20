import { taskFieldColor, taskColorDot } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";
import { timelineRangeEditor } from "./timeline-range.js";
import { timelineSelection } from "./timeline-select.js";
import { pageOf, localDate } from "./task-visibility.js";
import {
  DAY,
  dateKey,
  shiftDate,
  isWeekend,
  weekStart,
  timelineAxis,
  timelineHeader,
  validTimelineRange,
  timelineBarBounds,
} from "./timeline-dates.js";
export { shiftDate } from "./timeline-dates.js";
export function timelineHTML(
  tasks,
  ctx,
  scale = "week",
  scope = "project",
  showWeekends = true,
  requestedRange = null,
) {
  const { esc } = ctx;
  const range = validTimelineRange(requestedRange) ? requestedRange : null;
  const allDated = tasks.filter((t) => t.start || t.due);
  const allUndated = tasks.filter((t) => !t.start && !t.due);
  const pageKey = `${ctx.state?.project?.id || ""}/${scope}`;
  const page = pageOf(
    [...allDated, ...allUndated],
    ctx.state?.timelinePages?.[pageKey],
    200,
  );
  const dated = page.items.filter((t) => t.start || t.due);
  const undated = page.items.filter((t) => !t.start && !t.due);
  const stamps = allDated.flatMap((t) =>
    [t.start, t.due].filter(Boolean).map(Date.parse),
  );
  const min = range ? Date.parse(range.start) : weekStart(stamps.length ? Math.min(...stamps) : localDate());
  const max = range ? Date.parse(range.end) : stamps.length ? Math.max(...stamps) : min;
  const unit = scale === "day" ? 42 : scale === "month" ? 4 : 16;
  const axis = timelineAxis(min, unit, showWeekends);
  const width = range ? Math.max(unit, axis.end(max)) : Math.max(700, axis.end(max) + 4 * unit);
  const step = scale === "day" ? 1 : showWeekends ? 7 : 5;
  const x = axis.x;
  const positions = new Map(dated.map((t, i) => [t.id, i]));
  const lines = dated
    .flatMap((t, i) =>
      (t.dependencies || []).map((id) => {
        const from = positions.get(id);
        if (from == null) return "";
        const a = dated[from],
          sx = axis.end(a.due || a.start),
          tx = x(t.start || t.due);
        return `<path d="M${sx},${from * 44 + 22} H${sx + 10} V${i * 44 + 22} H${tx}"/>`;
      }),
    )
    .join("");
  const taskLabel = (t, unplanned = false) =>
    `<div class="timeline-task-label"><button class="timeline-task-open" data-action="task-open" data-id="${esc(t.id)}" title="${esc(t.key || "")} ${esc(t.title)}" ${unplanned ? `draggable="${!t.source}" data-unscheduled="${esc(t.id)}"` : ""}>${taskColorDot(ctx.state, "status", t.status)}${esc(t.key || "")} ${esc(t.title)}</button><button type="button" class="icon-button timeline-date-action ${unplanned ? "timeline-schedule" : ""}" data-task-dates="${esc(t.id)}" aria-label="${unplanned ? "Set" : "Edit"} dates for ${esc(t.title)}" title="${unplanned ? "Set" : "Edit"} dates" aria-haspopup="dialog" aria-expanded="false">${ctx.icon("calendar")}</button></div>`;
  const pager =
    page.pages > 1
      ? `<div class="timeline-page-summary" role="status">Page ${page.page + 1} of ${page.pages} · ${tasks.length} tasks<button class="button small" data-timeline-page="${page.page - 1}" ${!page.page ? "disabled" : ""}>Previous tasks</button><button class="button small" data-timeline-page="${page.page + 1}" ${page.page + 1 >= page.pages ? "disabled" : ""}>Next tasks</button></div>`
      : "";
  return `<section class="task-timeline" data-timeline="${esc(scope)}" data-min="${min}" data-unit="${unit}" data-scale="${scale}" data-weekends="${showWeekends}" data-range-start="${range?.start || ""}" data-range-end="${range?.end || ""}" data-auto-end="${axis.dateAt(width - 1)}" style="--timeline-unit:${unit}px;--timeline-step:${step * unit}px;--timeline-week:${7 * unit}px;--timeline-work:${5 * unit}px">
    <div class="planning-head"><div class="timeline-options"><label>Scale <select data-timeline-scale aria-label="Timeline scale">${["day", "week", "month"].map((s) => `<option ${scale === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="timeline-weekends"><input type="checkbox" data-timeline-weekends ${showWeekends ? "checked" : ""}>Show weekends</label><button type="button" class="button small" data-timeline-range aria-haspopup="dialog" aria-expanded="false" title="${range ? `${range.start} to ${range.end}` : "Fit dates automatically"}">${ctx.icon("calendar")}Timeline range${range ? " · Custom" : ""}</button></div><span class="timeline-hint" role="status">${range && axis.end(max) === 0 ? "No weekdays in this range. Show weekends or change the range." : "Click a row to choose start and end dates. Drag bars to move or resize."}</span><button type="button" class="button small" data-feature="schedule-preview">Review schedule</button></div>${pager}
    <div class="timeline-scroll" tabindex="0" role="region" aria-label="Project timeline"><div class="timeline-sheet" style="width:${width + 240}px">
      <div class="timeline-header"><span class="timeline-task-label">Task</span><div class="timeline-ruler"></div></div>
      <svg class="timeline-dependencies" height="${dated.length * 44}" style="left:240px;top:60px" aria-label="Task dependencies">${lines}</svg>
      ${dated.map((t) => `<div class="timeline-row" data-timeline-row="${esc(t.id)}">${taskLabel(t)}<div class="timeline-track" data-schedule-target tabindex="0" role="group" aria-label="Choose start and end dates for ${esc(t.title)}" title="Click to choose start, then click again to choose end" ${t.source ? 'aria-disabled="true"' : ""}><div tabindex="0" role="slider" aria-label="Schedule ${esc(t.title)}" aria-valuetext="${esc(t.start || t.due)} to ${esc(t.due || t.start)}" class="timeline-bar ${t.milestone ? "milestone" : ""} ${!showWeekends && axis.end(t.due || t.start) === x(t.start || t.due) ? "weekend-only" : ""}" data-timeline-task="${esc(t.id)}" title="${esc(t.start || t.due)} to ${esc(t.due || t.start)} · Click to edit dates · Alt+arrows moves by a ${showWeekends ? "day" : "weekday"}" data-task-color="status" style="--task-field-color:${taskFieldColor(ctx.state, "status", t.status)};left:${x(t.start || t.due)}px;width:${Math.max(12, axis.end(t.due || t.start) - x(t.start || t.due))}px"><span data-date-end="start" role="separator" aria-label="Resize start date"></span>${esc(t.title)}<span data-date-end="due" role="separator" aria-label="Resize due date"></span></div><span class="timeline-outside" hidden>Outside range</span><button class="milestone-toggle" data-milestone="${esc(t.id)}" aria-pressed="${!!t.milestone}" title="Toggle milestone">◇</button></div></div>`).join("")}
      ${undated.length ? `<div class="timeline-section-label">Unplanned (${allUndated.length})</div>${undated.map((t) => `<div class="timeline-row timeline-unplanned" data-timeline-row="${esc(t.id)}">${taskLabel(t, true)}<div class="timeline-track" data-schedule-target tabindex="0" role="group" aria-label="Choose start and end dates for ${esc(t.title)}" title="Click to choose start, then click again to choose end" ${t.source ? 'aria-disabled="true"' : ""}><span class="timeline-schedule-hint" aria-hidden="true">Click start, then end</span></div></div>`).join("")}` : ""}
      ${!tasks.length ? `<div class="empty"><h2>${ctx.state?.tasks?.length ? "No matching tasks" : "No tasks yet"}</h2><button class="button soft" data-action="${ctx.state?.tasks?.length ? "filters-reset" : "task-new"}">${ctx.state?.tasks?.length ? "Clear filters" : "Add a task"}</button></div>` : ""}
    </div></div></section>`;
}
export function timelineInteractions(ctx, onOption) {
  const { state, patchTask, task, renderView, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  const rangeEditor = timelineRangeEditor(ctx, onOption);
  const selection = timelineSelection(ctx, () => { dateEditor.close(); rangeEditor.close(); });
  function editDates(id, trigger) {
    const projectId = state.project.id;
    const scope = trigger.closest("[data-timeline]").dataset.timeline;
    dateEditor.open(id, () =>
      state.project?.id === projectId
        ? document.querySelector(
            `[data-timeline="${CSS.escape(scope)}"] [data-task-dates="${CSS.escape(id)}"]`,
          )
        : null,
      { chooseOnTimeline: () => selection.arm(document.querySelector(
        `[data-timeline="${CSS.escape(scope)}"] [data-timeline-row="${CSS.escape(id)}"] [data-schedule-target]`,
      )) },
    );
  }
  const resize = new ResizeObserver((entries) => {
    for (const { target: ruler } of entries) {
      const root = ruler.closest("[data-timeline]");
      let unit = +root.dataset.unit;
      const range = root.dataset.rangeEnd ? { start: root.dataset.rangeStart, end: root.dataset.rangeEnd } : null,
        showWeekends = root.dataset.weekends !== "false";
      if (range) {
        const days = timelineAxis(+root.dataset.min, 1, showWeekends).end(range.end);
        unit = ruler.clientWidth / Math.max(1, days);
        root.dataset.unit = unit;
        const step = root.dataset.scale === "day" ? 1 : showWeekends ? 7 : 5;
        for (const [key, value] of Object.entries({ unit, step: step * unit, week: 7 * unit, work: 5 * unit }))
          root.style.setProperty(`--timeline-${key}`, `${value}px`);
        const offset = (new Date(+root.dataset.min).getUTCDay() + 6) % 7;
        root.style.setProperty("--timeline-offset", `${-Math.min(offset, showWeekends ? 6 : 5) * unit}px`);
        const axis = timelineAxis(+root.dataset.min, unit, showWeekends);
        for (const bar of root.querySelectorAll("[data-timeline-task]")) {
          const t = task(bar.dataset.timelineTask), start = t.start || t.due, due = t.due || t.start;
          const box = timelineBarBounds(axis, start, due, days ? ruler.clientWidth : 0, range);
          bar.hidden = box.outside;
          bar.style.left = `${box.left}px`;
          bar.style.width = `${box.width}px`;
          bar.classList.toggle("clipped-start", box.clippedStart);
          bar.classList.toggle("clipped-end", box.clippedEnd);
          const outside = bar.parentElement.querySelector(".timeline-outside");
          outside.hidden = !box.outside;
          outside.textContent = days ? "Outside range" : "No weekdays in range";
        }
        const bars = [...root.querySelectorAll("[data-timeline-task]")];
        const positions = new Map(bars.map((bar, i) => [bar.dataset.timelineTask, i]));
        root.querySelector(".timeline-dependencies").innerHTML = bars.flatMap((bar, i) => {
          if (bar.hidden) return [];
          const t = task(bar.dataset.timelineTask);
          return (t.dependencies || []).flatMap(id => {
            const from = positions.get(id);
            if (from == null || bars[from].hidden) return [];
            const a = task(id), sx = Math.min(ruler.clientWidth, Math.max(0, axis.end(a.due || a.start))), tx = Math.max(0, axis.x(t.start || t.due));
            return `<path d="M${sx},${from * 44 + 22} H${Math.min(ruler.clientWidth, sx + 10)} V${i * 44 + 22} H${tx}"/>`;
          });
        }).join("");
      }
      const { months, ticks } = timelineHeader(
        +root.dataset.min,
        unit,
        showWeekends,
        root.dataset.scale,
        ruler.clientWidth,
        range?.end,
      );
      const band = (className, items) => {
        const row = document.createElement("div");
        row.className = className;
        for (const item of items) {
          const span = document.createElement("span");
          span.style.left = `${item.left}px`;
          span.style.width = `${item.width}px`;
          if (className === "timeline-ticks") {
            const label = document.createElement("span");
            label.textContent = item.label;
            span.append(label);
          } else span.textContent = item.label;
          span.title = item.title;
          span.setAttribute("aria-label", item.title);
          if (item.date) span.dataset.date = item.date;
          if (item.weekend) span.classList.add("weekend");
          row.append(span);
        }
        return row;
      };
      ruler.replaceChildren(
        band("timeline-months", months),
        band("timeline-ticks", ticks),
      );
      const today = localDate(),
        axis = timelineAxis(+root.dataset.min, unit, showWeekends);
      const left =
        axis.x(today) + (!showWeekends && isWeekend(today) ? 0 : unit / 2);
      if (left >= 0 && left < ruler.clientWidth) {
        const marker = document.createElement("span");
        marker.className = "timeline-today";
        marker.setAttribute("role", "img");
        marker.style.left = `${left}px`;
        marker.title = `Today · ${today}`;
        marker.setAttribute("aria-label", marker.title);
        ruler.append(marker);
      }
    }
  });
  function render() {
    selection.refresh();
    resize.disconnect();
    document
      .querySelectorAll(".timeline-ruler")
      .forEach((ruler) => resize.observe(ruler));
  }

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
      if (!t || t.source) return;
      dateEditor.close();
      drag = {
        pointer: e.pointerId,
        capture: root,
        el,
        t,
        start: t.start || t.due,
        due: t.due || t.start,
        range: root.dataset.rangeEnd ? { start: root.dataset.rangeStart, end: root.dataset.rangeEnd } : null,
        width: el.parentElement.clientWidth,
        x: e.clientX,
        axis: timelineAxis(
          +root.dataset.min,
          +root.dataset.unit,
          root.dataset.weekends !== "false",
        ),
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
      if (!d.moved) return;
      d.next = {
        start: d.end === "due" ? d.start : d.axis.shift(d.start, delta),
        due:
          d.end === "start"
            ? d.due
            : d.end === "due"
              ? d.axis.shift(d.due, delta)
              : shiftDate(
                  d.due,
                  (Date.parse(d.axis.shift(d.start, delta)) -
                    Date.parse(d.start)) /
                    DAY,
                ),
      };
      if (d.next.start > d.next.due) {
        if (d.end === "start") d.next.start = d.next.due;
        else d.next.due = d.next.start;
      }
      d.el.textContent = `${d.next.start} → ${d.next.due}`;
      const bounds = timelineBarBounds(d.axis, d.next.start, d.next.due, d.width, d.range);
      d.el.style.left = `${bounds.left}px`;
      d.el.style.width = `${bounds.width}px`;
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
    const edit = !cancel && !d.moved && !d.end;
    suppress = d.moved || edit;
    setTimeout(() => (suppress = false), 0);
    try {
      if (!cancel && d.moved && d.next) await patchTask(d.t.id, d.next);
      else if (d.moved) renderView(true);
      else if (edit) editDates(d.t.id, d.el);
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
      if (el && ["Enter", " "].includes(e.key)) {
        stop(e);
        editDates(el.dataset.timelineTask, el);
        return;
      }
      if (
        el &&
        !task(el.dataset.timelineTask)?.source &&
        e.altKey &&
        ["ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        stop(e);
        const t = task(el.dataset.timelineTask),
          d = e.key === "ArrowLeft" ? -1 : 1,
          root = el.closest("[data-timeline]"),
          axis = timelineAxis(
            +root.dataset.min,
            +root.dataset.unit,
            root.dataset.weekends !== "false",
          ),
          start = axis.shift(t.start || t.due, d),
          delta = (Date.parse(start) - Date.parse(t.start || t.due)) / DAY;
        patchTask(t.id, {
          start,
          due: shiftDate(t.due || t.start, delta),
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
      const dates = e.target.closest("[data-task-dates]");
      const range = e.target.closest("[data-timeline-range]");
      if (range) {
        stop(e); selection.clear(); dateEditor.close(); rangeEditor.open(range); return;
      }
      const bar = e.target.closest("[data-timeline-task]");
      if (dates || (bar && !e.target.closest("[data-date-end]"))) {
        stop(e);
        editDates(
          dates?.dataset.taskDates || bar.dataset.timelineTask,
          dates || bar,
        );
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
      onOption(
        e.target.closest("[data-timeline]").dataset.timeline,
        "scale",
        e.target.value,
      );
    if (e.target.matches("[data-timeline-weekends]"))
      onOption(
        e.target.closest("[data-timeline]").dataset.timeline,
        "weekends",
        e.target.checked,
      );
  });
  document.addEventListener(
    "dragstart",
    (e) => {
      const n = e.target.closest("[data-unscheduled]");
      if (!n) return;
      if (task(n.dataset.unscheduled)?.source) return stop(e);
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
        axis = timelineAxis(
          +root.dataset.min,
          +root.dataset.unit,
          root.dataset.weekends !== "false",
        ),
        date = axis.dateAt(Math.max(0, (e.clientX - r.left) / z));
      patchTask(unscheduled, { start: date, due: date }).catch((err) =>
        toast(err.message, true),
      );
      unscheduled = null;
    },
    true,
  );
  document.addEventListener("dragend", () => (unscheduled = null));
  return { render };
}
