import { sourceReadOnly } from "./source-model.js";
import { calendarHoursHTML, calendarHourSelection } from "./calendar-hours.js";
import { calendarZoom } from "./calendar-zoom.js";
import { timedCard, calendarTimeMove, calendarTimeSelection, calendarTimeResize, calendarTimeStep, hourlySegments, minuteTime, timeMinutes, DAYPARTS, daypart, daypartChange } from "./calendar-time.js";
import { anchoredPanel } from "./anchored-panel.js";
import { mainWidth } from "./layout-width.js";
import { calendarRange, calendarDateChange, calendarWeeks, isoWeek, agendaGroups, AGENDA_RANGES, agendaRange, shiftAgendaRange } from "./calendar-model.js";
import { naturalGroups, inGroup, groupPreference, orderGroups, groupReorderHandle, weekBoardGroups } from "./task-group-order.js";
import { groupedTaskPatch, orderTasks } from "./task-order-model.js";
import { projectPeople } from "./teams.js";
import { fieldOn } from "./card-fields.js";
import { priorityLabel } from "./task-priority.js";
import { statusLabel } from "./workflow-model.js";
import { dateKey, shiftDate, stamp, DAY, weekStart, isWeekend } from "./timeline-dates.js";
import { localDate } from "./task-visibility.js";
import { taskColorDot, taskFieldColor } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";
import { rangeChoicesHTML, rangeLabelHTML } from "./range-menu.js";
import { slideMoves } from "./slide-moves.js";
import { backlogPosition, snapToBoard, nextLayer } from "./calendar-backlog.js";

