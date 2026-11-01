import type { RequestContext } from "./contracts.js";

export async function input(req: RequestContext["req"]) {
  return req.pencilsInput || {};
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
