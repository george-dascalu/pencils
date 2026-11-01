// What failed in this browser, for Settings → Debug (owner request T96, 1 November 2026): failed
// API calls, uncaught errors and console errors, the last 100, kept for the tab's session so a
// reload doesn't lose them.
const KEY = "pencils:debug-log",
  LIMIT = 100;
let entries = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY));
  if (Array.isArray(saved)) entries = saved;
} catch {
  /* Private windows can refuse storage; the list then lasts until a reload. */
}
const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* As above. */
  }
};
// Text for a logged value that can't throw, whatever it is.
export function describe(value) {
  try {
    return value instanceof Error ? value.message : typeof value === "string" ? value : String(value);
  } catch {
    return "(a value that can't be shown)";
  }
}
// Never throws: recording a failure mustn't hide the failure.
export function recordFailure(entry) {
  try {
    entries.push({ at: Date.now(), ...entry, message: describe(entry.message ?? "").slice(0, 2000) });
    if (entries.length > LIMIT) entries = entries.slice(-LIMIT);
    save();
  } catch {
    /* As above. */
  }
}
// Newest first.
export const debugEntries = () => [...entries].reverse();
export function clearDebugLog() {
  entries = [];
  save();
}

// Called once when the app starts.
export function installDebugLog() {
  addEventListener("error", (event) => recordFailure({ kind: "error", message: event.message || String(event.error), source: event.filename ? `${event.filename.split("/").pop()}:${event.lineno}` : "" }));
  addEventListener("unhandledrejection", (event) => recordFailure({ kind: "error", message: event.reason?.message || String(event.reason) }));
  const consoleError = console.error;
  console.error = (...args) => {
    recordFailure({ kind: "console", message: args.map(describe).join(" ") });
    consoleError.apply(console, args);
  };
}
