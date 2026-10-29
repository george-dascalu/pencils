// One date vocabulary for the whole app: "14 Oct" for days (with the year when
// it differs from today), "14 Oct 2026, 19:18" for timestamps. Date inputs keep
// the browser locale.
const sameYear = (date) => date.getFullYear() === new Date().getFullYear();
const dayOptions = (date) => ({ day: "numeric", month: "short", ...(sameYear(date) ? {} : { year: "numeric" }) });

export function formatDay(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, dayOptions(date));
}

export function formatMonth(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Date unavailable";
  return `${date.toLocaleDateString(undefined, dayOptions(date))}, ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}
