import { mainWidth } from "./layout-width.js";
import { calendarRange, calendarDateChange, calendarWeeks, agendaGroups } from "./calendar-model.js";
import { dateKey, shiftDate, weekStart, isWeekend } from "./timeline-dates.js";
import { localDate } from "./task-visibility.js";
import { taskColorDot, taskFieldColor } from "./task-colors.js";
import { taskDateEditor } from "./task-date-editor.js";

export function calendarView(ctx) {
  const { state, esc, icon, storage, renderView, task, patchTask, toast } = ctx;
  const dateEditor = taskDateEditor(ctx);
  let mode = storage.get("calendar-mode", mainWidth() <= 780 ? "agenda" : "month");
  let period = storage.get("agenda-period", "week"), anchor = localDate();
  let weekends = storage.get("calendar-weekends", true) !== false, unscheduledOpen = false;
  let drag = null, suppressUntil = 0, suppressId = "";
  const format = (day, options = {}) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", ...options });
  const rangeLabel = t => { const r = calendarRange(t); return r ? r.start === r.end ? format(r.start) : `${format(r.start)} – ${format(r.end)}` : "Set dates"; };
  const title = t => `${t.key ? `${t.key} ` : ""}${t.title}`;
  function dateButton(t) {
    return `<button type="button" class="button small calendar-dates" data-calendar-dates="${esc(t.id)}" aria-label="Edit dates for ${esc(t.title)}" aria-haspopup="dialog" aria-expanded="false">${icon("calendar")}<span>${esc(rangeLabel(t))}</span></button>`;
  }
  function row(t, unscheduled = false) {
    const grip = unscheduled && !t.source ? `<button type="button" class="icon-button calendar-move" data-calendar-move aria-label="Schedule ${esc(t.title)}" title="Drag onto a day, or tap to set dates">${icon("drag")}</button>` : "";
    return `<div class="agenda-row ${grip ? "calendar-draggable-row" : ""}" data-calendar-card="${esc(t.id)}">${grip}<button type="button" class="agenda-task" data-action="task-open" data-id="${esc(t.id)}" title="${esc(title(t))}">${taskColorDot(state, "status", t.status)}<span>${esc(title(t))}</span></button>${dateButton(t)}</div>`;
  }
  function render(tasks) {
    let from = anchor, to = anchor;
    if (period === "week") { from = dateKey(weekStart(anchor)); to = shiftDate(from, 6); }
    if (period === "month") {
      from = `${anchor.slice(0, 7)}-01`;
      const next = new Date(`${from}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
      to = shiftDate(dateKey(next.getTime()), -1);
    }
    const heading = mode === "month" || period === "month"
      ? new Date(`${anchor}T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : from === to ? format(from, { year: "numeric" }) : `${format(from)} – ${format(to, { year: "numeric" })}`;
    const undated = tasks.filter(t => !calendarRange(t));
    const groups = agendaGroups(tasks, from, to, weekends);
    const agenda = `<div class="calendar-agenda">${groups.map(([day, items]) => `<section class="agenda-day" data-calendar-date="${day}"><h3><time datetime="${day}">${esc(format(day, { weekday: "long" }))}</time></h3>${items.map(t => row(t)).join("")}</section>`).join("") || '<p class="field-hint">No cards scheduled in this period.</p>'}</div>`;
    const weeks = calendarWeeks(tasks, anchor, weekends);
    const month = `<div class="calendar-scroll" role="region" aria-label="Calendar month" tabindex="0"><div class="calendar" data-weekends="${weekends}" style="--calendar-columns:${weekends ? 7 : 5}"><div class="calendar-weekdays">${["Mon", "Tue", "Wed", "Thu", "Fri", ...(weekends ? ["Sat", "Sun"] : [])].map(day => `<strong>${day}</strong>`).join("")}</div>${weeks.map(week => `<div class="calendar-week" style="--calendar-lanes:${week.lanes}">${week.days.map((day, i) => `<div class="calendar-day ${isWeekend(day) ? "weekend" : ""} ${day === localDate() ? "today" : ""} ${day.slice(0, 7) !== anchor.slice(0, 7) ? "muted" : ""}" data-calendar-date="${day}" style="grid-column:${i + 1};grid-row:1 / span ${week.lanes + 1}"><button type="button" data-feature="date-task" data-date="${day}" aria-label="Add card on ${day}">${Number(day.slice(-2))}</button></div>`).join("")}${week.segments.map(s => {
      const t = s.task;
      const handle = (end, show) => show && !t.source ? `<button type="button" class="calendar-resize" data-calendar-end="${end}" aria-label="Adjust ${end === "start" ? "start" : "end"} date for ${esc(t.title)}" title="Drag to adjust ${end === "start" ? "start" : "end"} date; arrow keys change by one day"><span aria-hidden="true"></span></button>` : "";
      return `<div class="calendar-task" data-calendar-card="${esc(t.id)}" data-id="${esc(t.id)}" data-task-color="status" style="--task-field-color:${taskFieldColor(state, "status", t.status)};grid-column:${s.from + 1} / ${s.to + 2};grid-row:${s.lane + 2}" title="${esc(title(t))} · ${s.range.start} – ${s.range.end}${t.source ? ' · Dates managed by source' : ' · Drag to move'}">${handle("start", s.resizeStart)}<button type="button" class="calendar-card-title" data-action="task-open" data-id="${esc(t.id)}" aria-label="Open ${esc(title(t))}">${esc(t.title)}</button>${handle("due", s.resizeEnd)}</div>`;
    }).join("")}</div>`).join("")}</div></div>`;
    return `<div class="planning-head"><div class="planning-period"><button class="icon-button" data-feature="month-prev" aria-label="Previous period" title="Previous period">${icon("arrow")}</button><h2>${esc(heading)}</h2><button class="icon-button" data-feature="month-next" aria-label="Next period" title="Next period">${icon("arrow")}</button></div><div class="planning-options" data-phone-options><button type="button" class="button small" data-calendar-weekends data-weekends-toggle aria-pressed="${weekends}" title="${weekends ? "Hide" : "Show"} weekends">${icon("calendar")}<span>${weekends ? "Hide" : "Show"} weekends</span></button><label>Layout <select id="calendar-mode"><option value="month" ${mode === "month" ? "selected" : ""}>Month</option><option value="agenda" ${mode === "agenda" ? "selected" : ""}>Agenda</option></select></label>${mode === "agenda" ? `<label>Period<select id="agenda-period">${["day", "week", "month"].map(p => `<option value="${p}" ${p === period ? "selected" : ""}>${ctx.label(p)}</option>`).join("")}</select></label><input type="date" id="agenda-date" aria-label="Agenda date" value="${anchor}">` : ""}</div></div>${mode === "agenda" ? agenda : month}<details class="calendar-unscheduled" ${unscheduledOpen ? "open" : ""}><summary>Unscheduled (${undated.length})</summary><div class="calendar-unscheduled-list">${undated.map(t => row(t, true)).join("") || '<p class="field-hint">All matching cards are scheduled.</p>'}</div></details><span class="sr-only" data-calendar-announcement role="status" aria-live="polite"></span>`;
  }
  function editDates(id, trigger) {
    const project = state.project.id;
    const selector = trigger.closest(".calendar-task") ? `[data-calendar-card="${CSS.escape(id)}"] .calendar-card-title` : `[data-calendar-dates="${CSS.escape(id)}"]`;
    dateEditor.open(id, () => state.view === "calendar" && state.project?.id === project ? document.querySelector(selector) : null);
  }
  function dayAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const week = el?.closest(".calendar-week");
    if (week) {
      const bounds = week.getBoundingClientRect(), days = [...week.querySelectorAll(".calendar-day")];
      return days[Math.floor((x - bounds.left) / bounds.width * days.length)]?.dataset.calendarDate;
    }
    return el?.closest(".agenda-day")?.dataset.calendarDate;
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
    const content = document.querySelector("#view-content");
    const scroller = content.scrollHeight > content.clientHeight && /auto|scroll/.test(getComputedStyle(content).overflowY) ? content : document.scrollingElement;
    if (d.y > innerHeight - 55) scroller.scrollTop += 12;
    else if (d.y < 100) scroller.scrollTop -= 12;
    const day = dayAt(d.x, d.y);
    d.next = day ? calendarDateChange(d.task, d.grabbed, day, d.handle) : null;
    const range = d.next && calendarRange({ ...d.task, ...d.next });
    for (const cell of document.querySelectorAll("[data-calendar-date]")) {
      cell.classList.toggle("calendar-drop-target", !!range && cell.dataset.calendarDate >= range.start && cell.dataset.calendarDate <= range.end);
    }
    d.ghost.querySelector("small").textContent = range ? `${range.start} → ${range.end}` : "Move over a day to schedule";
    d.ghost.style.left = `${Math.max(8, Math.min(innerWidth - 248, d.x + 16))}px`;
    d.ghost.style.top = `${Math.max(8, Math.min(innerHeight - 75, d.y + 18))}px`;
    d.frame = requestAnimationFrame(preview);
  }
  async function save(id, changes, focusSelector = null) {
    try {
      await patchTask(id, changes);
      if (focusSelector) document.querySelector(focusSelector)?.focus({ preventScroll: true });
    }
    catch (error) { toast(error.message, true); renderView(true); }
  }
  function finish(cancel = false) {
    const d = drag; if (!d) return;
    drag = null; state.toolDragging = false;
    cancelAnimationFrame(d.frame);
    if (d.card.hasPointerCapture(d.pointer)) d.card.releasePointerCapture(d.pointer);
    d.ghost?.remove();
    document.querySelectorAll(".calendar-dragging,.calendar-drop-target").forEach(el => el.classList.remove("calendar-dragging", "calendar-drop-target"));
    if (d.active || d.handle) { suppressUntil = performance.now() + 500; suppressId = d.task.id; }
    if (!cancel && !d.active && d.handle) editDates(d.task.id, d.card.querySelector("[data-calendar-end]"));
    if (!cancel && d.active && d.next && Object.entries(d.next).some(([key, value]) => d.task[key] !== value)) void save(d.task.id, d.next);
  }
  document.addEventListener("pointerdown", e => {
    if (drag && e.pointerId !== drag.pointer) { finish(true); return; }
    const card = e.target.closest("[data-calendar-card]");
    if (!card || state.view !== "calendar" || e.button !== 0 || e.target.closest("[data-calendar-dates]")) return;
    if (e.pointerType === "touch" && card.matches(".agenda-row") && !e.target.closest("[data-calendar-move]")) return;
    const t = task(card.dataset.calendarCard); if (!t || t.source) return;
    const handle = e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    drag = { card, task: { ...t }, project: state.project.id, pointer: e.pointerId, handle, grabbed: dayAt(e.clientX, e.clientY) || calendarRange(t)?.start, x: e.clientX, y: e.clientY, originX: e.clientX, originY: e.clientY, active: false };
    if (handle) e.preventDefault();
  }, true);
  document.addEventListener("pointermove", e => {
    const d = drag; if (!d || d.pointer !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    if (!d.active && Math.hypot(d.x - d.originX, d.y - d.originY) >= 6) {
      d.active = state.toolDragging = true; dateEditor.close();
      d.card.setPointerCapture(e.pointerId);
      d.card.classList.add("calendar-dragging");
      d.ghost = document.createElement("div"); d.ghost.className = "calendar-drag-preview";
      d.ghost.innerHTML = `<strong>${esc(title(d.task))}</strong><small></small>`;
      document.body.append(d.ghost); preview();
    }
    if (d.active) e.preventDefault();
  }, true);
  document.addEventListener("pointerup", e => {
    if (drag?.pointer !== e.pointerId) return;
    if (drag.active) {
      const day = dayAt(e.clientX, e.clientY);
      drag.next = day ? calendarDateChange(drag.task, drag.grabbed, day, drag.handle) : null;
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
    const date = e.target.closest("[data-calendar-dates]"), handle = e.target.closest("[data-calendar-end], [data-calendar-move]");
    if (date || handle) { e.preventDefault(); e.stopImmediatePropagation(); editDates(date?.dataset.calendarDates || handle.closest("[data-calendar-card]").dataset.calendarCard, date || handle); }
  }, true);
  document.addEventListener("keydown", e => {
    if (drag && e.key === "Escape") { e.preventDefault(); finish(true); return; }
    const card = e.target.closest("[data-calendar-card]"); if (!card) return;
    const t = task(card.dataset.calendarCard), range = t && calendarRange(t), handle = e.target.closest("[data-calendar-end]")?.dataset.calendarEnd;
    if (!range || t.source || !(handle || e.altKey) || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const from = handle === "due" ? range.end : range.start;
    const selector = `[data-calendar-card="${CSS.escape(t.id)}"] ${handle ? `[data-calendar-end="${handle}"]` : '[data-action="task-open"]'}`;
    void save(t.id, calendarDateChange(t, from, shiftDate(from, e.key === "ArrowLeft" ? -1 : 1), handle), selector);
  }, true);
  document.addEventListener("toggle", e => { if (e.target.matches(".calendar-unscheduled") && e.target.isConnected) unscheduledOpen = e.target.open; }, true);
  document.addEventListener("change", e => {
    if (e.target.id === "calendar-mode") { mode = e.target.value; storage.set("calendar-mode", mode); renderView(true); }
    if (e.target.id === "agenda-period") { period = e.target.value; storage.set("agenda-period", period); renderView(true); }
    if (e.target.id === "agenda-date" && e.target.value) { anchor = e.target.value; renderView(true); }
  });
  function click(action, el) {
    if (el?.closest("[data-calendar-weekends]")) { weekends = !weekends; storage.set("calendar-weekends", weekends); renderView(true); return true; }
    if (action === "month-prev" || action === "month-next") {
      const direction = action === "month-prev" ? -1 : 1;
      if (mode === "agenda" && period !== "month") anchor = shiftDate(anchor, direction * (period === "week" ? 7 : 1));
      else { const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + direction); anchor = dateKey(date.getTime()); }
      renderView(true); return true;
    }
    if (action === "date-task") { ctx.taskDialog(null, { due: el.dataset.date }); return true; }
    return false;
  }
  document.addEventListener("click", e => { const button = e.target.closest("[data-calendar-weekends]"); if (button) click(null, button); });
  return { render, click };
}
