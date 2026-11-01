// The server's last 200 errors and warnings, for Settings → Debug (owner request T96): what it
// writes with console.error and console.warn, which still reach its log.
const LIMIT = 200;
export const serverLog = [];
const text = (value) => {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "(a value that can't be shown)";
    }
  }
};
for (const level of ["error", "warn"]) {
  const write = console[level];
  console[level] = (...args) => {
    serverLog.push({ at: Date.now(), level, message: args.map(text).join(" ").slice(0, 4000) });
    if (serverLog.length > LIMIT) serverLog.shift();
    write.apply(console, args);
  };
}

export class Diagnostics {
  constructor() {
    this.started = Date.now();
    this.routes = new Map();
    this.errors = new Map();
    this.failures = [];
  }
  // A failed request keeps its method, path (without the query, which may hold search terms) and
  // the error message it answered with.
  failure(method, path, status, duration, message) {
    this.failures.push({ at: Date.now(), method, path, status, ms: Math.round(duration), message: message || "" });
    if (this.failures.length > LIMIT) this.failures.shift();
  }
  request(route, duration, status) {
    const key = route
      .replace(/\b[ptbs]-[\w-]+\b/g, ":id")
      .replace(/\/attachments\/[^/]+/g, "/attachments/:file");
    const old = this.routes.get(key) || { count: 0, total_ms: 0, max_ms: 0 };
    old.count++;
    old.total_ms += duration;
    old.max_ms = Math.max(old.max_ms, duration);
    this.routes.set(key, old);
    if (this.routes.size > 100)
      this.routes.delete(this.routes.keys().next().value);
    if (status >= 400)
      this.errors.set(
        String(status),
        (this.errors.get(String(status)) || 0) + 1,
      );
  }
  report() {
    return {
      uptime_seconds: Math.round((Date.now() - this.started) / 1000),
      requests: [...this.routes].map(([route, m]) => ({
        route,
        count: m.count,
        mean_ms: Math.round(m.total_ms / m.count),
        max_ms: Math.round(m.max_ms),
      })),
      errors: Object.fromEntries(this.errors),
      failures: [...this.failures].reverse(),
      log: [...serverLog].reverse(),
    };
  }
}
