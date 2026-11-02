import { calendarHoursHTML, calendarHourSelection } from "./calendar-hours.js";
import { calendarZoom } from "./calendar-zoom.js";
import { timedCard, calendarTimeSelection, calendarTimeResize, calendarTimeStep, hourlySegments, minuteTime, timeMinutes } from "./calendar-time.js";
import { anchoredPanel } from "./anchored-panel.js";
import { mainWidth } from "./layout-width.js";
import { calendarRange, calendarDateChange, calendarWeeks, agendaGroups } from "./calendar-model.js";
import { dateKey, shiftDate, weekStart, isWeekend } from "./timeline-dates.js";
import { localDate } from "./task-visibility.js";
import { taskColorDot, taskFieldColor } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";

export function calendarView(ctx) {
  const { state, esc, icon, storage, renderView, task, patchTask, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  const unscheduled = anchoredPanel(ctx);
  calendarHourSelection(ctx);
  const zoom = calendarZoom(ctx);
  let mode = storage.get("calendar-mode", mainWidth() <= 780 ? "agenda" : "month");
  let period = storage.get("agenda-period", "week"), anchor = localDate();
  let weekends = storage.get("calendar-weekends", true) !== false, undated = [], shownTasks = [];
  let drag = null, suppressUntil = 0, suppressId = "";
  const format = (day, options = {}) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", ...options });
  const rangeLabel = t => { const r = calendarRange(t); return r ? `${r.start === r.end ? format(r.start) : `${format(r.start)} – ${format(r.end)}`}${timedCard(t) ? ` · ${t.start_time} – ${t.due_time}` : ""}` : "Set dates"; };
  const title = t => `${t.key ? `${t.key} ` : ""}${t.title}`;
  function dateButton(t) {
    return `<button type="button" class="button small calendar-dates" data-calendar-dates="${esc(t.id)}" aria-label="Edit dates for ${esc(t.title)}" aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span>${esc(rangeLabel(t))}</span></button>`;
  }
  function row(t, unscheduled = false) {
    const grip = unscheduled && !t.source ? `<button type="button" class="icon-button calendar-move" data-calendar-move aria-label="Schedule ${esc(t.title)}" title="Drag onto a day, or tap to set dates">${icon("drag")}</button>` : "";
    return `<div class="agenda-row ${grip ? "calendar-draggable-row" : ""}" data-calendar-card="${esc(t.id)}">${grip}<button type="button" class="agenda-task" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}">${taskColorDot(state, "status", t.status)}<span>${esc(title(t))}</span></button>${dateButton(t)}</div>`;
  }
  function render(tasks) {
    unscheduled.close();
    shownTasks = tasks;
    let from = anchor, to = anchor;
    // The Agenda's period applies to the Agenda only.
    if (mode === "week" || (mode === "agenda" && period === "week")) { from = dateKey(weekStart(anchor)); to = shiftDate(from, 6); }
    if (mode === "agenda" && period === "month") {
      from = `${anchor.slice(0, 7)}-01`;
      const next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
      to = shiftDate(dateKey(next.getTime()), -1);
    }
    const heading = mode === "month" || (mode === "agenda" && period === "month")
      ? new Date(`${anchor}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : from === to ? format(from, { year: "numeric" }) : `${format(from)} – ${format(to, { year: "numeric" })}`;
    undated = tasks.filter(t => !calendarRange(t));
    const groups = agendaGroups(tasks, from, to, weekends);
    const filtered = !!(state.search?.trim() || (state.status && state.status !== "all") || (state.type && state.type !== "all") || Object.values(state.extraFilters || {}).some(Boolean));
    const noMatches = filtered && !tasks.length;
    const clear = '<button type="button" class="button soft" data-action="filters-reset">Clear filters</button>';
    const empty = noMatches ? `<div class="calendar-empty"><p>No matching cards. Clear the filters to see the schedule.</p>${clear}</div>` : "";
    const agendaEmpty = filtered ? `<div class="calendar-empty"><p>No matching cards scheduled in this period.</p>${clear}</div>` : '<p class="field-hint">No cards scheduled in this period.</p>';
    const agenda = `<div class="calendar-agenda">${groups.map(([day, items]) => `<section class="agenda-day" data-calendar-date="${day}"><h3><time datetime="${day}">${esc(format(day, { weekday: "long" }))}</time></h3>${items.map(t => row(t)).join("")}</section>`).join("") || (noMatches ? "" : agendaEmpty)}</div>`;
    // Week keeps date-only cards above the hourly schedule.
    const weeks = calendarWeeks(mode === "week" ? tasks.filter(t => !timedCard(t)) : tasks, anchor, weekends, { week: mode === "week" });
    const month = `<div class="calendar-scroll" role="region" aria-label="Calendar ${mode === "week" ? "week" : "month"}" tabindex="0"><div class="calendar ${mode === "week" ? "calendar-hourly" : ""}" data-layout="${mode}" data-weekends="${weekends}" style="--calendar-columns:${weekends ? 7 : 5}"><div class="calendar-weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", ...(weekends ? ["Sat", "Sun"] : [])].map(day => `<strong>${day}</strong>`).join("")}</div>${mode === "week" ? '<div class="calendar-all-day-scroll">' : ""}${weeks.map(week => `<div class="calendar-week ${mode === "week" ? "calendar-all-day" : ""}" style="--calendar-lanes:${week.lanes}">${week.days.map((day, i) => `<div class="calendar-day ${isWeekend(day) ? "weekend" : ""} ${day === localDate() ? "today" : ""} ${mode === "month" && day.slice(0, 7) !== anchor.slice(0, 7) ? "muted" : ""}" data-calendar-date="${day}" style="grid-column:${i + 1};grid-row:1 / span ${week.lanes + 1}"><button type="button" data-feature="date-task" data-date="${day}" aria-label="Add card on ${day}">${Number(day.slice(-2))}</button></div>`).join("")}${week.segments.map(s => {
      const t = s.task;
      const handle = (end, show) => show && !t.source ? `<button type="button" class="calendar-resize" data-calendar-end="${end}" aria-label="Adjust ${end === "start" ? "start" : "end"} date for ${esc(t.title)}" title="Drag to adjust ${end === "start" ? "start" : "end"} date; arrow keys change by one day"><span aria-hidden="true"></span></button>` : "";
      return `<div class="calendar-task" data-calendar-card="${esc(t.id)}" data-id="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)};grid-column:${s.from + 1} / ${s.to + 2};grid-row:${s.lane + 2}" title="${esc(title(t))} · ${s.range.start} – ${s.range.end}${t.source ? ' · Dates managed by source' : ' · Drag to move'}">${handle("start", s.resizeStart)}<button type="button" class="calendar-card-title" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(title(t))}">${esc(t.title)}</button>${handle("due", s.resizeEnd)}</div>`;
    }).join("")}</div>`).join("")}${mode === "week" ? "</div>" : ""}${mode === "week" ? calendarHoursHTML(tasks, weeks[0].days, ctx) : ""}</div></div>`;
    zoom.restore();
    return { controls: `<button type="button" class="button small" data-calendar-unscheduled data-after-filters aria-label="Unscheduled cards (${undated.length})" title="Unscheduled cards (${undated.length})" aria-haspopup="dialog" aria-expanded="false">${icon("clock")}<span>${undated.length}</span></button><div class="planning-head"><div class="planning-period"><button class="icon-button" data-feature="month-prev" aria-label="Previous period" title="Previous period">${icon("arrow")}</button><h2>${esc(heading)}</h2><button class="icon-button" data-feature="month-next" aria-label="Next period" title="Next period">${icon("arrow")}</button></div><div class="planning-options" data-phone-options>${mode === "week" ? zoom.controls() : ""}<label class="check-control"><input type="checkbox" data-calendar-weekends data-weekends-toggle ${weekends ? "checked" : ""}>Show weekends</label><label><span class="control-label">Layout</span> <select id="calendar-mode"><option value="month" ${mode === "month" ? "selected" : ""}>Month</option><option value="week" ${mode === "week" ? "selected" : ""}>Week</option><option value="agenda" ${mode === "agenda" ? "selected" : ""}>Agenda</option></select></label>${mode === "agenda" ? `<label>Period<select id="agenda-period">${["day", "week", "month"].map(p => `<option value="${p}" ${p === period ? "selected" : ""}>${ctx.label(p)}</option>`).join("")}</select></label><input type="date" id="agenda-date" aria-label="Agenda date" value="${anchor}">` : ""}</div></div>`, html: `${empty}${mode === "agenda" ? agenda : month}<span class="sr-only" data-calendar-announcement role="status" aria-live="polite"></span>` };
  }
  function editDates(id, trigger) {
    const project = state.project.id;
    const selector = trigger.closest(".calendar-task, .calendar-timed-card") ? `[data-calendar-card="${CSS.escape(id)}"] .calendar-card-title` : `[data-calendar-dates="${CSS.escape(id)}"]`;
    dateEditor.open(id, () => state.view === "calendar" && state.project?.id === project ? document.querySelector(selector) : null);
  }
  function dayAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const week = el?.closest(".calendar-week");
    if (week) {
      const bounds = week.getBoundingClientRect(), days = [...week.querySelectorAll(".calendar-day")];
      return days[Math.floor((x - bounds.left) / bounds.width * days.length)]?.dataset.calendarDate;
    }
    return el?.closest(".agenda-day, .calendar-hours-day")?.dataset.calendarDate;
  }
  function dropChange(d, x, y) {
    if (d.hours) {
      const bounds = d.hours.closest('.calendar-hours-scroll').getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
      const r = d.hours.getBoundingClientRect();
      d.step = calendarTimeStep(r.height / 24);
      return calendarTimeResize(d.task, d.hours.dataset.calendarDate, (y - r.top) / r.height * 1440, d.handle, d.step);
    }
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest(".calendar-drag-cancel")) return null;
    const hours = d.panel && hit?.closest(".calendar-hours-day");
    if (hours) {
      const r = hours.getBoundingClientRect(), minutes = (y - r.top) / r.height * 1440;
      return calendarTimeSelection(hours.dataset.calendarDate, minutes, minutes);
    }
    const day = dayAt(x, y);
    return day ? calendarDateChange(d.task, d.grabbed, day, d.handle) : null;
  }
  function clearPlacement(d) {
    d.placements?.forEach(el => el.remove());
    d.weekLanes?.forEach(([el, lanes]) => el.style.setProperty('--calendar-lanes', lanes));
    d.placements = []; d.weekLanes = [];
  }
  function placement(d, next) {
    const key = JSON.stringify(d.next);
    if (d.placementKey === key) return;
    d.placementKey = key;
    clearPlacement(d);
    if (!d.next || d.hours) return;
    const items = shownTasks.map(t => t.id === next.id ? next : t);
    const add = (parent, className) => {
      const el = document.createElement('div'); el.className = `${className} calendar-placement`;
      el.textContent = next.title; el.setAttribute('aria-hidden', 'true');
      parent.append(el); d.placements.push(el); return el;
    };
    if (mode === 'week' && timedCard(next)) {
      const days = [...document.querySelectorAll('.calendar-hours-day')];
      for (const s of hourlySegments(items, days.map(el => el.dataset.calendarDate)).filter(s => s.task.id === next.id)) {
        const el = add(days.find(el => el.dataset.calendarDate === s.day), 'calendar-time-selection');
        Object.assign(el.style, { top: `${s.start / 1440 * 100}%`, height: `${(s.end - s.start) / 1440 * 100}%`, left: `${s.lane / s.columns * 100}%`, width: `${100 / s.columns}%`, right: 'auto' });
      }
    } else if (mode !== 'agenda') {
      const weeks = [...document.querySelectorAll('.calendar-week')];
      calendarWeeks(mode === 'week' ? items.filter(t => !timedCard(t)) : items, anchor, weekends, { week: mode === 'week' }).forEach((week, i) => {
        const s = week.segments.find(s => s.task.id === next.id); if (!s) return;
        const el = weeks[i], lanes = el.style.getPropertyValue('--calendar-lanes');
        d.weekLanes.push([el, lanes]); el.style.setProperty('--calendar-lanes', Math.max(Number(lanes), s.lane + 1));
        const bar = add(el, 'calendar-task'); bar.style.gridColumn = `${s.from + 1} / ${s.to + 2}`; bar.style.gridRow = s.lane + 2;
      });
    } else {
      const day = dayAt(d.x, d.y), target = document.querySelector(`.agenda-day[data-calendar-date="${day}"]`);
      if (target) add(target, 'agenda-row');
    }
  }
  function preview() {
    const d = drag;
    if (!d?.active) return;
    if (!d.card.isConnected || state.view !== "calendar" || state.project?.id !== d.project) { finish(true); return; }
    const scroll = document.querySelector(".calendar-scroll");
    if (scroll) {
      const rect = scroll.getBoundingClientRect();
      if (d.y >= rect.top && d.y <= rect.bottom) {
        if (d.x > rect.right - 30) scroll.scrollLeft += 10;
        else if (d.x < rect.left + 30) scroll.scrollLeft -= 10;
      }
    }
    const cancel = !!document.elementFromPoint(d.x, d.y)?.closest(".calendar-drag-cancel");
    d.cancel?.classList.toggle("calendar-drop-target", cancel);
    const scroller = document.querySelector(".calendar-hours-scroll") || document.querySelector(".calendar-scroll, .calendar-agenda");
    if (scroller && !cancel) {
      const r = scroller.getBoundingClientRect();
      if (d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom) {
        if (d.y > r.bottom - 24) scroller.scrollTop += 12;
        else if (d.y < r.top + 24) scroller.scrollTop -= 12;
      }
    }
    d.next = dropChange(d, d.x, d.y);
    const next = { ...d.task, ...d.next }, range = d.next && calendarRange(next);
    if (d.hours && d.next) {
      const segment = hourlySegments([next], [d.hours.dataset.calendarDate])[0] || { start: 0, end: 0 };
      d.card.style.top = `${segment.start / 1440 * 100}%`;
      d.card.style.height = `${(segment.end - segment.start) / 1440 * 100}%`;
      d.card.querySelector('.calendar-card-title span').textContent = `${minuteTime(segment.start)} – ${segment.end === 1440 ? '24:00' : minuteTime(segment.end)}`;
    } else if (d.hours) {
      d.card.setAttribute('style', d.originalStyle);
      d.card.querySelector('.calendar-card-title span').textContent = d.originalTime;
    }
    placement(d, next);
    d.ghost.querySelector("small").textContent = d.hours ? range ? `${next.start_time} – ${next.due_time} · ${d.step} min steps` : 'Release to cancel' : cancel ? "Keep unscheduled" : range ? `${range.start}${d.next.start_time ? ` · ${d.next.start_time} – ${d.next.due_time}` : ` → ${range.end}`}` : "Move over a day to schedule";
    d.ghost.style.left = `${Math.max(8, Math.min(innerWidth - 248, d.x + 16))}px`;
    d.ghost.style.top = `${Math.max(8, Math.min(innerHeight - 75, d.y + 18))}px`;
    d.frame = requestAnimationFrame(preview);
  }
  async function save(id, changes, focusSelector = null) {
    try {
      await patchTask(id, changes);
      const target = focusSelector && document.querySelector(focusSelector);
      if (target) target.focus({ preventScroll: true });
      else if (focusSelector) {
        // Moved out of the period shown: say where it went, and keep focus on the calendar.
        const t = task(id), range = t && calendarRange(t);
        document.querySelector("[data-calendar-announcement]").textContent = range ? `${t.title} moved to ${range.start === range.end ? range.start : `${range.start} – ${range.end}`}.` : "";
        document.querySelector(".calendar-scroll, .calendar-agenda")?.focus({ preventScroll: true });
      }
    }
    catch (error) { toast(error.message, true); renderView(true); }
  }
  function finish(cancel = false) {
    const d = drag; if (!d) return;
    drag = null; state.toolDragging = false;
    cancelAnimationFrame(d.frame);
    if (d.card.hasPointerCapture(d.pointer)) d.card.releasePointerCapture(d.pointer);
    d.ghost?.remove();
    d.cancel?.remove();
    clearPlacement(d);
    if (d.hours && (cancel || !d.next)) {
      d.card.setAttribute('style', d.originalStyle);
      d.card.querySelector('.calendar-card-title span').textContent = d.originalTime;
    }
    d.card.classList.remove('calendar-time-resizing');
    if (d.panel) {
      if (!cancel && d.next) unscheduled.close();
      else { d.panel.style.removeProperty("visibility"); d.panel.style.removeProperty("pointer-events"); }
    }
    document.querySelectorAll(".calendar-dragging,.calendar-drop-target").forEach(el => el.classList.remove("calendar-dragging", "calendar-drop-target"));
    if (d.active || d.handle) { suppressUntil = performance.now() + 500; suppressId = d.task.id; }
    if (!cancel && !d.active && d.handle) editDates(d.task.id, d.card.querySelector("[data-calendar-end], [data-calendar-time-end]"));
    if (!cancel && d.active && d.next && Object.entries(d.next).some(([key, value]) => d.task[key] !== value)) void save(d.task.id, d.next);
  }
  document.addEventListener("pointerdown", e => {
    if (drag && e.pointerId !== drag.pointer) { finish(true); return; }
    const card = e.target.closest("[data-calendar-card]");
    if (!card || state.view !== "calendar" || e.button !== 0 || e.target.closest("[data-calendar-dates]")) return;
    if (e.pointerType === "touch" && card.matches(".agenda-row") && !e.target.closest("[data-calendar-move]")) return;
    const t = task(card.dataset.calendarCard); if (!t || t.source) return;
    const timeEnd = e.target.closest('[data-calendar-time-end]')?.dataset.calendarTimeEnd;
    const handle = timeEnd || e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    drag = { card, hours: timeEnd && card.closest('.calendar-hours-day'), originalStyle: card.getAttribute('style'), originalTime: card.querySelector('.calendar-card-title span')?.textContent, panel: card.closest(".calendar-unscheduled"), task: { ...t }, project: state.project.id, pointer: e.pointerId, handle, grabbed: dayAt(e.clientX, e.clientY) || calendarRange(t)?.start, x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY, active: false };
    if (handle) e.preventDefault();
  }, true);
  document.addEventListener("pointermove", e => {
    const d = drag; if (!d || d.pointer !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active && Math.hypot(d.x - d.originX, d.y - d.originY) >= 6) {
      d.active = state.toolDragging = true; dateEditor.close();
      d.card.setPointerCapture(e.pointerId);
      d.card.classList.add("calendar-dragging");
      if (d.hours) d.card.classList.add('calendar-time-resizing');
      if (d.panel) {
        d.panel.style.visibility = "hidden";
        d.panel.style.pointerEvents = "none";
        d.cancel = document.createElement("button");
        d.cancel.type = "button"; d.cancel.className = "button calendar-drag-cancel";
        d.cancel.innerHTML = `${icon("close")}<span>Cancel drag</span>`;
        d.cancel.title = "Drop here to keep this card unscheduled";
        d.cancel.addEventListener("click", () => finish(true));
        document.body.append(d.cancel);
      }
      d.ghost = document.createElement("div"); d.ghost.className = "calendar-drag-preview";
      d.ghost.innerHTML = `<strong>${esc(title(d.task))}</strong><small></small>`;
      document.body.append(d.ghost); preview();
    }
    if (d.active) e.preventDefault();
  }, true);
  document.addEventListener("pointerup", e => {
    if (drag?.pointer !== e.pointerId) return;
    if (drag.active) {
      drag.next = dropChange(drag, e.clientX, e.clientY);
    }
    finish();
  }, true);
  document.addEventListener("pointercancel", e => { if (drag?.pointer === e.pointerId) finish(true); }, true);
  // Touch starts with implicit capture on the title/handle. Transferring it to
  // the card emits a loss on that child; only loss from our owner cancels a drag.
  document.addEventListener("lostpointercapture", e => {
    if (drag?.pointer === e.pointerId && e.target === drag.card) finish(true);
  }, true);
  window.addEventListener("blur", () => finish(true));
  document.addEventListener("dragstart", e => { if (e.target.closest("[data-calendar-card]")) e.preventDefault(); });
  document.addEventListener("click", e => {
    if (performance.now() < suppressUntil && e.target.closest("[data-calendar-card]")?.dataset.calendarCard === suppressId && !e.target.closest("[data-calendar-dates]")) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    const button = e.target.closest("[data-calendar-unscheduled]");
    if (button) {
      const panel = unscheduled.show(button, `Unscheduled (${undated.length})`, `<div class="calendar-unscheduled-list">${undated.map(t => row(t, true)).join("") || '<p class="field-hint">All matching cards are scheduled.</p>'}</div>`);
      if (panel) { panel.classList.add("calendar-unscheduled"); button.setAttribute("aria-expanded", "true"); }
      return;
    }
    if (e.target.closest('.calendar-unscheduled [data-action="task-open"]')) unscheduled.close();

    const date = e.target.closest("[data-calendar-dates]"), handle = e.target.closest("[data-calendar-end], [data-calendar-move], [data-calendar-time-end]");
    if (date || handle) { e.preventDefault(); e.stopImmediatePropagation(); editDates(date?.dataset.calendarDates || handle.closest("[data-calendar-card]").dataset.calendarCard, date || handle); }
  }, true);
  document.addEventListener("keydown", e => {
    if (drag && e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(true); return; }
    const card = e.target.closest("[data-calendar-card]"); if (!card) return;
    const t = task(card.dataset.calendarCard), range = t && calendarRange(t), handle = e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    const timeEnd = e.target.closest('[data-calendar-time-end]')?.dataset.calendarTimeEnd;
    if (timeEnd) {
      if (!t || t.source || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const day = card.closest('.calendar-hours-day'), step = calendarTimeStep(day.getBoundingClientRect().height / 24);
      const minute = t[timeEnd] > day.dataset.calendarDate ? 1440 : timeMinutes(t[`${timeEnd}_time`]);
      void save(t.id, calendarTimeResize(t, day.dataset.calendarDate, minute + (e.key === 'ArrowDown' ? step : -step), timeEnd, step), `[data-calendar-card="${CSS.escape(t.id)}"] [data-calendar-time-end="${timeEnd}"]`);
      return;
    }
    if (!range || t.source || !(handle || e.altKey) || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const from = handle === "due" ? range.end : range.start;
    const selector = `[data-calendar-card="${CSS.escape(t.id)}"] ${handle ? `[data-calendar-end="${handle}"]` : '[data-action="task-open"]'}`;
    void save(t.id, calendarDateChange(t, from, shiftDate(from, e.key === "ArrowLeft" ? -1 : 1), handle), selector);
  }, true);
  document.addEventListener("change", e => {
    if (e.target.id === "calendar-mode") { mode = e.target.value; storage.set("calendar-mode", mode); renderView(true); }
    if (e.target.id === "agenda-period") { period = e.target.value; storage.set("agenda-period", period); renderView(true); }
    if (e.target.id === "agenda-date" && e.target.value) { anchor = e.target.value; renderView(true); }
    if (e.target.matches("[data-calendar-weekends]")) { weekends = e.target.checked; storage.set("calendar-weekends", weekends); renderView(true); }
  });
  function click(action, el) {
    if (action === "month-prev" || action === "month-next") {
      const direction = action === "month-prev" ? -1 : 1;
      if (mode === "week" || (mode === "agenda" && period !== "month")) anchor = shiftDate(anchor, direction * (mode === "week" || period === "week" ? 7 : 1));
      else { const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); anchor = dateKey(date.getTime()); }
      renderView(true); return true;
    }
    if (action === "date-task") { ctx.taskDialog(null, { due: el.dataset.date }); return true; }
    return false;
  }
  return { render, click };
}
