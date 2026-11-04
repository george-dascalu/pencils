import { sourceReadOnly } from "./source-model.js";
import { calendarHoursHTML, calendarHourSelection } from "./calendar-hours.js";
import { calendarZoom } from "./calendar-zoom.js";
import { timedCard, calendarTimeMove, calendarTimeSelection, calendarTimeResize, calendarTimeStep, hourlySegments, minuteTime, timeMinutes } from "./calendar-time.js";
import { anchoredPanel } from "./anchored-panel.js";
import { mainWidth } from "./layout-width.js";
import { calendarRange, calendarDateChange, calendarWeeks, agendaGroups, AGENDA_RANGES, agendaRange, shiftAgendaRange } from "./calendar-model.js";
import { naturalGroups } from "./task-group-order.js";
import { groupedTaskPatch } from "./task-order-model.js";
import { projectPeople } from "./teams.js";
import { fieldOn } from "./card-fields.js";
import { priorityLabel } from "./task-priority.js";
import { statusLabel } from "./workflow-model.js";
import { dateKey, shiftDate, stamp, DAY, weekStart, isWeekend } from "./timeline-dates.js";
import { localDate } from "./task-visibility.js";
import { taskColorDot, taskFieldColor } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";
import { rangeChoicesHTML, rangeLabelHTML } from "./range-menu.js";

