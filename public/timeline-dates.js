// Date-only calculations use UTC so daylight-saving changes never move a column.
export const DAY = 86400000;
const MONDAY = Date.UTC(1970, 0, 5);
export const stamp = (date) =>
  typeof date === "number" ? date : Date.parse(date);
export const dateKey = (date) =>
  new Date(stamp(date)).toISOString().slice(0, 10);
export const shiftDate = (date, days) => dateKey(stamp(date) + days * DAY);
export const isWeekend = (date) =>
  [0, 6].includes(new Date(stamp(date)).getUTCDay());
export const weekStart = (date) =>
  stamp(date) - ((new Date(stamp(date)).getUTCDay() + 6) % 7) * DAY;

export function validTimelineRange(range) {
  const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value >= "0001-01-01" && Number.isFinite(stamp(value)) && dateKey(value) === value;
  return !!range && valid(range.start) && valid(range.end) && range.start <= range.end &&
    stamp(range.end) - stamp(range.start) <= 3660 * DAY;
}

export function timelineBarBounds(axis, start, end, width, range = null) {
  const left = axis.x(start), right = axis.end(end);
  const outside = !!range && (end < range.start || start > range.end || width <= 0);
  return {
    left: Math.max(0, left),
    width: Math.max(0, Math.min(width, Math.max(left + 12, right)) - Math.max(0, left)),
    outside,
    clippedStart: !!range && start < range.start,
    clippedEnd: !!range && end > range.end,
  };
}

function weekdayIndex(date) {
  const days = Math.floor((stamp(date) - MONDAY) / DAY);
  const weeks = Math.floor(days / 7);
  return weeks * 5 + Math.min(days - weeks * 7, 5);
}
function weekdayDate(index) {
  const weeks = Math.floor(index / 5);
  return MONDAY + (weeks * 7 + index - weeks * 5) * DAY;
}
export function timelineAxis(origin, unit, showWeekends = true) {
  origin = stamp(origin);
  const start = weekdayIndex(origin);
  const x = (date) =>
    (showWeekends ? (stamp(date) - origin) / DAY : weekdayIndex(date) - start) *
    unit;
  return {
    x,
    end: (date) => x(stamp(date) + DAY),
    dateAt: (pixels) =>
      dateKey(
        showWeekends
          ? origin + Math.floor(pixels / unit) * DAY
          : weekdayDate(start + Math.floor(pixels / unit)),
      ),
    shift: (date, days) => {
      if (showWeekends || !days) return shiftDate(date, days);
      return dateKey(
        weekdayDate(
          weekdayIndex(date) + days - (days > 0 && isWeekend(date) ? 1 : 0),
        ),
      );
    },
  };
}

export function weekTitle(date) {
  const start = weekStart(date),
    thursday = start + 3 * DAY;
  const year = new Date(thursday).getUTCFullYear();
  const week =
    Math.round((start - weekStart(Date.UTC(year, 0, 4))) / (7 * DAY)) + 1;
  const format = (value) => dateKey(value).split("-").reverse().join("/");
  return `Week ${week} ${format(start)} to ${format(start + 6 * DAY)}`;
}

export function timelineHeader(origin, unit, showWeekends, scale, width, end = null) {
  const axis = timelineAxis(origin, unit, showWeekends);
  const last = end == null ? stamp(axis.dateAt(width)) : Math.min(stamp(end), stamp(axis.dateAt(width)));
  const months = [],
    ticks = [];
  const first = new Date(stamp(origin));
  for (
    let date = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
    date <= last;
  ) {
    const current = new Date(date);
    const next = Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth() + 1,
      1,
    );
    const left = Math.max(0, axis.x(date)),
      right = Math.min(width, axis.x(next));
    if (right > left)
      months.push({
        left,
        width: right - left,
        label:
          current.toLocaleDateString("en-GB", {
            month: "short",
            timeZone: "UTC",
          }) +
          (current.getUTCMonth() === 0 ? ` ${current.getUTCFullYear()}` : ""),
        title: current.toLocaleDateString("en-GB", {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }),
      });
    date = next;
  }
  const step = scale === "day" ? 1 : 7;
  for (let date = scale === "day" ? stamp(origin) : weekStart(origin); date <= last; date += step * DAY) {
    if (!showWeekends && isWeekend(date)) continue;
    const left = axis.x(date);
    ticks.push({
      left: Math.max(0, left),
      width: Math.min(width - Math.max(0, left), (scale === "day" ? 1 : showWeekends ? 7 : 5) * unit + Math.min(0, left)),
      date: dateKey(date),
      label: String(new Date(date).getUTCDate()),
      weekend: isWeekend(date),
      title:
        scale === "day"
          ? new Date(date).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })
          : weekTitle(date),
    });
  }
  return { months, ticks };
}
