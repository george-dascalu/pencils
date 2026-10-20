import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

export function staticAssets({ publicDir, builtDir, vendor, mime, production }) {
  const cache = new Map();
  return async (req, res, pathname, headers) => {
    const name = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
    const root = name.startsWith("vendor/editor/") || production && (name === "index.html" || name.startsWith("assets/")) ? builtDir : publicDir;
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || name.includes("..")) return false;
    const source = vendor[pathname] || file;
    let stat;
    try { stat = await fs.stat(source); } catch { return false; }
    if (!stat.isFile()) return false;
    let entry = cache.get(file);
    if (!entry || entry.modified !== stat.mtimeMs || entry.size !== stat.size) {
      const body = await fs.readFile(source);
      const compress = /\.(js|mjs|css|html|svg|json)$/.test(name);
      entry = {
        modified: stat.mtimeMs, size: stat.size, body,
        etag: `W/"${createHash("sha256").update(body).digest("hex")}"`,
        ...(compress && body.length > 1024 ? {
          br: brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } }),
          gzip: gzipSync(body),
        } : {}),
      };
      cache.set(file, entry);
    }
    const common = {
      ...headers, "Content-Type": mime[path.extname(file)] || "application/octet-stream",
      "Cache-Control": production && /^assets\/[\w-]+-[A-Z\d]{8}\.(js|css)$/.test(name) ? "public, max-age=31536000, immutable" : "no-cache",
      ETag: entry.etag, Vary: "Accept-Encoding",
    };
    if (req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, common); res.end(); return true;
    }
    const accepted = String(req.headers["accept-encoding"] || "").split(",").map(value => {
      const [name, q] = value.trim().split(/;\s*q=/);
      return { name, q: q === undefined ? 1 : Number(q) };
    }).filter(value => value.q > 0).sort((a, b) => b.q - a.q);
    const encoding = accepted.find(({ name }) => ["br", "gzip"].includes(name) && entry[name])?.name;
    const body = encoding ? entry[encoding] : entry.body;
    res.writeHead(200, { ...common, ...(encoding ? { "Content-Encoding": encoding } : {}), "Content-Length": body.length });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  };
}