export function calendarView(ctx) {
  const { state, esc, icon, storage, renderView, task, patchTask, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  const unscheduled = anchoredPanel(ctx);
  calendarHourSelection(ctx);
  const zoom = calendarZoom(ctx);
  let mode = storage.get("calendar-mode", mainWidth() <= 780 ? "agenda" : "month");
  let quick = storage.get("agenda-range", { day: "today", week: "this-week", month: "this-month" }[storage.get("agenda-period", "week")] || "this-week"), picked = null, anchor = localDate();
  let weekends = storage.get("calendar-weekends", true) !== false, undated = [], shownTasks = [];
  // Week board rows: a card field, or one row for every card.
  let boardRows = storage.get("week-board-rows", "assignee");
  const ROW_FIELDS = [["assignee", "By assignee"], ["status", "By status"], ["priority", "By priority"], ["type", "By card type"], ["none", "No rows"]];
  const rowField = () => ROW_FIELDS.some(([key]) => key === boardRows) && (boardRows === "none" || fieldOn(state.config, boardRows)) ? boardRows : "none";
  let drag = null, suppressUntil = 0, suppressId = "";
  const format = (day, options = {}) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", ...options });
  const rangeLabel = t => { const r = calendarRange(t); return r ? `${r.start === r.end ? format(r.start) : `${format(r.start)} – ${format(r.end)}`}${timedCard(t) ? ` · ${t.start_time} – ${t.due_time}` : ""}` : "Set dates"; };
  const title = t => `${t.key ? `${t.key} ` : ""}${t.title}`;
  function dateButton(t) {
    return `<button type="button" class="button small calendar-dates" data-calendar-dates="${esc(t.id)}" aria-label="Edit dates for ${esc(t.title)}" aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span>${esc(rangeLabel(t))}</span></button>`;
  }
  function row(t, unscheduled = false) {
    const grip = unscheduled && !sourceReadOnly(t,"due") ? `<button type="button" class="icon-button calendar-move" data-calendar-move aria-label="Schedule ${esc(t.title)}" title="Drag onto a day, or tap to set dates">${icon("drag")}</button>` : "";
    return `<div class="agenda-row ${grip ? "calendar-draggable-row" : ""}" data-calendar-card="${esc(t.id)}">${grip}<button type="button" class="agenda-task" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}">${taskColorDot(state, "status", t.status)}<span>${esc(title(t))}</span></button>${unscheduled ? dateButton(t) : ctx.inlineTaskFields(t, "agenda-fields", rangeLabel(t))}</div>`;
  }
  // A quick range on one side and dates on the other, like a dashboard's time picker.
  function rangePicker(agenda, heading) {
    const name = AGENDA_RANGES.find(([key]) => key === agenda.quick)?.[1] || heading;
    return `<details class="board-menu agenda-range-menu" data-board-menu="agenda-range"><summary class="button small range-trigger" aria-label="Agenda range: ${esc(name)}" title="Agenda range">${rangeLabelHTML(name, ctx)}</summary><div class="board-menu-panel agenda-range-panel range-panel">${rangeChoicesHTML({ name: "agenda", from: agenda.from, to: agenda.to, quick: agenda.quick, ranges: AGENDA_RANGES, esc })}</div></details>`;
  }
  document.addEventListener("click", e => {
    const choice = e.target.closest(".agenda-range-menu [data-range-quick]");
    if (!choice || state.view !== "calendar") return;
    quick = choice.dataset.rangeQuick; picked = null;
    storage.set("agenda-range", quick);
    renderView(true);
    document.querySelector(".agenda-range-menu > summary")?.focus({ preventScroll: true });
  });
  document.addEventListener("submit", e => {
    const form = e.target.closest('[data-range-form="agenda"]');
    if (!form) return;
    e.preventDefault();
    const range = agendaRange({ from: form.elements.from.value, to: form.elements.to.value }, localDate()), error = form.querySelector("[data-range-error]");
    if (range.quick) {
      error.textContent = "Choose a From date on or before the To date, at most a year apart.";
      error.hidden = false;
      form.elements.from.focus();
      return;
    }
    picked = { from: range.from, to: range.to };
    state.headerMenu = null;
    renderView(true);
    document.querySelector(".agenda-range-menu > summary")?.focus({ preventScroll: true });
  }, true);
  // Days as columns and a row per value of the chosen field; a card shows on its first day here.
  function weekBoard(tasks, from, to) {
    const field = rowField(), days = [...Array(7)].map((_, i) => shiftDate(from, i)).filter(day => weekends || !isWeekend(day));
    const byDay = new Map(agendaGroups(tasks, from, to, weekends)), placed = [...byDay.values()].flat();
    // A card without a priority has priority None; statuses no longer in the workflow keep a row.
    const value = t => field === "none" ? "" : field === "priority" ? t.priority || "none" : t[field] || "";
    const rows = field === "none" ? [""] : naturalGroups(field, placed.map(t => ({ [field]: value(t) })), state.config, projectPeople(state).map(p => p.name));
    const name = value => field === "status" ? statusLabel(state.config, value) : field === "priority" ? priorityLabel(value) : value ? ctx.label(value) : field === "type" ? "No type" : "Unassigned";
    const card = t => `<article class="week-board-card" data-calendar-card="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)}">${sourceReadOnly(t, "due") ? "" : `<button type="button" class="icon-button calendar-move" data-calendar-move aria-label="Move ${esc(t.title)}" title="Drag to another day or row">${icon("drag")}</button>`}<button type="button" class="week-board-title" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}">${esc(title(t))}</button>${ctx.inlineTaskFields(t, "week-board-fields", rangeLabel(t))}</article>`;
    // A table to assistive technology: days are column headers, rows' names row headers.
    return `${placed.length ? "" : '<p class="field-hint week-board-empty">No cards scheduled this week.</p>'}<div class="calendar-scroll week-board-scroll" role="region" aria-label="Week board" tabindex="0"><div class="week-board" role="table" aria-label="Week board" data-rows="${field}" style="--week-board-days:${days.length}"><div class="week-board-head-row" role="row"><div class="week-board-corner" role="columnheader"><span class="sr-only">${field === "none" ? "Cards" : esc(ROW_FIELDS.find(([key]) => key === field)[1])}</span></div>${days.map(day => `<div class="week-board-day-head${day === localDate() ? " today" : ""}${isWeekend(day) ? " weekend" : ""}" role="columnheader" data-calendar-date="${day}"><time datetime="${day}">${esc(format(day, { weekday: "short" }))}</time></div>`).join("")}</div>${rows.map(row => {
      const count = placed.filter(t => value(t) === row).length;
      return `<div class="week-board-row" role="row" data-week-board-value="${esc(row)}"><div class="week-board-row-head" role="rowheader">${field === "none" ? '<span class="sr-only">All cards</span>' : `<span>${esc(name(row))}</span><span class="count" aria-label="${count} ${count === 1 ? "card" : "cards"}">${count}</span>`}</div>${days.map(day => `<div class="week-board-cell${isWeekend(day) ? " weekend" : ""}" role="cell" data-calendar-date="${day}" data-week-board-value="${esc(row)}">${(byDay.get(day) || []).filter(t => value(t) === row).map(card).join("")}</div>`).join("")}</div>`;
    }).join("")}</div></div>`;
  }
  function render(tasks) {
    unscheduled.close();
    shownTasks = tasks;
    // The Agenda shows its own range; Week and Month follow the anchor date.
    const range = agendaRange({ quick, ...picked }, localDate());
    let { from, to } = mode === "agenda" ? range : { from: anchor, to: anchor };
    if (mode === "week" || mode === "board") { from = dateKey(weekStart(anchor)); to = shiftDate(from, 6); }
    const wholeMonth = from.slice(8) === "01" && shiftDate(to, 1).slice(8) === "01" && from.slice(0, 7) === to.slice(0, 7);
    const heading = mode === "month" || (mode === "agenda" && wholeMonth)
      ? new Date(`${mode === "month" ? anchor : from}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
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
      const handle = (end, show) => show && !sourceReadOnly(t,"due") ? `<button type="button" class="calendar-resize" data-calendar-end="${end}" aria-label="Adjust ${end === "start" ? "start" : "end"} date for ${esc(t.title)}" title="Drag to adjust ${end === "start" ? "start" : "end"} date; arrow keys change by one day"><span aria-hidden="true"></span></button>` : "";
      return `<div class="calendar-task" data-calendar-card="${esc(t.id)}" data-id="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)};grid-column:${s.from + 1} / ${s.to + 2};grid-row:${s.lane + 2}" title="${esc(title(t))} · ${s.range.start} – ${s.range.end}${sourceReadOnly(t,"due") ? ' · Dates managed by source' : ' · Drag to move'}">${handle("start", s.resizeStart)}<button type="button" class="calendar-card-title" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(title(t))}">${esc(t.title)}</button>${handle("due", s.resizeEnd)}</div>`;
    }).join("")}</div>`).join("")}${mode === "week" ? "</div>" : ""}${mode === "week" ? calendarHoursHTML(tasks, weeks[0].days, ctx) : ""}</div></div>`;
    zoom.restore();
    return { controls: `<button type="button" class="button small" data-calendar-unscheduled data-after-filters aria-label="Unscheduled cards (${undated.length})" title="Unscheduled cards (${undated.length})" aria-haspopup="dialog" aria-expanded="false">${icon("clock")}<span>${undated.length}</span></button><div class="planning-head"><div class="planning-period"><button class="icon-button" data-feature="month-prev" aria-label="Previous period" title="Previous period">${icon("arrow")}</button><h2>${esc(heading)}</h2><button class="icon-button" data-feature="month-next" aria-label="Next period" title="Next period">${icon("arrow")}</button></div><div class="planning-options" data-phone-options>${mode === "week" ? zoom.controls() : mode === "agenda" ? rangePicker(range, heading) : mode === "board" ? `<label><span class="control-label">Rows</span><select id="week-board-rows">${ROW_FIELDS.filter(([key]) => key === "none" || fieldOn(state.config, key)).map(([key, name]) => `<option value="${key}" ${key === rowField() ? "selected" : ""}>${name}</option>`).join("")}</select></label>` : ""}${mode === "month" ? "" : '<span class="planning-separator" aria-hidden="true"></span>'}<button type="button" id="calendar-weekends" class="icon-button" data-calendar-weekends data-weekends-toggle aria-label="Show weekends" aria-pressed="${weekends}" title="${weekends ? "Hide weekends" : "Show weekends"}">${icon("calendar-weekends")}</button><label><span class="control-label">Layout</span> <select id="calendar-mode"><option value="month" ${mode === "month" ? "selected" : ""}>Month</option><option value="week" ${mode === "week" ? "selected" : ""}>Week</option><option value="board" ${mode === "board" ? "selected" : ""}>Week board</option><option value="agenda" ${mode === "agenda" ? "selected" : ""}>Agenda</option></select></label></div></div>`, html: `${empty}${mode === "agenda" ? agenda : mode === "board" ? weekBoard(tasks, from, to) : month}<span class="sr-only" data-calendar-announcement role="status" aria-live="polite"></span>` };
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
    return el?.closest(".agenda-day, .calendar-hours-day, .week-board-cell")?.dataset.calendarDate;
  }
  function dropChange(d, x, y) {
    d.reason = "";
    if (d.hours) {
      const bounds = d.hours.closest('.calendar-hours-scroll').getBoundingClientRect();
      if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
      const target = document.elementFromPoint(x, y)?.closest('.calendar-hours-day');
      if (!target) return null;
      const r = target.getBoundingClientRect();
      d.step = calendarTimeStep(r.height / 24);
      return calendarTimeResize(d.task, target.dataset.calendarDate, (y - r.top) / r.height * 1440, d.handle, d.step);
    }
    const hit = document.elementFromPoint(x, y);
    if (hit?.closest(".calendar-drag-cancel")) return null;
    const hours = (d.panel || d.timedDay) && hit?.closest(".calendar-hours-day");
    if (hours) {
      const r = hours.getBoundingClientRect(), minutes = (y - r.top) / r.height * 1440;
      d.step = calendarTimeStep(r.height / 24);
      return d.timedDay ? calendarTimeMove(d.task, hours.dataset.calendarDate, minutes, d.offset, d.step)
        : calendarTimeSelection(hours.dataset.calendarDate, minutes, minutes);
    }
    const day = dayAt(x, y);
    if (!day) return null;
    const change = calendarDateChange(d.task, d.grabbed, day, d.handle), row = mode === "board" && !d.handle && hit?.closest(".week-board-cell");
    if (row && rowField() !== "none" && (rowField() === "priority" ? d.task.priority || "none" : d.task[rowField()] || "") !== row.dataset.weekBoardValue) {
      try { Object.assign(change, groupedTaskPatch(state.config, state.tasks, d.task.id, rowField(), row.dataset.weekBoardValue)); }
      catch (error) { d.reason = error.message; return null; }
    }
    return change;
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
    if (!d.next) return;
    const items = shownTasks.map(t => t.id === next.id ? next : t);
    const add = (parent, className) => {
      const el = document.createElement('div'); el.className = `${className} calendar-placement`;
      el.textContent = next.title; el.setAttribute('aria-hidden', 'true');
      parent.append(el); d.placements.push(el); return el;
    };
    if (mode === 'week' && timedCard(next)) {
      const days = [...document.querySelectorAll('.calendar-hours-day')];
      for (const s of hourlySegments(items, days.map(el => el.dataset.calendarDate)).filter(s => s.task.id === next.id && (!d.hours || s.day !== d.hours.dataset.calendarDate))) {
        const el = add(days.find(el => el.dataset.calendarDate === s.day), 'calendar-time-selection');
        Object.assign(el.style, { top: `${s.start / 1440 * 100}%`, height: `${(s.end - s.start) / 1440 * 100}%`, left: `${s.lane / s.columns * 100}%`, width: `${100 / s.columns}%`, right: 'auto' });
      }
    } else if (mode === 'month' || mode === 'week') {
      const weeks = [...document.querySelectorAll('.calendar-week')];
      calendarWeeks(mode === 'week' ? items.filter(t => !timedCard(t)) : items, anchor, weekends, { week: mode === 'week' }).forEach((week, i) => {
        const s = week.segments.find(s => s.task.id === next.id); if (!s) return;
        const el = weeks[i], lanes = el.style.getPropertyValue('--calendar-lanes');
        d.weekLanes.push([el, lanes]); el.style.setProperty('--calendar-lanes', Math.max(Number(lanes), s.lane + 1));
        const bar = add(el, 'calendar-task'); bar.style.gridColumn = `${s.from + 1} / ${s.to + 2}`; bar.style.gridRow = s.lane + 2;
      });
    } else if (mode === 'board') {
      const target = document.elementFromPoint(d.x, d.y)?.closest('.week-board-cell');
      if (target) add(target, 'week-board-card');
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
      d.card.style.visibility = segment.end > segment.start ? '' : 'hidden';
      d.card.style.top = `${segment.start / 1440 * 100}%`;
      d.card.style.height = `${(segment.end - segment.start) / 1440 * 100}%`;
      d.card.querySelector('.calendar-event-time').textContent = `${minuteTime(segment.start)} – ${segment.end === 1440 ? '24:00' : minuteTime(segment.end)}`;
    } else if (d.hours) {
      d.card.setAttribute('style', d.originalStyle);
      d.card.querySelector('.calendar-event-time').textContent = d.originalTime;
    }
    placement(d, next);
    d.ghost.querySelector("small").textContent = d.hours ? range ? `${range.start !== range.end ? `${range.start} ${next.start_time} → ${range.end} ${next.due_time}` : `${next.start_time} – ${next.due_time}`} · ${d.step} min steps` : 'Release to cancel' : cancel ? "Keep unscheduled" : range ? `${range.start}${d.next.start_time ? ` · ${d.next.start_time} – ${d.next.due_time}` : ` → ${range.end}`}` : "Move over a day to schedule";
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
      d.card.querySelector('.calendar-event-time').textContent = d.originalTime;
    }
    d.card.classList.remove('calendar-time-resizing');
    d.siblings?.forEach(el => el.classList.remove('calendar-resize-sibling'));
    if (d.panel) {
      if (!cancel && d.next) unscheduled.close();
      else { d.panel.style.removeProperty("visibility"); d.panel.style.removeProperty("pointer-events"); }
    }
    document.querySelectorAll(".calendar-dragging,.calendar-drop-target").forEach(el => el.classList.remove("calendar-dragging", "calendar-drop-target"));
    if (d.active || d.handle) { suppressUntil = performance.now() + 500; suppressId = d.task.id; }
    if (!cancel && !d.active && d.handle) editDates(d.task.id, d.card.querySelector("[data-calendar-end], [data-calendar-time-end]"));
    if (!cancel && d.active && d.next && Object.entries(d.next).some(([key, value]) => d.task[key] !== value)) void save(d.task.id, d.next);
    else if (!cancel && d.active && d.reason) toast(d.reason, true);
  }
  document.addEventListener("pointerdown", e => {
    if (drag && e.pointerId !== drag.pointer) { finish(true); return; }
    const card = e.target.closest("[data-calendar-card]");
    if (!card || state.view !== "calendar" || e.button !== 0 || e.target.closest("[data-calendar-dates], .agenda-fields, .week-board-fields")) return;
    if (e.pointerType === "touch" && card.matches(".agenda-row, .week-board-card") && !e.target.closest("[data-calendar-move]")) return;
    const t = task(card.dataset.calendarCard); if (!t || sourceReadOnly(t,"due")) return;
    const timeEnd = e.target.closest('[data-calendar-time-end]')?.dataset.calendarTimeEnd;
    const handle = timeEnd || e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    const timedDay = card.closest('.calendar-hours-day');
    const r = timedDay?.getBoundingClientRect();
    const offset = timedDay ? (stamp(timedDay.dataset.calendarDate) - stamp(t.start)) / DAY * 1440 + (e.clientY - r.top) / r.height * 1440 - timeMinutes(t.start_time) : 0;
    drag = { card, timedDay, offset, hours: timeEnd && card.closest('.calendar-hours-day'), originalStyle: card.getAttribute('style'), originalTime: card.querySelector('.calendar-event-time')?.textContent, panel: card.closest(".calendar-unscheduled"), task: { ...t }, project: state.project.id, pointer: e.pointerId, handle, grabbed: dayAt(e.clientX, e.clientY) || calendarRange(t)?.start, x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY, active: false };
    if (handle) e.preventDefault();
  }, true);
  document.addEventListener("pointermove", e => {
    const d = drag; if (!d || d.pointer !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active && Math.hypot(d.x - d.originX, d.y - d.originY) >= 6) {
      d.active = state.toolDragging = true; dateEditor.close();
      d.card.setPointerCapture(e.pointerId);
      d.card.classList.add("calendar-dragging");
      if (d.hours) {
        d.siblings = [...document.querySelectorAll(`[data-calendar-card="${CSS.escape(d.task.id)}"]`)].filter(el => el !== d.card && el.matches('.calendar-timed-card'));
        d.siblings.forEach(el => el.classList.add('calendar-resize-sibling'));
      }
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
    if (e.target.closest('[data-calendar-weekends]')) {
      weekends = !weekends; storage.set('calendar-weekends', weekends); renderView(true); return;
    }
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
    const card = e.target.closest("[data-calendar-card]"); if (!card || e.target.closest('.agenda-fields, .week-board-fields')) return;
    const t = task(card.dataset.calendarCard), range = t && calendarRange(t), handle = e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    const timeEnd = e.target.closest('[data-calendar-time-end]')?.dataset.calendarTimeEnd;
    if (timeEnd) {
      if (!t || sourceReadOnly(t,"due") || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const day = card.closest('.calendar-hours-day'), step = calendarTimeStep(day.getBoundingClientRect().height / 24);
      const across = ['ArrowLeft', 'ArrowRight'].includes(e.key);
      const minute = timeMinutes(t[`${timeEnd}_time`]) + (across ? 0 : e.key === 'ArrowDown' ? step : -step);
      const target = shiftDate(t[timeEnd], across ? e.key === 'ArrowRight' ? 1 : -1 : Math.floor(minute / 1440));
      void save(t.id, calendarTimeResize(t, target, (minute % 1440 + 1440) % 1440, timeEnd, step), `[data-calendar-card="${CSS.escape(t.id)}"] [data-calendar-time-end="${timeEnd}"]`);
      return;
    }
    if (t && !sourceReadOnly(t,"due") && timedCard(t) && e.altKey && ['ArrowUp','ArrowDown'].includes(e.key) && card.matches('.calendar-timed-card')) {
      e.preventDefault(); e.stopImmediatePropagation();
      const step = calendarTimeStep(card.closest('.calendar-hours-day').getBoundingClientRect().height / 24);
      void save(t.id, calendarTimeMove(t, t.start, timeMinutes(t.start_time) + (e.key === 'ArrowDown' ? step : -step), 0, step), `[data-calendar-card="${CSS.escape(t.id)}"] .calendar-card-title`);
      return;
    }
    if (!range || sourceReadOnly(t,"due") || !(handle || e.altKey) || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const from = handle === "due" ? range.end : range.start;
    const selector = `[data-calendar-card="${CSS.escape(t.id)}"] ${handle ? `[data-calendar-end="${handle}"]` : '[data-action="task-open"]'}`;
    void save(t.id, calendarDateChange(t, from, shiftDate(from, e.key === "ArrowLeft" ? -1 : 1), handle), selector);
  }, true);
  document.addEventListener("change", e => {
    if (e.target.id === "calendar-mode") { mode = e.target.value; storage.set("calendar-mode", mode); renderView(true); }
    if (e.target.id === "week-board-rows") { boardRows = e.target.value; storage.set("week-board-rows", boardRows); renderView(true); }
  });
  function click(action, el) {
    if (action === "month-prev" || action === "month-next") {
      const direction = action === "month-prev" ? -1 : 1;
      if (mode === "agenda") picked = shiftAgendaRange(agendaRange({ quick, ...picked }, localDate()), direction);
      else if (mode === "week" || mode === "board") anchor = shiftDate(anchor, direction * 7);
      else { const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); anchor = dateKey(date.getTime()); }
      renderView(true); return true;
    }
    if (action === "date-task") { ctx.taskDialog(null, { due: el.dataset.date }); return true; }
    return false;
  }
  return { render, click };
}
