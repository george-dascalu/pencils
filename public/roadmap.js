// The internal roadmap: every feature request, its status and when it was started and done.
// Updated with every release (owner rule, 31 October 2026); shown as the Roadmap help page.
// status: "requested" | "in progress" | "done"; requested, started and done are YYYY-MM-DD or
// YYYY-MM-DDTHH:MM (local time; blank when not on record; done is when the work finished, the
// release follows within minutes); version is the release.
export const roadmap = [
  { id: "T2", title: "Boards in the sidebar, in folders", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:04", version: "0.20.74" },
  { id: "T3", title: "One New project button", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:11", version: "0.20.75" },
  { id: "T4", title: "Teams settings wording", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:16", version: "0.20.76" },
  { id: "T5", title: "Compact View options on phones", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:28", version: "0.20.77" },
  { id: "T6", title: "View options button like sort", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:38", version: "0.20.78" },
  { id: "T7", title: "Kanban touch drags select no text", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T14:46", version: "0.20.79" },
  { id: "T8", title: "New offers Board and Personal document", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T15:07", version: "0.20.80" },
  { id: "T9", title: "Capacity gauge only past 80%", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T15:19", version: "0.20.81" },
  { id: "T10", title: "Phone board dock by category", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T15:46", version: "0.20.82" },
  { id: "T11", title: "Who is here in the board bar", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:01", version: "0.20.83" },
  { id: "T12", title: "Blur behind the phone sidebar", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:07", version: "0.20.84" },
  { id: "T13", title: "Sidebar organisation and project dropdowns", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:24", version: "0.20.85" },
  { id: "T14", title: "Sidebar menus in the sidebar's colours", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:31", version: "0.20.86" },
  { id: "T15", title: "Date fields open only the app calendar", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:39", version: "0.20.87" },
  { id: "T16", title: "Smaller calendar day numbers", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:45", version: "0.20.88" },
  { id: "T17", title: "Smaller description headings", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T16:56", version: "0.20.89" },
  { id: "T18", title: "Dropdowns fade open and closed", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T17:17", version: "0.20.90" },
  { id: "T19", title: "Attachments adds with a +", status: "done", requested: "", started: "2026-10-31", done: "2026-10-31T17:17", version: "0.20.90" },
  { id: "T20", title: "Board item toolbars in two rows", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T17:40", version: "0.20.91" },
  { id: "T21", title: "Board item toolbar rows scroll sideways", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T17:40", version: "0.20.91" },
  { id: "T22", title: "Personal homepage with panels", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T19:55", version: "0.20.93" },
  { id: "T23", title: "Configurable card properties", status: "done", requested: "2026-10-31", started: "2026-10-31T21:22", done: "2026-10-31T21:34", version: "0.20.97" },
  { id: "T24", title: "Roadmap page", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T18:07", version: "0.20.92" },
  { id: "T25", title: "Documents and Boards list pages (panel over the open item)", status: "done", requested: "2026-10-31", started: "2026-10-31T20:23", done: "2026-10-31T20:42", version: "0.20.96" },
  { id: "T26", title: "A popup's button closes it when pressed again", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T20:16", version: "0.20.94" },
  { id: "T27", title: "Document formatting toolbar always shown, except in Reading view", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T20:16", version: "0.20.94" },
  { id: "T28", title: "Board bar: Session, Version history and Present inside Board tools (⋯)", status: "done", requested: "2026-10-31", started: "2026-10-31", done: "2026-10-31T20:16", version: "0.20.94" },
  { id: "T29", title: "Roadmap shows times and how long each took", status: "done", requested: "2026-10-31T20:05", started: "2026-10-31T20:21", done: "2026-10-31T20:30", version: "0.20.95" },
];

// "31 Oct 20:05" for a date with a time, "31 Oct" for a bare date.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortWhen(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?$/.exec(value || "");
  if (!m) return "";
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}${m[4] ? ` ${m[4]}` : ""}`;
}
// From started to done, when both carry a time: "45m", "2h 15m" or "1d 3h".
export function took(started, done) {
  if (!/T\d{2}:\d{2}$/.test(started || "") || !/T\d{2}:\d{2}$/.test(done || "")) return "";
  const minutes = Math.max(0, Math.round((Date.parse(done) - Date.parse(started)) / 60000));
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), rest = minutes % 60;
  if (days) return `${days}d${hours ? ` ${hours}h` : ""}`;
  if (hours) return `${hours}h${rest ? ` ${rest}m` : ""}`;
  return `${rest}m`;
}
