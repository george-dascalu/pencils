export class Diagnostics {
  constructor() {
    this.started = Date.now();
    this.routes = new Map();
    this.errors = new Map();
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
    };
  }
}
