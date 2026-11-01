import type { RequestContext, Input } from "./contracts.js";

export async function input(req: RequestContext["req"]) {
  return req.pencilsInput || {};
}
// Adds a change to the project's audit log (owner request T93), with who made it and when.
export function audit(ctx: RequestContext, entry: Input): Promise<void> {
  // As board activity names people: the sign-in name, or the name the browser gives without sign-in.
  const user = !ctx.auth.enabled ? displayName(ctx.req) : ctx.user?.name || ctx.user?.username;
  return ctx.audit.record(ctx.project, { at: Date.now(), user: String(user), fields: [], ...entry });
}
// The audit log's name and title for a card, document or board record.
export function audited(record: Input | null | undefined): Input {
  const data = record?.data || record || {};
  const kind = { task: "card", document: "document", board: "board" }[String(data.kind)] || String(data.kind);
  return { kind, id: data.id, title: data.title || "", ...(data.key ? { key: data.key } : {}) };
}
export function displayName(req: RequestContext["req"]): string {
  try {
    return decodeURIComponent(
      String(req.headers["x-pencils-name"] || "Shared workspace"),
    ).slice(0, 100);
  } catch {
    return "Shared workspace";
  }
}
export const mime: Record<string, string> = {
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};