export function calendarView(ctx) {
  const { state, esc, icon, storage, renderView, task, patchTask, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  const unscheduled = anchoredPanel(ctx);
  calendarHourSelection(ctx);
  const zoom = calendarZoom(ctx);
  let mode = storage.get("calendar-mode", mainWidth() <= 780 ? "agenda" : "month");
  let quick = storage.get("agenda-range", { day: "today", week: "this-week", month: "this-month" }[storage.get("agenda-period", "week")] || "this-week"), picked = null, anchor = localDate();
  let weekends = storage.get("calendar-weekends", true) !== false, undated = [], shownTasks = [];
  // The Week board's Unscheduled board (F0.22-54) holds every card with no dates that isn't done.
  // Cards without a place there flow in turn by when they were made, so the view's sort doesn't move them.
  const backlogCards = () => state.tasks.filter(t => !calendarRange(t) && !t.archived && !state.config.done.includes(t.status)).sort((a, b) => String(a.created ?? "").localeCompare(String(b.created ?? "")) || a.id.localeCompare(b.id));
  const backlogKeys = 'aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"';
  // A card moved on the board goes above the others; one already on top stays at its layer.
  const topLayer = id => nextLayer(state.tasks.filter(t => t.id !== id));
  // The board's height, dragged from its head or set with Up and Down, kept in this browser; the
  // stylesheet keeps it to 70% of the view.
  const BACKLOG_MIN = 96, BACKLOG_MAX = 1200;
  const backlogFit = value => Math.round(Math.max(BACKLOG_MIN, Math.min(BACKLOG_MAX, Number(value) || 200)));
  let backlogHeight = backlogFit(storage.get("week-board-backlog-height", 200)), drawnFor = null;
  // Week board rows: a card field or tag, or one row for every card (Group by: F0.21-91).
  let boardRows = storage.get("week-board-rows", "assignee");
  const ROW_FIELDS = [["assignee", "Assignee"], ["status", "Status"], ["priority", "Priority"], ["type", "Card type"], ["tags", "Tag"], ["daypart", "Time of day"], ["none", "No grouping"]];
  // Times of day need both dates (F0.22-48).
  const rowOn = key => key === "none" || (key === "daypart" ? fieldOn(state.config, "start") && fieldOn(state.config, "due") : fieldOn(state.config, key));
  const rowField = () => ROW_FIELDS.some(([key]) => key === boardRows) && rowOn(boardRows) ? boardRows : "none";
  let drag = null, suppressUntil = 0, suppressId = "";
  // Month scrolls through whole months: a run of weeks around the anchor, extended near either end (F0.21-96).
  // `origin` is the day last chosen (heading arrows, picker, layout); scrolling only moves the anchor to another
  // month's 1st. `pinned` is a picked day's week, kept as the heading's month until the scroll leaves it.
  let span = null, recenter = true, scrollFrame = 0, origin = anchor, pinned = null;
  const setAnchor = (day, pin = null) => { anchor = origin = day; recenter = true; pinned = pin; };
  const monthSpan = day => {
    const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7)) - 1, from = dateKey(Date.UTC(y, m - 3, 1));
    return { from, count: Math.ceil((stamp(dateKey(Date.UTC(y, m + 4, 1))) - weekStart(from)) / (7 * DAY)) };
  };
  const monthScroll = () => document.querySelector('.calendar-scroll:has(> .calendar[data-layout="month"])');
  const headBottom = sc => sc.querySelector(".calendar-weekdays").getBoundingClientRect().bottom;
  // The first week not scrolled under the weekday header, and how far below it that week starts.
  function monthPosition() {
    const sc = monthScroll(), top = sc && headBottom(sc), week = sc && [...sc.querySelectorAll(".calendar-week")].find(w => w.getBoundingClientRect().bottom > top + 1);
    return week ? { week: week.dataset.week, offset: week.getBoundingClientRect().top - top } : null;
  }
  function scrollToWeek(position) {
    const sc = monthScroll(), el = position && sc?.querySelector(`.calendar-week[data-week="${position.week}"]`);
    if (!el) return false;
    sc.scrollTop += el.getBoundingClientRect().top - headBottom(sc) - (position.offset || 0);
    return true;
  }
  const monthStartWeek = () => dateKey(weekStart(`${anchor.slice(0, 7)}-01`));
  const format = (day, options = {}) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", ...options });
  const rangeLabel = t => { const r = calendarRange(t); return r ? `${r.start === r.end ? format(r.start) : `${format(r.start)} – ${format(r.end)}`}${timedCard(t) ? ` · ${t.start_time} – ${t.due_time}` : ""}` : "Set dates"; };
  const title = t => `${t.key ? `${t.key} ` : ""}${t.title}`;
  // The key apart, so the Card IDs button can hide it (F0.22-61).
  const titleHTML = t => `${t.key ? `<span class="card-key">${esc(t.key)}</span> ` : ""}${esc(t.title)}`;
  const isDone = t => state.config.done.includes(t.status);
  function dateButton(t) {
    return `<button type="button" class="button small calendar-dates" data-calendar-dates="${esc(t.id)}" aria-label="Edit dates for ${esc(t.title)}" aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span>${esc(rangeLabel(t))}</span></button>`;
  }
  function row(t, unscheduled = false) {
    const grip = unscheduled && !sourceReadOnly(t,"due") ? `<button type="button" class="icon-button calendar-move" data-calendar-move aria-label="Schedule ${esc(t.title)}" title="Drag onto a day, or tap to set dates">${icon("drag")}</button>` : "";
    return `<div class="agenda-row ${grip ? "calendar-draggable-row" : ""}${isDone(t) ? " card-done" : ""}" data-calendar-card="${esc(t.id)}">${grip}<button type="button" class="agenda-task" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}">${taskColorDot(state, "status", t.status)}<span>${titleHTML(t)}</span></button>${unscheduled ? dateButton(t) : ctx.inlineTaskFields(t, "agenda-fields", rangeLabel(t))}</div>`;
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
    const value = t => field === "none" ? "" : field === "priority" ? t.priority || "none" : field === "daypart" ? daypart(t) : t[field] || "";
    const inRow = (t, row) => field === "tags" ? inGroup(t, field, row) : value(t) === row;
    // The row for no value (Unassigned, No tag, No type) shows only while it holds a card (F0.22-29),
    // or is the only row, so an empty board still has cells to drop cards on.
    // In the order the rows were dragged into, if they were (F0.22-47).
    const { order, dir } = groupPreference(storage, state.project.id, weekBoardGroups(field));
    const rows = field === "none" ? [""] : orderGroups(field === "daypart" ? DAYPARTS.map(([key]) => key) : field === "tags" ? naturalGroups(field, placed, state.config) : naturalGroups(field, placed.map(t => ({ [field]: value(t) })), state.config, projectPeople(state).map(p => p.name)), order, dir)
      .filter((row, _, all) => row || all.length === 1 || placed.some(t => inRow(t, row)));
    const name = value => field === "status" ? statusLabel(state.config, value) : field === "priority" ? priorityLabel(value) : field === "tags" ? value || "No tag" : field === "daypart" ? DAYPARTS.find(([key]) => key === value)?.[1] : value ? ctx.label(value) : field === "type" ? "No type" : "Unassigned";
    const card = (t, { keys = "", place = "", dated = false } = {}) => `<article class="week-board-card${dated ? " week-board-dated" : ""}${isDone(t) ? " card-done" : ""}" data-calendar-card="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)}${place}"><button type="button" class="week-board-title" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}" ${keys}>${titleHTML(t)}</button>${ctx.inlineTaskFields(t, "week-board-fields", rangeLabel(t))}</article>`;
    // The Unscheduled board (F0.22-54), docked under the week: the matching cards with no dates that
    // aren't done, each where it was put (in reading order for the keyboard), the rest flowing in turn.
    // By time of day, the week's cards without times wait there first, by day, with their dates (F0.22-56).
    const shown = new Set(tasks.map(t => t.id)), loose = backlogCards().filter(t => shown.has(t.id)), untimed = field === "daypart" ? placed.filter(t => !daypart(t)) : [];
    const at = new Map(loose.map(t => [t.id, backlogPosition(t.backlog)])), kept = loose.filter(t => at.get(t.id)).sort((a, b) => at.get(a.id).y - at.get(b.id).y || at.get(a.id).x - at.get(b.id).x);
    const far = axis => Math.max(0, ...kept.map(t => at.get(t.id)[axis])), flow = [...untimed, ...loose.filter(t => !at.get(t.id))];
    const backlog = `<section class="week-board-backlog" aria-labelledby="week-board-backlog-title" style="height:${backlogHeight}px"><div class="week-board-backlog-head"><h3 id="week-board-backlog-title">Unscheduled</h3><div class="week-board-backlog-resize" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="Resize Unscheduled" aria-valuemin="${BACKLOG_MIN}" aria-valuemax="${BACKLOG_MAX}" aria-valuenow="${backlogHeight}" title="Drag, or press Up and Down, to resize"><span></span></div></div><div class="week-board-backlog-board"><div class="week-board-backlog-canvas" style="--backlog-right:${far("x")}px;--backlog-bottom:${far("y")}px">${flow.length ? `<div class="week-board-backlog-flow">${flow.map(t => card(t, { keys: backlogKeys, dated: !!calendarRange(t) })).join("")}</div>` : ""}${kept.map(t => { const p = at.get(t.id); return card(t, { keys: backlogKeys, place: `;left:${p.x}px;top:${p.y}px;z-index:${p.z}` }); }).join("")}${flow.length || kept.length ? "" : '<p class="field-hint week-board-backlog-empty">Drop a card here to take it off the calendar.</p>'}</div></div></section>`;
    // A table to assistive technology: days are column headers, rows' names row headers.
    return `${placed.length ? "" : '<p class="field-hint week-board-empty">No cards scheduled this week.</p>'}<div class="calendar-scroll week-board-scroll" role="region" aria-label="Week board" tabindex="0"><div class="week-board" role="table" aria-label="Week board" data-rows="${field}" style="--week-board-days:${days.length}"><div class="week-board-head-row" role="row"><div class="week-board-corner" role="columnheader"><span class="sr-only">${field === "none" ? "Cards" : esc(ROW_FIELDS.find(([key]) => key === field)[1])}</span></div>${days.map(day => `<div class="week-board-day-head${day === localDate() ? " today" : ""}${isWeekend(day) ? " weekend" : ""}" role="columnheader" data-calendar-date="${day}"><time datetime="${day}">${esc(format(day, { weekday: "short" }))}</time></div>`).join("")}</div>${rows.map(row => {
      return `<div class="week-board-row" role="row" data-week-board-value="${esc(row)}"><div class="week-board-row-head" role="rowheader"${field === "none" ? "" : ` aria-label="${esc(name(row))}"`}>${field === "none" ? '<span class="sr-only">All cards</span>' : `${groupReorderHandle(row, name(row), esc)}<span>${esc(name(row))}</span>`}</div>${days.map(day => `<div class="week-board-cell${isWeekend(day) ? " weekend" : ""}" role="cell" data-calendar-date="${day}" data-week-board-value="${esc(row)}">${(byDay.get(day) || []).filter(t => inRow(t, row)).map(t => card(t)).join("")}</div>`).join("")}</div>`;
    }).join("")}</div></div>${backlog}`;
  }
  const weekHTML = week => `<div class="calendar-week ${mode === "week" ? "calendar-all-day" : ""}" data-week="${week.days[0]}" style="--calendar-lanes:${week.lanes}">${mode === "month" ? `<span class="calendar-week-number" title="Week ${isoWeek(week.days[0])}" aria-label="Week ${isoWeek(week.days[0])}">${isoWeek(week.days[0])}</span>` : ""}${week.days.map((day, i) => `<div class="calendar-day ${isWeekend(day) ? "weekend" : ""} ${day === localDate() ? "today" : ""} ${mode === "month" && (Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7))) % 2 ? "month-alt" : ""}" data-calendar-date="${day}" style="grid-column:${i + 1};grid-row:1 / span ${week.lanes + 1}"><button type="button" data-feature="date-task" data-date="${day}" aria-label="Add card on ${day}">${Number(day.slice(-2))}${mode === "month" && day.endsWith("-01") ? ` ${esc(format(day, { day: undefined }))}` : ""}</button></div>`).join("")}${week.segments.map(s => {
      const t = s.task;
      const handle = (end, show) => show && !sourceReadOnly(t,"due") ? `<button type="button" class="calendar-resize" data-calendar-end="${end}" aria-label="Adjust ${end === "start" ? "start" : "end"} date for ${esc(t.title)}" title="Drag to adjust ${end === "start" ? "start" : "end"} date; arrow keys change by one day"><span aria-hidden="true"></span></button>` : "";
      return `<div class="calendar-task${isDone(t) ? " card-done" : ""}" data-calendar-card="${esc(t.id)}" data-id="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)};grid-column:${s.from + 1} / ${s.to + 2};grid-row:${s.lane + 2}" title="${esc(title(t))} · ${s.range.start} – ${s.range.end}${sourceReadOnly(t,"due") ? ' · Dates managed by source' : ' · Drag to move'}">${handle("start", s.resizeStart)}<button type="button" class="calendar-card-title" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(title(t))}">${esc(t.title)}</button>${handle("due", s.resizeEnd)}</div>`;
    }).join("")}</div>`;
  // The heading opens the shared date picker; choosing a day shows the period holding it.
  const periodHeading = heading => mode === "agenda" ? `<h2>${esc(heading)}</h2>` : `<h2 class="date-field period-field">${esc(heading)}<input type="date" class="period-date" value="${anchor}" aria-label="${esc(heading)}" required hidden><button type="button" class="date-picker-trigger" data-date-picker aria-label="Choose date" title="Choose date" aria-haspopup="dialog" aria-expanded="false"></button></h2>`;
  function render(tasks) {
    unscheduled.close();
    shownTasks = tasks;
    // The Unscheduled board stays scrolled where it was when the project's board is drawn again.
    const board = drawnFor === state.project?.id && document.querySelector(".week-board-backlog-board"), scrolled = board && [board.scrollLeft, board.scrollTop];
    drawnFor = state.project?.id;
    if (scrolled) queueMicrotask(() => { const el = document.querySelector(".week-board-backlog-board"); if (el) [el.scrollLeft, el.scrollTop] = scrolled; });
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
    const keep = mode === "month" && !recenter && monthPosition();
    if (mode === "month" && (recenter || !span)) span = monthSpan(anchor);
    recenter = false;
    const weeks = calendarWeeks(mode === "week" ? tasks.filter(t => !timedCard(t)) : tasks, anchor, weekends, mode === "week" ? { week: true } : mode === "month" ? span : undefined);
    if (mode === "month") queueMicrotask(() => { if (!(keep && scrollToWeek(keep))) scrollToWeek({ week: pinned || monthStartWeek() }); });
    const month = `<div class="calendar-scroll" role="region" aria-label="Calendar ${mode === "week" ? "week" : "month"}" tabindex="0"><div class="calendar ${mode === "week" ? "calendar-hourly" : ""}" data-layout="${mode}" data-weekends="${weekends}" style="--calendar-columns:${weekends ? 7 : 5}"><div class="calendar-weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", ...(weekends ? ["Sat", "Sun"] : [])].map(day => `<strong>${day}</strong>`).join("")}</div>${mode === "week" ? '<div class="calendar-all-day-scroll">' : ""}${weeks.map(weekHTML).join("")}${mode === "week" ? "</div>" : ""}${mode === "week" ? calendarHoursHTML(tasks, weeks[0].days, ctx) : ""}</div></div>`;
    zoom.restore();
    return { controls: `<button type="button" class="button small" data-calendar-unscheduled data-after-filters aria-label="Unscheduled cards (${undated.length})" title="Unscheduled cards (${undated.length})" aria-haspopup="dialog" aria-expanded="false">${icon("clock")}<span>${undated.length}</span></button><div class="planning-head"><div class="planning-period"><button class="icon-button" data-feature="month-prev" aria-label="Previous period" title="Previous period">${icon("arrow")}</button>${periodHeading(heading)}<button class="icon-button" data-feature="month-next" aria-label="Next period" title="Next period">${icon("arrow")}</button></div><div class="planning-options" data-phone-options>${mode === "week" ? zoom.controls() : mode === "agenda" ? rangePicker(range, heading) : mode === "board" ? `<label><span class="control-label">Group by</span><select id="week-board-rows" aria-label="Group by">${ROW_FIELDS.filter(([key]) => rowOn(key)).map(([key, name]) => `<option value="${key}" ${key === rowField() ? "selected" : ""}>${name}</option>`).join("")}</select></label>` : ""}${mode !== "month" ? '<span class="planning-separator" aria-hidden="true"></span>' : ""}<button type="button" id="calendar-weekends" class="icon-button" data-calendar-weekends data-weekends-toggle aria-label="Show weekends" aria-pressed="${weekends}" title="${weekends ? "Hide weekends" : "Show weekends"}">${icon("calendar-weekends")}</button><label><span class="control-label">Layout</span> <select id="calendar-mode"><option value="month" ${mode === "month" ? "selected" : ""}>Month</option><option value="week" ${mode === "week" ? "selected" : ""}>Week</option><option value="board" ${mode === "board" ? "selected" : ""}>Week board</option><option value="agenda" ${mode === "agenda" ? "selected" : ""}>Agenda</option></select></label></div></div>`, html: `${empty}${mode === "agenda" ? agenda : mode === "board" ? weekBoard(tasks, from, to) : month}<span class="sr-only" data-calendar-announcement role="status" aria-live="polite"></span>` };
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
    const board = mode === "board" && !d.handle && hit?.closest(".week-board-backlog")?.querySelector(".week-board-backlog-canvas");
    // Onto the Unscheduled board, where the card was let go, to the nearest 8 px: its dates and times go.
    if (board) {
      const r = board.getBoundingClientRect();
      return { ...(calendarRange(d.task) ? { start: null, due: null, start_time: null, due_time: null } : {}), backlog: { x: snapToBoard(x - r.left - d.grab.x), y: snapToBoard(y - r.top - d.grab.y) } };
    }
    const day = dayAt(x, y);
    if (!day) return null;
    const change = calendarDateChange(d.task, d.grabbed, day, d.handle), row = mode === "board" && !d.handle && hit?.closest(".week-board-cell");
    const current = rowField() === "tags" ? d.fromRow : rowField() === "priority" ? d.task.priority || "none" : rowField() === "daypart" ? daypart(d.task) : d.task[rowField()] || "";
    if (row && rowField() !== "none" && current !== row.dataset.weekBoardValue) {
      try { Object.assign(change, rowField() === "daypart" ? daypartChange({ ...d.task, ...change }, row.dataset.weekBoardValue) : groupedTaskPatch(state.config, state.tasks, d.task.id, rowField(), row.dataset.weekBoardValue, d.fromRow)); }
      catch (error) { d.reason = error.message; return null; }
    }
    return change;
  }
  // Over a Week board row's or day's name the landing place stays where it was, and a drop there
  // lands in it (F0.22-9).
  function landing(d, x, y) {
    return dropChange(d, x, y) || (mode === "board" && !d.reason && document.elementFromPoint(x, y)?.closest(".week-board-row-head, .week-board-day-head") ? d.next ?? null : null);
  }
  function clearPlacement(d) {
    d.placements?.forEach(el => el.remove());
    d.weekLanes?.forEach(([el, lanes]) => el.style.setProperty('--calendar-lanes', lanes));
    d.placements = []; d.weekLanes = [];
  }
  // Where a drop lands in a Week board cell (F0.22-45): before the first card whose middle is below
  // the pointer, among the cell's cards other than the one moving.
  function cellSlot(cell, y, id) {
    const cards = [...cell.querySelectorAll(".week-board-card[data-calendar-card]")].filter((el) => el.dataset.calendarCard !== id);
    const before = cards.find((el) => { const r = el.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { ids: cards.map((el) => el.dataset.calendarCard), before: before?.dataset.calendarCard ?? null };
  }
  // A card dropped in a Week board cell keeps the place it was dropped at, as in Kanban: the rank
  // changes that put the cell's cards in that order.
  // The Week board cell a drop lands in and its place there, read with the landing place where it is
  // shown: hit-testing again once it's taken out would find the cell below and chase it there.
  function boardSlot(d, x, y) {
    if (mode !== "board") return;
    const cell = d.next && !d.next.backlog && document.elementFromPoint(x, y)?.closest(".week-board-cell");
    if (cell) { d.cell = cell; d.slot = cellSlot(cell, y, d.task.id); }
    else if (!d.next || d.next.backlog) d.cell = d.slot = null;
  }
  function cellOrder(d) {
    const { ids, before } = d.slot, at = before ? ids.indexOf(before) : ids.length;
    return orderTasks(state.tasks, [...ids.slice(0, at), d.task.id, ...ids.slice(at)]);
  }
  function placement(d, next) {
    const key = JSON.stringify([d.next, d.slot?.before]);
    if (d.placementKey === key) return;
    d.placementKey = key;
    // The Week board rows the landing place pushes slide to their new places (F0.22-9).
    const board = mode === 'board' && document.querySelector('.week-board');
    if (board) slideMoves([...board.querySelectorAll('.week-board-cell, .week-board-row-head, .week-board-card:not(.calendar-placement)')], () => place(d, next));
    else place(d, next);
  }
  function place(d, next) {
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
      calendarWeeks(mode === 'week' ? items.filter(t => !timedCard(t)) : items, anchor, weekends, mode === 'week' ? { week: true } : span).forEach((week, i) => {
        const s = week.segments.find(s => s.task.id === next.id); if (!s) return;
        const el = weeks[i], lanes = el.style.getPropertyValue('--calendar-lanes');
        d.weekLanes.push([el, lanes]); el.style.setProperty('--calendar-lanes', Math.max(Number(lanes), s.lane + 1));
        const bar = add(el, 'calendar-task'); bar.style.gridColumn = `${s.from + 1} / ${s.to + 2}`; bar.style.gridRow = s.lane + 2;
      });
    } else if (mode === 'board' && d.next.backlog) {
      const board = document.querySelector('.week-board-backlog-canvas'), { x, y } = d.next.backlog;
      if (board) Object.assign(add(board, 'week-board-card').style, { left: `${x}px`, top: `${y}px` });
    } else if (mode === 'board') {
      const target = d.cell;
      const before = d.slot?.before && target?.querySelector(`.week-board-card[data-calendar-card="${CSS.escape(d.slot.before)}"]`);
      if (target) target.insertBefore(add(target, 'week-board-card'), before || null);
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
    // The Unscheduled board scrolls both ways near its edges.
    const backlogBoard = mode === "board" ? document.querySelector(".week-board-backlog-board") : null, b = backlogBoard?.getBoundingClientRect();
    if (b && d.x >= b.left && d.x <= b.right && d.y >= b.top && d.y <= b.bottom) {
      backlogBoard.scrollLeft += d.x > b.right - 30 ? 10 : d.x < b.left + 30 ? -10 : 0;
      backlogBoard.scrollTop += d.y > b.bottom - 24 ? 12 : d.y < b.top + 24 ? -12 : 0;
    }
    d.next = landing(d, d.x, d.y);
    boardSlot(d, d.x, d.y);
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
    d.ghost.querySelector("small").textContent = d.hours ? range ? `${range.start !== range.end ? `${range.start} ${next.start_time} → ${range.end} ${next.due_time}` : `${next.start_time} – ${next.due_time}`} · ${d.step} min steps` : 'Release to cancel' : cancel ? "Keep unscheduled" : range ? `${range.start}${d.next.start_time ? ` · ${d.next.start_time} – ${d.next.due_time}` : ` → ${range.end}`}` : d.next?.backlog ? "Unscheduled" : "Move over a day to schedule";
    d.ghost.firstElementChild.classList.toggle("invalid", !range && !cancel && !d.next?.backlog);
    d.ghost.style.left = `${Math.max(8, Math.min(innerWidth - d.ghost.offsetWidth - 8, d.x + 16))}px`;
    d.ghost.style.top = `${Math.max(8, Math.min(innerHeight - d.ghost.offsetHeight - 8, d.y + 18))}px`;
    d.frame = requestAnimationFrame(preview);
  }
  // Whether the change was saved.
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
      return true;
    }
    catch (error) { toast(error.message, true); renderView(true); return false; }
  }
  function finish(cancel = false) {
    const d = drag; if (!d) return;
    drag = null; state.toolDragging = false;
    cancelAnimationFrame(d.frame); clearTimeout(d.hold);
    document.removeEventListener("touchmove", holdScroll, true);
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
    document.querySelectorAll(".calendar-dragging,.calendar-drop-target,.calendar-armed").forEach(el => el.classList.remove("calendar-dragging", "calendar-drop-target", "calendar-armed"));
    if (d.active || d.handle || d.armed) { suppressUntil = performance.now() + 500; suppressId = d.task.id; }
    if (!cancel && !d.active && d.handle) editDates(d.task.id, d.card.querySelector("[data-calendar-end], [data-calendar-time-end]"));
    const changes = !cancel && d.active && d.next ? { ...d.next } : null;
    // The layer once, on the drop, rather than on every frame of the drag.
    if (changes?.backlog) changes.backlog = { ...changes.backlog, z: topLayer(d.task.id) };
    const ranks = changes && d.slot ? cellOrder(d) : [];
    // The board shows the manual order from now on, as Kanban does after a move, even when the
    // ranks already give the order the card was dropped in.
    const resort = !!(changes && d.slot) && (state.sort !== "order" || state.sortDir !== 1);
    if (changes && d.slot) {
      state.sort = "order"; state.sortDir = 1;
      storage.set(`sort:${state.project.id}`, "order");
    }
    for (const { id, order } of ranks)
      if (id === d.task.id) changes.order = order;
      else patchTask(id, { order }, false).catch((error) => toast(error.message, true));
    if (changes && Object.entries(changes).some(([key, value]) => JSON.stringify(d.task[key] ?? null) !== JSON.stringify(value ?? null))) void save(d.task.id, changes);
    else if (ranks.length || resort) renderView(true);
    else if (!cancel && d.active && d.reason) toast(d.reason, true);
  }
  document.addEventListener("pointerdown", e => {
    if (drag && e.pointerId !== drag.pointer) { finish(true); return; }
    const card = e.target.closest("[data-calendar-card]");
    if (!card || state.view !== "calendar" || e.button !== 0 || e.target.closest("[data-calendar-dates], .agenda-fields, .week-board-fields")) return;
    if (e.pointerType === "touch" && card.matches(".agenda-row") && !e.target.closest("[data-calendar-move]")) return;
    const t = task(card.dataset.calendarCard); if (!t || sourceReadOnly(t,"due")) return;
    const timeEnd = e.target.closest('[data-calendar-time-end]')?.dataset.calendarTimeEnd;
    const handle = timeEnd || e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    const timedDay = card.closest('.calendar-hours-day');
    const r = timedDay?.getBoundingClientRect(), box = card.getBoundingClientRect();
    const offset = timedDay ? (stamp(timedDay.dataset.calendarDate) - stamp(t.start)) / DAY * 1440 + (e.clientY - r.top) / r.height * 1440 - timeMinutes(t.start_time) : 0;
    drag = { card, grab: { x: e.clientX - box.left, y: e.clientY - box.top }, fromRow: card.closest(".week-board-cell")?.dataset.weekBoardValue ?? "", timedDay, offset, hours: timeEnd && card.closest('.calendar-hours-day'), originalStyle: card.getAttribute('style'), originalTime: card.querySelector('.calendar-event-time')?.textContent, panel: card.closest(".calendar-unscheduled"), task: { ...t }, project: state.project.id, pointer: e.pointerId, handle, grabbed: dayAt(e.clientX, e.clientY) || calendarRange(t)?.start, x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY, active: false };
    if (handle) e.preventDefault();
    // A Week board card lifts after a long press anywhere on it; moving first scrolls as usual.
    if (e.pointerType === "touch" && card.matches(".week-board-card")) drag.hold = setTimeout(() => {
      if (drag?.card !== card) return;
      drag.armed = true; card.classList.add("calendar-armed"); navigator.vibrate?.(10);
      document.addEventListener("touchmove", holdScroll, { capture: true, passive: false });
    }, 350);
  }, true);
  // Only while a card is lifted, so every other touch scroll stays passive.
  const holdScroll = e => { if (e.cancelable) e.preventDefault(); };
  document.addEventListener("pointermove", e => {
    const d = drag; if (!d || d.pointer !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (d.hold && !d.armed) { // moving before the press is long enough scrolls
      if (Math.hypot(d.x - d.originX, d.y - d.originY) > 8) { clearTimeout(d.hold); drag = null; }
      return;
    }
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
      // A copy of the card as it looks in this view, with the dates being chosen under it.
      const r = d.card.getBoundingClientRect(), copy = d.card.cloneNode(true);
      copy.classList.remove("calendar-dragging", "calendar-time-resizing");
      copy.classList.add("drag-ghost");
      for (const el of [copy, ...copy.querySelectorAll("[id], [data-calendar-card], [data-action]")]) for (const name of ["id", "data-id", "data-calendar-card", "data-action"]) el.removeAttribute(name);
      copy.removeAttribute("style");
      Object.assign(copy.style, { position: "relative", inset: "auto", margin: "0", width: `${Math.min(r.width, 320)}px`, height: `${r.height}px` });
      d.ghost = document.createElement("div"); d.ghost.className = "calendar-drag-preview calendar";
      d.ghost.inert = true; d.ghost.setAttribute("aria-hidden", "true");
      d.ghost.append(copy, Object.assign(document.createElement("small"), { className: "calendar-drag-hint" }));
      document.body.append(d.ghost); preview();
    }
    if (d.active) e.preventDefault();
  }, true);
  document.addEventListener("pointerup", e => {
    if (drag?.pointer !== e.pointerId) return;
    if (drag.active) {
      drag.next = landing(drag, e.clientX, e.clientY);
      boardSlot(drag, e.clientX, e.clientY);
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
    // Alt and an arrow moves a card on the Unscheduled board 8 px, with Shift 64 px, and brings it to the top.
    if (card.closest(".week-board-backlog") && t && !sourceReadOnly(t, "due") && e.altKey && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault(); e.stopImmediatePropagation();
      // From the card as it is now, not as last drawn: a second press can come before the redraw.
      // A card with dates flows there whatever place it keeps for later; moving it takes the dates away, as a drop does.
      const from = (!range && backlogPosition(t.backlog)) || { x: card.offsetLeft, y: card.offsetTop }, step = e.shiftKey ? 64 : 8;
      const place = { x: snapToBoard(from.x + step * ((e.key === "ArrowRight") - (e.key === "ArrowLeft"))), y: snapToBoard(from.y + step * ((e.key === "ArrowDown") - (e.key === "ArrowUp"))), z: topLayer(t.id) };
      const direction = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[e.key];
      if (place.x === snapToBoard(from.x) && place.y === snapToBoard(from.y)) {
        document.querySelector("[data-calendar-announcement]").textContent = `${t.title} is at the edge of Unscheduled.`;
        return;
      }
      void save(t.id, { ...(range ? { start: null, due: null, start_time: null, due_time: null } : {}), backlog: place }, `[data-calendar-card="${CSS.escape(t.id)}"] .week-board-title`).then(ok => {
        const el = ok && document.querySelector("[data-calendar-announcement]");
        if (el) el.textContent = `${t.title} moved ${direction} on Unscheduled.`;
      });
      return;
    }
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
  // The Unscheduled board's head drags its height; the board is looked up each time, as a redraw replaces it.
  function setBacklogHeight(value) {
    const panel = document.querySelector(".week-board-backlog");
    if (!panel) return;
    panel.style.height = `${backlogFit(value)}px`;
    backlogHeight = backlogShown();
    panel.querySelector(".week-board-backlog-resize").setAttribute("aria-valuenow", backlogHeight);
  }
  // As drawn, which a small window may hold below the height kept.
  const backlogShown = () => Math.round(document.querySelector(".week-board-backlog")?.getBoundingClientRect().height || backlogHeight);
  let resize = null;
  document.addEventListener("pointerdown", e => {
    const head = e.button === 0 && state.view === "calendar" && e.target.closest(".week-board-backlog-head");
    if (!head) return;
    e.preventDefault();
    resize = { pointer: e.pointerId, y: e.clientY, height: backlogShown() };
    head.setPointerCapture(e.pointerId);
  });
  const resized = e => { if (resize?.pointer !== e.pointerId) return; resize = null; storage.set("week-board-backlog-height", backlogHeight); };
  // A release the page never heard of (outside the window, or after a redraw took the head) ends it too.
  document.addEventListener("pointermove", e => { if (resize?.pointer === e.pointerId) e.buttons ? setBacklogHeight(resize.height + resize.y - e.clientY) : resized(e); });
  document.addEventListener("pointerup", resized);
  document.addEventListener("pointercancel", resized);
  document.addEventListener("keydown", e => {
    const step = e.target.closest?.(".week-board-backlog-resize") && { ArrowUp: 16, ArrowDown: -16 }[e.key];
    if (!step) return;
    e.preventDefault(); e.stopPropagation();
    setBacklogHeight(backlogShown() + step * (e.shiftKey ? 4 : 1));
    storage.set("week-board-backlog-height", backlogHeight);
  });
  document.addEventListener("change", e => {
    if (e.target.id === "calendar-mode") { mode = e.target.value; recenter = true; pinned = null; storage.set("calendar-mode", mode); renderView(true); }
    if (e.target.id === "week-board-rows") { boardRows = e.target.value; storage.set("week-board-rows", boardRows); renderView(true); }
  });
  // The heading follows the month most in view, and more weeks load before either end is reached.
  function monthScrolled(sc) {
    scrollFrame = 0;
    if (mode !== "month" || state.view !== "calendar" || !sc.isConnected) return;
    // The month of the first week in view's last day: the week holding a 1st at the top names that month.
    const head = headBottom(sc), week = [...sc.querySelectorAll(".calendar-week")].find(w => w.getBoundingClientRect().bottom > head + 1);
    if (pinned && week?.dataset.week !== pinned) pinned = null;
    const shown = week && shiftDate(week.dataset.week, 6).slice(0, 7);
    if (!pinned && shown && shown !== anchor.slice(0, 7)) {
      anchor = shown === origin.slice(0, 7) ? origin : `${shown}-01`;
      const heading = document.querySelector(".planning-period h2");
      if (heading) {
        const text = new Date(`${anchor}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
        heading.firstChild.textContent = text;
        Object.assign(heading.querySelector("input"), { value: anchor });
        heading.querySelector("input").setAttribute("aria-label", text);
      }
    }
    if (drag?.active) return;
    const room = sc.clientHeight * .75, before = sc.scrollTop < room, after = sc.scrollHeight - sc.scrollTop - sc.clientHeight < room;
    if (!before && !after) return;
    // Only the new weeks are added (the far end is dropped past 60 weeks), so focus and momentum stay.
    const keep = monthPosition(), more = 13, cap = 60, old = span, oldFirst = dateKey(weekStart(old.from)), oldLast = shiftDate(oldFirst, (old.count - 1) * 7);
    span = before ? { from: shiftDate(oldFirst, -more * 7), count: old.count + more } : { ...old, count: old.count + more };
    if (span.count > cap) span = before ? { ...span, count: cap } : { from: shiftDate(dateKey(weekStart(span.from)), (span.count - cap) * 7), count: cap };
    const all = calendarWeeks(shownTasks, anchor, weekends, span), keys = new Set(all.map(w => w.days[0])), calendar = sc.querySelector(".calendar");
    const html = weeks => weeks.map(weekHTML).join("");
    calendar.querySelectorAll(".calendar-week").forEach(w => { if (!keys.has(w.dataset.week)) w.remove(); });
    // The old edge week is redrawn too: a card running on past it changes which end has a grip.
    const edge = calendar.querySelector(`.calendar-week[data-week="${before ? oldFirst : oldLast}"]`), edgeWeek = all.find(w => w.days[0] === (before ? oldFirst : oldLast));
    if (edge && edgeWeek && !edge.contains(document.activeElement)) edge.outerHTML = html([edgeWeek]);
    if (before) sc.querySelector(".calendar-weekdays").insertAdjacentHTML("afterend", html(all.filter(w => w.days[0] < oldFirst)));
    else calendar.insertAdjacentHTML("beforeend", html(all.filter(w => w.days[0] > oldLast)));
    scrollToWeek(keep);
  }
  // A day chosen in the heading's picker is always shown, even the one it already holds (the picker
  // only reports a change); Month puts that day's week at the top.
  document.addEventListener("click", e => {
    const day = e.target.closest(".date-picker-popover [data-date-value]")?.dataset.dateValue;
    if (!day || mode === "agenda" || state.view !== "calendar" || !document.querySelector('.period-field [data-date-picker][aria-expanded="true"]')) return;
    setTimeout(() => { setAnchor(day, mode === "month" ? dateKey(weekStart(day)) : null); renderView(true); });
  }, true);
  document.addEventListener("scroll", e => {
    if (e.target instanceof Element && e.target.matches(".calendar-scroll") && !scrollFrame) scrollFrame = requestAnimationFrame(() => monthScrolled(e.target));
  }, true);
  function click(action, el) {
    if (action === "month-prev" || action === "month-next") {
      const direction = action === "month-prev" ? -1 : 1;
      if (mode === "agenda") picked = shiftAgendaRange(agendaRange({ quick, ...picked }, localDate()), direction);
      else if (mode === "week" || mode === "board") setAnchor(shiftDate(anchor, direction * 7));
      else { const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); setAnchor(dateKey(date.getTime())); }
      renderView(true); return true;
    }
    if (action === "date-task") { ctx.taskDialog(null, { due: el.dataset.date }); return true; }
    return false;
  }
  return { render, click };
}
