import { DAY, dateKey, shiftDate, stamp, weekStart, isWeekend } from "./timeline-dates.js";

export function calendarRange(task) {
  if (!task.start && !task.due) return null;
  const start = task.start || task.due, end = task.due || task.start;
  return { start: start < end ? start : end, end: end > start ? end : start };
}

// Move the grabbed day, preserving duration and any intentionally unset date.
export function calendarDateChange(task, grabbed, target, handle = null) {
  const range = calendarRange(task);
  if (!range) return { due: target };
  const overnight = task.start_time && task.due_time && task.start_time >= task.due_time;
  if (handle === "start") {
    const latest = overnight ? shiftDate(range.end, -1) : range.end;
    return { start: target > latest ? latest : target, ...(!task.due ? { due: range.end } : {}) };
  }
  if (handle === "due") {
    const earliest = overnight ? shiftDate(range.start, 1) : range.start;
    return { due: target < earliest ? earliest : target, ...(!task.start ? { start: range.start } : {}) };
  }
  const delta = (Date.parse(target) - Date.parse(grabbed)) / DAY;
  return {
    ...(task.start ? { start: shiftDate(task.start, delta) } : {}),
    ...(task.due ? { due: shiftDate(task.due, delta) } : {}),
  };
}

// The six weeks of the month holding `anchor`, or with { week: true } the anchor's own week.
export function calendarWeeks(tasks, anchor, weekends = true, { week: one = false } = {}) {
  const first = dateKey(weekStart(one ? anchor : `${anchor.slice(0, 7)}-01`));
  const weeks = Array.from({ length: one ? 1 : 6 }, (_, week) => {
    const days = Array.from({ length: weekends ? 7 : 5 }, (_, day) => shiftDate(first, week * 7 + day));
    const lanes = [], segments = [];
    for (const task of tasks) {
      const range = calendarRange(task);
      if (!range) continue;
      const columns = days.map((day, i) => day >= range.start && day <= range.end ? i : -1).filter(i => i >= 0);
      if (!columns.length) continue;
      const from = columns[0], to = columns.at(-1);
      let lane = lanes.findIndex(occupied => columns.every(i => !occupied.has(i)));
      if (lane < 0) { lane = lanes.length; lanes.push(new Set()); }
      columns.forEach(i => lanes[lane].add(i));
      segments.push({ task, from, to, lane, range });
    }
    return { days, segments, lanes: Math.max(1, lanes.length) };
  });
  const ends = new Map();
  for (const week of weeks) for (const segment of week.segments) {
    if (!ends.has(segment.task.id)) ends.set(segment.task.id, { first: segment, last: segment });
    else ends.get(segment.task.id).last = segment;
  }
  for (const { first, last } of ends.values()) { first.resizeStart = true; last.resizeEnd = true; }
  return weeks;
}

export function agendaGroups(tasks, from, to, weekends = true) {
  const groups = new Map();
  for (const task of tasks) {
    const range = calendarRange(task);
    if (!range || range.start > to || range.end < from) continue;
    let day = range.start < from ? from : range.start;
    while (!weekends && isWeekend(day)) day = shiftDate(day, 1);
    if (day > to || day > range.end) continue;
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(task);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b));
}

// Agenda ranges: a quick range, worked out from today, or dates a person picked.
export const AGENDA_RANGES = [
  ["today", "Today"], ["tomorrow", "Tomorrow"], ["this-week", "This week"], ["next-week", "Next week"],
  ["this-month", "This month"], ["next-month", "Next month"], ["next-7", "Next 7 days"], ["next-14", "Next 14 days"], ["next-30", "Next 30 days"],
];
const month = (day, offset) => {
  const d = new Date(`${day.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + offset);
  const from = dateKey(d.getTime());
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { from, to: shiftDate(dateKey(d.getTime()), -1) };
};
const validDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(stamp(value)) && dateKey(value) === value;
export function agendaQuickRange(quick, today) {
  const week = dateKey(weekStart(today)), ahead = Number(/^next-(\d+)$/.exec(quick)?.[1]);
  if (quick === "today") return { from: today, to: today };
  if (quick === "tomorrow") return { from: shiftDate(today, 1), to: shiftDate(today, 1) };
  if (quick === "next-week") return { from: shiftDate(week, 7), to: shiftDate(week, 13) };
  if (quick === "this-month") return month(today, 0);
  if (quick === "next-month") return month(today, 1);
  if (ahead) return { from: today, to: shiftDate(today, ahead - 1) };
  return { from: week, to: shiftDate(week, 6) };
}
// The range shown: chosen dates when valid (at most a year), else the quick range.
export function agendaRange({ quick, from, to } = {}, today) {
  if (validDay(from) && validDay(to) && from <= to && stamp(to) - stamp(from) <= 366 * DAY) return { from, to, quick: "" };
  const key = AGENDA_RANGES.some(([k]) => k === quick) ? quick : "this-week";
  return { ...agendaQuickRange(key, today), quick: key };
}
// Previous and next keep the range's length; whole months move by month.
export function shiftAgendaRange({ from, to }, direction) {
  const months = from.slice(8) === "01" && shiftDate(to, 1).slice(8) === "01"
    ? (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1 : 0;
  if (months) {
    const start = month(from, direction * months).from;
    return { from: start, to: month(start, months - 1).to };
  }
  const days = Math.round((stamp(to) - stamp(from)) / DAY) + 1;
  return { from: shiftDate(from, direction * days), to: shiftDate(to, direction * days) };
}
